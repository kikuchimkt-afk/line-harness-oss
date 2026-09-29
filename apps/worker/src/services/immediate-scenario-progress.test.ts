import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = {
  advanceFriendScenario: vi.fn(),
  completeFriendScenario: vi.fn(),
  computeNextDeliveryAt: vi.fn(),
};

vi.mock('@line-crm/db', () => dbMocks);

const { finalizeImmediateScenarioDelivery } = await import('./immediate-scenario-progress.js');

const deliveredStep = {
  step_order: 1,
  delay_minutes: 0,
  offset_days: 0,
  offset_minutes: null,
  delivery_time: '18:30',
};

beforeEach(() => {
  for (const mock of Object.values(dbMocks)) mock.mockReset();
});

describe('finalizeImmediateScenarioDelivery', () => {
  it('advances to the second step after an immediate first-step send', async () => {
    const db = {} as D1Database;
    const enrolledAt = new Date('2026-09-29T09:00:00.000Z');
    const deliveredAt = new Date('2026-09-29T09:00:02.000Z');
    const nextStep = {
      step_order: 2,
      delay_minutes: 0,
      offset_days: 1,
      offset_minutes: null,
      delivery_time: '18:30',
    };
    dbMocks.computeNextDeliveryAt.mockReturnValue(
      new Date('2026-09-30T18:30:00.000Z'),
    );

    await finalizeImmediateScenarioDelivery(db, {
      enrollmentId: 'enrollment-1',
      deliveryMode: 'absolute_time',
      deliveredStep,
      nextStep,
      enrolledAt,
      deliveredAt,
    });

    expect(dbMocks.computeNextDeliveryAt).toHaveBeenCalledWith(
      { delivery_mode: 'absolute_time' },
      nextStep,
      { enrolledAt, previousDeliveredAt: deliveredAt, now: deliveredAt },
    );
    expect(dbMocks.advanceFriendScenario).toHaveBeenCalledWith(
      db,
      'enrollment-1',
      1,
      '2026-09-30T18:30:00.000+09:00',
    );
    expect(dbMocks.completeFriendScenario).not.toHaveBeenCalled();
  });

  it('completes a one-step scenario after the immediate send', async () => {
    const db = {} as D1Database;
    const timestamp = new Date('2026-09-29T09:00:00.000Z');

    await finalizeImmediateScenarioDelivery(db, {
      enrollmentId: 'enrollment-1',
      deliveryMode: 'relative',
      deliveredStep,
      nextStep: null,
      enrolledAt: timestamp,
      deliveredAt: timestamp,
    });

    expect(dbMocks.completeFriendScenario).toHaveBeenCalledWith(db, 'enrollment-1');
    expect(dbMocks.computeNextDeliveryAt).not.toHaveBeenCalled();
    expect(dbMocks.advanceFriendScenario).not.toHaveBeenCalled();
  });
});
