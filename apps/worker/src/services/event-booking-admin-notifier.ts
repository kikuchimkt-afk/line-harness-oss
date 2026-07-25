import { LineClient } from '@line-crm/line-sdk';

const EVENT_NOTICE_RECIPIENTS_KEY = 'incoming_notice_recipients';

type EventBookingAdminNoticeStatus = 'requested' | 'confirmed';

export interface EventBookingAdminNoticeContext {
  accountName: string;
  friendName: string | null;
  eventName: string;
  startsAtJstList: string[];
  status: EventBookingAdminNoticeStatus;
  adminBookingUrl?: string | null;
}

export interface NotifyEventBookingAdminRecipientsParams {
  db: D1Database;
  channelAccessToken: string;
  lineAccountId: string;
  bookingFriendId: string;
  friendName: string | null;
  eventName: string;
  startsAtJstList: string[];
  status: EventBookingAdminNoticeStatus;
  adminBookingUrl?: string | null;
  sendText?: (toLineUserId: string, text: string) => Promise<void>;
}

type NoticeRecipient = {
  id: string;
  line_user_id: string;
};

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function buildEventAdminBookingUrl(
  adminPublicUrl: string | undefined,
  eventId: string,
): string | null {
  const base = adminPublicUrl?.trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/events/bookings?id=${encodeURIComponent(eventId)}`;
}

export function renderEventBookingAdminNoticeText(
  ctx: EventBookingAdminNoticeContext,
): string {
  const startsAt = uniqueNonEmptyStrings(ctx.startsAtJstList);
  const statusLabel = ctx.status === 'requested' ? '承認待ち' : '確定';
  const lines = [
    '📅 イベント予約が入りました',
    '',
    `アカウント：${ctx.accountName}`,
    `予約者：${ctx.friendName?.trim() || '名前なし'}`,
    `イベント：${ctx.eventName}`,
    `予約件数：${startsAt.length}件`,
    `状態：${statusLabel}`,
    '',
    '予約日時：',
    ...startsAt.map((value) => `・${value}`),
  ];
  if (ctx.adminBookingUrl) {
    lines.push('', '予約内容を確認：', ctx.adminBookingUrl);
  } else {
    lines.push('', 'L Harnessのイベント予約管理で確認してください。');
  }
  return lines.join('\n');
}

export async function notifyEventBookingAdminRecipients(
  params: NotifyEventBookingAdminRecipientsParams,
): Promise<{ sent: number }> {
  const setting = await params.db
    .prepare(`SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?`)
    .bind(params.lineAccountId, EVENT_NOTICE_RECIPIENTS_KEY)
    .first<{ value: string | null }>();

  let recipientIds: string[] = [];
  if (setting?.value) {
    try {
      const parsed = JSON.parse(setting.value);
      recipientIds = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      recipientIds = [];
    }
  }
  recipientIds = uniqueNonEmptyStrings(recipientIds)
    .filter((id) => id !== params.bookingFriendId);
  if (recipientIds.length === 0) return { sent: 0 };

  const account = await params.db
    .prepare(`SELECT name FROM line_accounts WHERE id = ?`)
    .bind(params.lineAccountId)
    .first<{ name: string | null }>();

  const placeholders = recipientIds.map(() => '?').join(',');
  const recipients = await params.db
    .prepare(
      `SELECT id, line_user_id
       FROM friends
       WHERE line_account_id = ?
         AND is_following = 1
         AND id IN (${placeholders})`,
    )
    .bind(params.lineAccountId, ...recipientIds)
    .all<NoticeRecipient>();
  if (recipients.results.length === 0) return { sent: 0 };

  const text = renderEventBookingAdminNoticeText({
    accountName: account?.name ?? 'LINE公式アカウント',
    friendName: params.friendName,
    eventName: params.eventName,
    startsAtJstList: params.startsAtJstList,
    status: params.status,
    adminBookingUrl: params.adminBookingUrl,
  });
  const client = params.sendText ? null : new LineClient(params.channelAccessToken);
  const sendText = params.sendText
    ?? ((toLineUserId: string, message: string) => client!.pushTextMessage(toLineUserId, message));

  let sent = 0;
  for (const recipient of recipients.results) {
    try {
      await sendText(recipient.line_user_id, text);
      sent += 1;
    } catch (err) {
      console.error(`[event-booking] admin notice failed recipient=${recipient.id}`, err);
    }
  }
  return { sent };
}
