// FIFO promotion for event-booking waitlists.
//
// Promotion is intentionally split from LINE delivery/reminder creation. This
// service performs only the capacity-safe state transition and returns the
// promoted booking ids to the route layer for best-effort side effects.

interface WaitlistSlotPolicyRow {
  capacity: number | null;
  starts_at: string;
  waitlist_enabled: number;
  cancel_deadline_hours_before: number | null;
}

interface WaitlistedBookingRow {
  id: string;
}

export interface PromoteEventWaitlistParams {
  slotId: string;
  now?: Date;
  maxPromotions?: number;
}

export interface PromoteEventWaitlistResult {
  promotedBookingIds: string[];
  reason: 'filled' | 'disabled' | 'unlimited' | 'cutoff_passed' | 'no_waitlist';
}

export function isBeforeEventWaitlistCutoff(
  startsAt: string,
  cancelDeadlineHoursBefore: number | null,
  now = new Date(),
): boolean {
  if (cancelDeadlineHoursBefore == null || cancelDeadlineHoursBefore <= 0) return false;
  const startsAtMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsAtMs)) return false;
  return now.getTime() < startsAtMs - cancelDeadlineHoursBefore * 3600_000;
}

export async function promoteEventWaitlist(
  db: D1Database,
  params: PromoteEventWaitlistParams,
): Promise<PromoteEventWaitlistResult> {
  const now = params.now ?? new Date();
  const policy = await db
    .prepare(
      `SELECT s.capacity, s.starts_at,
              e.waitlist_enabled, e.cancel_deadline_hours_before
         FROM event_slots s
         JOIN events e ON e.id = s.event_id
        WHERE s.id = ?
          AND s.deleted_at IS NULL
          AND s.is_active = 1
          AND e.deleted_at IS NULL`,
    )
    .bind(params.slotId)
    .first<WaitlistSlotPolicyRow>();

  if (!policy || policy.waitlist_enabled !== 1) {
    return { promotedBookingIds: [], reason: 'disabled' };
  }
  if (policy.capacity == null) {
    return { promotedBookingIds: [], reason: 'unlimited' };
  }
  if (!isBeforeEventWaitlistCutoff(
    policy.starts_at,
    policy.cancel_deadline_hours_before,
    now,
  )) {
    return { promotedBookingIds: [], reason: 'cutoff_passed' };
  }

  const promotedBookingIds: string[] = [];
  const promotionLimit = Math.max(1, params.maxPromotions ?? policy.capacity);
  const nowIso = now.toISOString();

  for (let attempt = 0; attempt < promotionLimit; attempt += 1) {
    const next = await db
      .prepare(
        `SELECT id
           FROM event_bookings
          WHERE slot_id = ? AND status = 'waitlisted'
          ORDER BY requested_at ASC, id ASC
          LIMIT 1`,
      )
      .bind(params.slotId)
      .first<WaitlistedBookingRow>();
    if (!next) {
      return {
        promotedBookingIds,
        reason: promotedBookingIds.length > 0 ? 'filled' : 'no_waitlist',
      };
    }

    // Capacity is checked in the same statement as the status CAS. Concurrent
    // cancellations/promotions therefore cannot confirm more than capacity.
    const update = await db
      .prepare(
        `UPDATE event_bookings
            SET status = 'confirmed', promoted_at = ?, decided_at = ?, updated_at = ?
          WHERE id = ?
            AND status = 'waitlisted'
            AND (
              SELECT COUNT(*)
                FROM event_bookings active
               WHERE active.slot_id = ?
                 AND active.status IN ('requested','confirmed')
            ) < ?`,
      )
      .bind(nowIso, nowIso, nowIso, next.id, params.slotId, policy.capacity)
      .run();

    if ((update.meta?.changes ?? 0) > 0) {
      promotedBookingIds.push(next.id);
      continue;
    }

    // A competing request may have filled the last seat or moved this row.
    // Re-read capacity before retrying with the next FIFO candidate.
    const active = await db
      .prepare(
        `SELECT COUNT(*) AS c
           FROM event_bookings
          WHERE slot_id = ? AND status IN ('requested','confirmed')`,
      )
      .bind(params.slotId)
      .first<{ c: number }>();
    if ((active?.c ?? 0) >= policy.capacity) break;
  }

  return { promotedBookingIds, reason: 'filled' };
}
