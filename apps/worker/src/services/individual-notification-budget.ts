export const MAX_INDIVIDUAL_NOTIFICATIONS_PER_CRON = 40;

export interface IndividualNotificationReservation {
  commit(): void;
  release(): void;
}

export interface IndividualNotificationBudget {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  reserve(): IndividualNotificationReservation | null;
}

export function createIndividualNotificationBudget(
  requestedLimit = MAX_INDIVIDUAL_NOTIFICATIONS_PER_CRON,
): IndividualNotificationBudget {
  const finiteLimit = Number.isFinite(requestedLimit)
    ? Math.trunc(requestedLimit)
    : MAX_INDIVIDUAL_NOTIFICATIONS_PER_CRON;
  const limit = Math.min(
    MAX_INDIVIDUAL_NOTIFICATIONS_PER_CRON,
    Math.max(0, finiteLimit),
  );
  let used = 0;
  let reserved = 0;

  return {
    limit,
    get used() { return used; },
    get remaining() { return limit - used - reserved; },
    reserve() {
      if (used + reserved >= limit) return null;
      reserved += 1;
      let active = true;
      const finish = (consume: boolean) => {
        if (!active) return;
        active = false;
        reserved -= 1;
        if (consume) used += 1;
      };
      return {
        commit: () => finish(true),
        release: () => finish(false),
      };
    },
  };
}
