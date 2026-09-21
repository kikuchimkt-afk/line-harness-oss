/**
 * TEMPORARY UAT safeguard for RUN_ID UAT-20260922-K7M4Q9.
 *
 * Remove this module, its route call sites, and its tests, then redeploy the
 * Worker immediately after this UAT run is complete. The event allow-list and
 * exact form-answer marker deliberately keep the temporary behavior from
 * affecting ordinary bookings.
 */
export const TEMPORARY_UAT_NOTIFICATION_RUN_ID = 'UAT-20260922-K7M4Q9';

export const TEMPORARY_UAT_NOTIFICATION_EVENT_IDS = new Set([
  '0ee01c75-3647-40a3-b40b-0d66edf2359f',
  '0b993dea-5d8c-4256-9783-36a33574c2e7',
]);

function parseFormAnswers(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function shouldSuppressTemporaryUatBookingNotifications(
  eventId: string,
  formAnswers: unknown,
): boolean {
  if (!TEMPORARY_UAT_NOTIFICATION_EVENT_IDS.has(eventId)) return false;
  const answers = parseFormAnswers(formAnswers);
  if (!answers) return false;
  return (
    answers.message === TEMPORARY_UAT_NOTIFICATION_RUN_ID ||
    answers.student_name === TEMPORARY_UAT_NOTIFICATION_RUN_ID
  );
}
