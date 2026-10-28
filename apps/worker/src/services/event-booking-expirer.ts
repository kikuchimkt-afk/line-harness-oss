// Cron handler: keep approval requests pending, close waitlist rows at the
// event's shared promotion/cancellation cutoff, and purge idempotency rows.

import { purgeExpiredEventIdempotency } from './event-booking-idempotency.js';

export interface RunEventBookingExpirerParams {
  now: Date;
}

export async function runEventBookingExpirer(
  db: D1Database,
  params: RunEventBookingExpirerParams,
): Promise<{ expired: number; idempotencyPurged: number }> {
  const nowIso = params.now.toISOString();
  const expiredResult = await db
    .prepare(
      `UPDATE event_bookings
          SET status = 'expired', decided_at = ?, updated_at = ?
        WHERE status = 'waitlisted'
          AND EXISTS (
            SELECT 1
              FROM event_slots s
              JOIN events e ON e.id = s.event_id
             WHERE s.id = event_bookings.slot_id
               AND e.waitlist_enabled = 1
               AND e.cancel_deadline_hours_before IS NOT NULL
               AND julianday(s.starts_at) - (e.cancel_deadline_hours_before / 24.0) <= julianday(?)
          )`,
    )
    .bind(nowIso, nowIso, nowIso)
    .run();
  const idempotencyPurged = await purgeExpiredEventIdempotency(db, params.now);
  return { expired: expiredResult.meta?.changes ?? 0, idempotencyPurged };
}
