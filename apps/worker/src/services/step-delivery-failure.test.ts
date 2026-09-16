import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbFns = vi.hoisted(() => ({
  getFriendScenariosDueForDelivery: vi.fn(),
  getScenarioSteps: vi.fn(),
  advanceFriendScenario: vi.fn(),
  completeFriendScenario: vi.fn(),
  claimFriendScenarioForDelivery: vi.fn(),
  getFriendById: vi.fn(),
  jstNow: vi.fn(() => '2026-09-16T18:00:00.000+09:00'),
  computeNextDeliveryAt: vi.fn(),
  resolveStepContent: vi.fn(),
  addTagToFriend: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbFns);

import { processStepDeliveries } from './step-delivery.js';

describe('scenario delivery failure recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-16T09:00:00.000Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('requeues the same step when the LINE Push API rejects it', async () => {
    dbFns.getFriendScenariosDueForDelivery.mockResolvedValue([
      {
        id: 'fs-1',
        friend_id: 'friend-1',
        scenario_id: 'scenario-1',
        current_step_order: -1,
        status: 'active',
        next_delivery_at: '2026-09-16T17:59:00.000+09:00',
        started_at: '2026-09-16T17:50:00.000+09:00',
      },
    ]);
    dbFns.claimFriendScenarioForDelivery.mockResolvedValue(true);
    dbFns.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U-test',
      line_account_id: null,
      display_name: 'Test',
      user_id: null,
      metadata: null,
      is_following: 1,
    });
    dbFns.getScenarioSteps.mockResolvedValue([
      {
        id: 'step-1',
        step_order: 0,
        delay_minutes: 0,
        offset_days: null,
        offset_minutes: null,
        delivery_time: null,
        condition_type: null,
        condition_value: null,
        on_reach_tag_id: null,
      },
    ]);
    dbFns.resolveStepContent.mockResolvedValue({
      messageType: 'text',
      messageContent: 'hello',
      templateIdAtSend: null,
    });

    const updates: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => sql.includes('SELECT delivery_mode') ? { delivery_mode: 'relative' } : null,
          run: async () => {
            updates.push({ sql, args });
            return { meta: { changes: 1 } };
          },
        }),
      }),
    } as unknown as D1Database;
    const lineClient = {
      pushMessage: vi.fn().mockRejectedValue(new Error('LINE API error: 429')),
    };

    await processStepDeliveries(db, lineClient as never);

    expect(lineClient.pushMessage).toHaveBeenCalledTimes(1);
    const requeue = updates.find(({ sql }) => sql.includes("SET status = 'active'"));
    expect(requeue).toBeDefined();
    expect(requeue?.sql).toContain("status = 'delivering'");
    expect(requeue?.sql).toContain('current_step_order = ?');
    expect(requeue?.args).toEqual([
      '2026-09-16T18:05:00.000+09:00',
      '2026-09-16T18:00:00.000+09:00',
      'fs-1',
      -1,
    ]);
    expect(dbFns.advanceFriendScenario).not.toHaveBeenCalled();
    expect(dbFns.completeFriendScenario).not.toHaveBeenCalled();
  });
});
