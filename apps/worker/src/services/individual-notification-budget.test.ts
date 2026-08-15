import { describe, expect, test } from 'vitest';
import {
  MAX_INDIVIDUAL_NOTIFICATIONS_PER_CRON,
  createIndividualNotificationBudget,
} from './individual-notification-budget.js';

describe('individual notification budget', () => {
  test('a reservation only consumes capacity after commit', () => {
    const budget = createIndividualNotificationBudget(1);
    const reservation = budget.reserve();

    expect(reservation).not.toBeNull();
    expect(budget.used).toBe(0);
    expect(budget.remaining).toBe(0);
    expect(budget.reserve()).toBeNull();

    reservation?.release();
    expect(budget.remaining).toBe(1);

    budget.reserve()?.commit();
    expect(budget.used).toBe(1);
    expect(budget.remaining).toBe(0);
  });

  test('the requested limit can never exceed the Cron-wide maximum', () => {
    const budget = createIndividualNotificationBudget(500);

    expect(budget.limit).toBe(MAX_INDIVIDUAL_NOTIFICATIONS_PER_CRON);
    for (let i = 0; i < MAX_INDIVIDUAL_NOTIFICATIONS_PER_CRON; i++) {
      budget.reserve()?.commit();
    }
    expect(budget.reserve()).toBeNull();
  });
});
