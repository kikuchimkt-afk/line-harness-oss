import { describe, expect, it } from 'vitest';
import {
  TEMPORARY_UAT_NOTIFICATION_RUN_ID,
  shouldSuppressTemporaryUatBookingNotifications,
} from './temporary-uat-notification-suppression.js';

const AIZUMI_EVENT_ID = '0ee01c75-3647-40a3-b40b-0d66edf2359f';
const UNIVERSITY_EVENT_ID = '0b993dea-5d8c-4256-9783-36a33574c2e7';

describe('temporary UAT booking notification suppression', () => {
  it('matches only the exact run marker in message or student_name for the two UAT events', () => {
    expect(shouldSuppressTemporaryUatBookingNotifications(AIZUMI_EVENT_ID, {
      message: TEMPORARY_UAT_NOTIFICATION_RUN_ID,
    })).toBe(true);
    expect(shouldSuppressTemporaryUatBookingNotifications(UNIVERSITY_EVENT_ID, JSON.stringify({
      student_name: TEMPORARY_UAT_NOTIFICATION_RUN_ID,
    }))).toBe(true);
  });

  it('does not suppress ordinary or out-of-scope bookings', () => {
    expect(shouldSuppressTemporaryUatBookingNotifications(AIZUMI_EVENT_ID, {
      message: `${TEMPORARY_UAT_NOTIFICATION_RUN_ID}-extra`,
    })).toBe(false);
    expect(shouldSuppressTemporaryUatBookingNotifications(AIZUMI_EVENT_ID, {
      guardian_name: TEMPORARY_UAT_NOTIFICATION_RUN_ID,
    })).toBe(false);
    expect(shouldSuppressTemporaryUatBookingNotifications('unrelated-event', {
      message: TEMPORARY_UAT_NOTIFICATION_RUN_ID,
    })).toBe(false);
    expect(shouldSuppressTemporaryUatBookingNotifications(AIZUMI_EVENT_ID, '{bad json')).toBe(false);
  });
});
