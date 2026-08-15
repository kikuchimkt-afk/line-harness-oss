import { LineClient } from '@line-crm/line-sdk';
import type { Message } from '@line-crm/line-sdk';
import { jstNow } from '@line-crm/db';
import { extractFlexAltText } from '../utils/flex-alt-text.js';
import type { IndividualNotificationBudget } from './individual-notification-budget.js';

export type ScheduledChatMessageType = 'text' | 'image' | 'flex';

export interface EnqueueScheduledChatMessageInput {
  chatId: string;
  friendId: string;
  lineAccountId?: string | null;
  messageType: ScheduledChatMessageType;
  content: string;
  scheduledAt: string;
  notificationDisabled?: boolean;
}

export async function enqueueScheduledChatMessage(
  db: D1Database,
  input: EnqueueScheduledChatMessageInput,
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO scheduled_chat_messages
         (id, chat_id, friend_id, line_account_id, message_type, content,
          scheduled_at, notification_disabled, status, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
    )
    .bind(
      id,
      input.chatId,
      input.friendId,
      input.lineAccountId ?? null,
      input.messageType,
      input.content,
      input.scheduledAt,
      input.notificationDisabled ? 1 : 0,
    )
    .run();
  return id;
}

interface DueScheduledChatMessageRow {
  id: string;
  chat_id: string;
  friend_id: string;
  line_account_id: string | null;
  message_type: ScheduledChatMessageType;
  content: string;
  notification_disabled: number;
  retry_count: number;
  channel_access_token: string | null;
  line_user_id: string;
}

const MAX_RETRY = 3;

function buildLineMessage(
  messageType: ScheduledChatMessageType,
  content: string,
): Message {
  if (messageType === 'text') {
    return { type: 'text', text: content };
  }
  if (messageType === 'image') {
    const parsed = JSON.parse(content) as {
      originalContentUrl: string;
      previewImageUrl: string;
    };
    return {
      type: 'image',
      originalContentUrl: parsed.originalContentUrl,
      previewImageUrl: parsed.previewImageUrl,
    };
  }
  const contents = JSON.parse(content);
  return {
    type: 'flex',
    altText: extractFlexAltText(contents),
    contents,
  };
}

export async function processDueScheduledChatMessages(
  db: D1Database,
  params: {
    now: Date;
    defaultChannelAccessToken: string;
    budget?: IndividualNotificationBudget;
  },
): Promise<{ sent: number; failed: number }> {
  const due = await db
    .prepare(
      `SELECT q.id, q.chat_id, q.friend_id, q.line_account_id,
              q.message_type, q.content, q.notification_disabled, q.retry_count,
              la.channel_access_token, f.line_user_id
         FROM scheduled_chat_messages q
         INNER JOIN friends f ON f.id = q.friend_id
         LEFT JOIN line_accounts la ON la.id = q.line_account_id
        WHERE q.status IN ('pending', 'failed')
          AND q.scheduled_at <= ?
        ORDER BY q.scheduled_at ASC, q.created_at ASC
        LIMIT 100`,
    )
    .bind(params.now.toISOString())
    .all<DueScheduledChatMessageRow>();

  let sent = 0;
  let failed = 0;

  for (const row of due.results ?? []) {
    const reservation = params.budget?.reserve();
    if (params.budget && !reservation) break;
    let claimedRetry: number | null = null;
    try {
      const claim = await db
        .prepare(
          `UPDATE scheduled_chat_messages
              SET retry_count = retry_count + 1
            WHERE id = ? AND retry_count = ? AND status IN ('pending', 'failed')`,
        )
        .bind(row.id, row.retry_count)
        .run();
      if ((claim.meta?.changes ?? 0) === 0) continue;

      claimedRetry = row.retry_count + 1;
      const client = new LineClient(
        row.channel_access_token || params.defaultChannelAccessToken,
      );
      const message = buildLineMessage(row.message_type, row.content);
      reservation?.commit();
      await client.pushMessage(
        row.line_user_id,
        [message],
        row.notification_disabled === 1
          ? { notificationDisabled: true }
          : undefined,
      );

      const sentAt = jstNow();
      const logId = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            `INSERT INTO messages_log
               (id, friend_id, direction, message_type, content, source,
                line_account_id, created_at)
             VALUES (?, ?, 'outgoing', ?, ?, 'manual', ?, ?)`,
          )
          .bind(
            logId,
            row.friend_id,
            row.message_type,
            row.content,
            row.line_account_id,
            sentAt,
          ),
        db
          .prepare(
            `UPDATE chats
                SET status = 'in_progress', last_message_at = ?, updated_at = ?
              WHERE id = ?`,
          )
          .bind(sentAt, sentAt, row.chat_id),
        db
          .prepare(
            `UPDATE scheduled_chat_messages
                SET status = 'sent', sent_at = ?, last_error = NULL
              WHERE id = ?`,
          )
          .bind(params.now.toISOString(), row.id),
      ]);
      sent += 1;
    } catch (error) {
      if (claimedRetry === null) throw error;
      const nextStatus = claimedRetry >= MAX_RETRY ? 'failed_permanent' : 'failed';
      await db
        .prepare(
          `UPDATE scheduled_chat_messages
              SET status = ?, last_error = ?
            WHERE id = ?`,
        )
        .bind(
          nextStatus,
          error instanceof Error ? error.message : String(error),
          row.id,
        )
        .run();
      failed += 1;
    } finally {
      reservation?.release();
    }
  }

  return { sent, failed };
}

export const _internals = { MAX_RETRY, buildLineMessage };
