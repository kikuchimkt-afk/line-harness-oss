import { describe, expect, test, vi } from 'vitest';
import {
  enqueueEventBookingDecisionNotification,
  processDueEventBookingDecisionNotifications,
} from './event-booking-decision-notifications.js';

interface FakeStatement {
  sql: string;
  bound: unknown[];
  bind: (...values: unknown[]) => FakeStatement;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
}

function statement(
  sql: string,
  dueRows: Record<string, unknown>[],
  onRun: (current: FakeStatement) => number,
): FakeStatement {
  const current: FakeStatement = {
    sql,
    bound: [],
    bind(...values: unknown[]) {
      current.bound = values;
      return current;
    },
    async all<T>() {
      return {
        results: sql.includes('FROM event_booking_decision_notifications n')
          ? dueRows as T[]
          : [],
      };
    },
    async run() {
      return { success: true, meta: { changes: onRun(current) } };
    },
  };
  return current;
}

describe('event booking decision notification queue', () => {
  test('enqueue persists the decision context and delivery options', async () => {
    let inserted: FakeStatement | null = null;
    const db = {
      prepare(sql: string) {
        return statement(sql, [], (current) => {
          inserted = current;
          return 1;
        });
      },
    } as unknown as D1Database;

    await enqueueEventBookingDecisionNotification(db, {
      lineAccountId: 'account-1',
      eventId: 'event-1',
      friendId: 'friend-1',
      kind: 'confirmed',
      ctx: { eventName: '英検勉強会', startsAtJst: '2099-06-01 19:00' },
      scheduledAt: '2099-06-01T00:00:00.000Z',
      notificationDisabled: true,
    });

    expect(inserted?.bound[1]).toBe('account-1');
    expect(inserted?.bound[2]).toBe('event-1');
    expect(inserted?.bound[3]).toBe('friend-1');
    expect(inserted?.bound[4]).toBe('confirmed');
    expect(inserted?.bound[7]).toBe(1);
  });

  test('due decision is sent with mute enabled', async () => {
    const sender = vi.fn(async () => undefined);
    const statusUpdates: unknown[][] = [];
    const dueRows = [{
      id: 'notice-1',
      line_account_id: 'account-1',
      friend_id: 'friend-1',
      kind: 'rejected',
      context_json: JSON.stringify({
        eventName: '英検勉強会',
        startsAtJst: '2099-06-01 19:00',
      }),
      notification_disabled: 1,
      retry_count: 0,
      channel_access_token: 'token',
      line_user_id: 'U123',
    }];
    const db = {
      prepare(sql: string) {
        return statement(sql, dueRows, (current) => {
          if (sql.includes('UPDATE event_booking_decision_notifications')) {
            statusUpdates.push(current.bound);
          }
          return 1;
        });
      },
    } as unknown as D1Database;

    const result = await processDueEventBookingDecisionNotifications(db, {
      now: new Date('2099-06-01T00:05:00.000Z'),
      sender,
    });

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({
        channelAccessToken: 'token',
        toLineUserId: 'U123',
        kind: 'rejected',
        notificationDisabled: true,
        friendId: 'friend-1',
        lineAccountId: 'account-1',
      }),
    );
    expect(statusUpdates.length).toBeGreaterThanOrEqual(2);
  });
});
