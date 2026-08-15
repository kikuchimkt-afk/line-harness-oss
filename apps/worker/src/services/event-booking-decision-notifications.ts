import type {
  EventBookingNotificationSender,
  EventNotificationContext,
} from './event-booking-notifier.js';
import type { IndividualNotificationBudget } from './individual-notification-budget.js';

export type EventBookingDecisionNotificationKind = 'confirmed' | 'rejected';

export interface QueueEventBookingDecisionNotificationInput {
  lineAccountId: string;
  eventId: string;
  friendId: string;
  kind: EventBookingDecisionNotificationKind;
  ctx: EventNotificationContext;
  scheduledAt: string;
  notificationDisabled?: boolean;
}

export async function enqueueEventBookingDecisionNotification(
  db: D1Database,
  input: QueueEventBookingDecisionNotificationInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO event_booking_decision_notifications
         (id, line_account_id, event_id, friend_id, kind, context_json,
          scheduled_at, notification_disabled, status, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
    )
    .bind(
      crypto.randomUUID(),
      input.lineAccountId,
      input.eventId,
      input.friendId,
      input.kind,
      JSON.stringify(input.ctx),
      input.scheduledAt,
      input.notificationDisabled ? 1 : 0,
    )
    .run();
}

interface DueDecisionNotificationRow {
  id: string;
  line_account_id: string;
  friend_id: string;
  kind: EventBookingDecisionNotificationKind;
  context_json: string;
  notification_disabled: number;
  retry_count: number;
  channel_access_token: string;
  line_user_id: string;
}

const MAX_RETRY = 3;

export interface ProcessDueDecisionNotificationsParams {
  now: Date;
  sender: EventBookingNotificationSender;
  budget?: IndividualNotificationBudget;
}

export async function processDueEventBookingDecisionNotifications(
  db: D1Database,
  params: ProcessDueDecisionNotificationsParams,
): Promise<{ sent: number; failed: number }> {
  const due = await db
    .prepare(
      `SELECT n.id, n.line_account_id, n.friend_id, n.kind, n.context_json,
              n.notification_disabled, n.retry_count,
              la.channel_access_token, f.line_user_id
         FROM event_booking_decision_notifications n
         INNER JOIN line_accounts la ON la.id = n.line_account_id
         INNER JOIN friends f ON f.id = n.friend_id
        WHERE n.status IN ('pending','failed')
          AND n.scheduled_at <= ?
        ORDER BY n.scheduled_at ASC
        LIMIT 100`,
    )
    .bind(params.now.toISOString())
    .all<DueDecisionNotificationRow>();

  let sent = 0;
  let failed = 0;

  for (const row of due.results ?? []) {
    const reservation = params.budget?.reserve();
    if (params.budget && !reservation) break;
    let claimedRetry: number | null = null;
    try {
      const claim = await db
        .prepare(
          `UPDATE event_booking_decision_notifications
              SET retry_count = retry_count + 1
            WHERE id = ? AND retry_count = ? AND status IN ('pending','failed')`,
        )
        .bind(row.id, row.retry_count)
        .run();
      if ((claim.meta?.changes ?? 0) === 0) continue;

      claimedRetry = row.retry_count + 1;
      const ctx = JSON.parse(row.context_json) as EventNotificationContext;
      reservation?.commit();
      await params.sender({
        channelAccessToken: row.channel_access_token,
        toLineUserId: row.line_user_id,
        kind: row.kind,
        ctx,
        notificationDisabled: row.notification_disabled === 1,
        db,
        friendId: row.friend_id,
        lineAccountId: row.line_account_id,
      });
      await db
        .prepare(
          `UPDATE event_booking_decision_notifications
              SET status = 'sent', sent_at = ?, last_error = NULL
            WHERE id = ?`,
        )
        .bind(params.now.toISOString(), row.id)
        .run();
      sent += 1;
    } catch (error) {
      if (claimedRetry === null) throw error;
      const nextStatus = claimedRetry >= MAX_RETRY ? 'failed_permanent' : 'failed';
      await db
        .prepare(
          `UPDATE event_booking_decision_notifications
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

export const _internals = { MAX_RETRY };
