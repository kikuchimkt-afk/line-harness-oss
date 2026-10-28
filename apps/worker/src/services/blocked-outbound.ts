import { filterUnblockedFriendIds, getFriendBlockMutationGuard, isFriendBlocked, isLineUserBlocked } from './friend-block-policy.js';

export async function filterUnblockedRecipients<T extends { id: string }>(db: D1Database, recipients: T[]): Promise<T[]> {
  const allowed = new Set(await filterUnblockedFriendIds(db, recipients.map(r => r.id)));
  return recipients.filter(r => allowed.has(r.id));
}

export const BLOCKED_OUTBOUND_REASON = 'FRIEND_BLOCKED: ブロックタグにより送信を停止しました';

/** A block-tag mutation cancels work permanently; removing the tag is not replay. */
export async function cancelBlockedFriendOutboundWork(
  db: D1Database, friendId: string, accountId?: string | null,
): Promise<void> {
  const guard = await getFriendBlockMutationGuard(db, friendId, accountId);
  if (!guard) return;
  await db.batch([
    db.prepare(`UPDATE friend_reminders SET status = 'cancelled' WHERE friend_id = ? AND status = 'active' AND ${guard.sql}`).bind(friendId, ...guard.bindings),
    db.prepare(`UPDATE scheduled_chat_messages SET status = 'cancelled', last_error = ? WHERE friend_id = ? AND status IN ('pending','failed') AND ${guard.sql}`).bind(BLOCKED_OUTBOUND_REASON, friendId, ...guard.bindings),
    db.prepare(`UPDATE event_booking_decision_notifications SET status = 'cancelled', last_error = ? WHERE friend_id = ? AND status IN ('pending','failed') AND ${guard.sql}`).bind(BLOCKED_OUTBOUND_REASON, friendId, ...guard.bindings),
    db.prepare(`UPDATE booking_reminders SET status = 'cancelled', last_error = ? WHERE booking_id IN (SELECT id FROM bookings WHERE friend_id = ?) AND status IN ('pending','failed') AND ${guard.sql}`).bind(BLOCKED_OUTBOUND_REASON, friendId, ...guard.bindings),
    db.prepare(`UPDATE event_booking_reminders SET status = 'cancelled', last_error = ? WHERE booking_id IN (SELECT id FROM event_bookings WHERE friend_id = ?) AND status IN ('pending','failed') AND ${guard.sql}`).bind(BLOCKED_OUTBOUND_REASON, friendId, ...guard.bindings),
  ]);
}

/** Queue rows always have friend IDs in production; keep legacy sender support. */
export async function isBlockedNotificationTarget(
  db: D1Database,
  target: { friend_id?: string; line_user_id: string; line_account_id?: string | null },
): Promise<boolean> {
  return target.friend_id
    ? isFriendBlocked(db, target.friend_id)
    : isLineUserBlocked(db, target.line_user_id, target.line_account_id ?? null);
}
