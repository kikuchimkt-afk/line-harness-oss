// Cron handler: keep event approval requests pending until an operator decides,
// while still purging expired idempotency rows used for duplicate-submit safety.

import { purgeExpiredEventIdempotency } from './event-booking-idempotency.js';

export interface RunEventBookingExpirerParams {
  now: Date;
}

export async function runEventBookingExpirer(
  db: D1Database,
  params: RunEventBookingExpirerParams,
): Promise<{ expired: number; idempotencyPurged: number }> {
  const idempotencyPurged = await purgeExpiredEventIdempotency(db, params.now);
  return { expired: 0, idempotencyPurged };
}
