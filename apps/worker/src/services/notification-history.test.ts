import { beforeEach, describe, expect, test, vi } from 'vitest';

const pushMessage = vi.fn(async () => undefined);

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: class {
    pushMessage = pushMessage;
  },
}));

import { sendBookingNotification } from './booking-notifier.js';
import { sendEventBookingNotification } from './event-booking-notifier.js';

function historyDb(records: unknown[][]): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: (...values: unknown[]) => ({
        run: async () => {
          records.push(values);
          return { success: true };
        },
      }),
    })),
  } as unknown as D1Database;
}

describe('notification message history', () => {
  beforeEach(() => {
    pushMessage.mockClear();
  });

  test('stores a normal booking notice after sending it to LINE', async () => {
    const records: unknown[][] = [];
    await sendBookingNotification({
      channelAccessToken: 'token',
      toLineUserId: 'line-user',
      kind: 'approved',
      db: historyDb(records),
      friendId: 'friend-1',
      lineAccountId: 'account-1',
      ctx: {
        menuName: '個人面談',
        staffName: '担当者',
        startsAtJst: '2026-07-25 15:00',
        hoursBefore: 0,
      },
    });

    expect(pushMessage).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0][1]).toBe('friend-1');
    expect(records[0][2]).toContain('予約が確定しました');
    expect(records[0][3]).toBe('account-1');
  });

  test('stores an event booking notice after sending it to LINE', async () => {
    const records: unknown[][] = [];
    await sendEventBookingNotification({
      channelAccessToken: 'token',
      toLineUserId: 'line-user',
      kind: 'received_pending',
      db: historyDb(records),
      friendId: 'friend-2',
      lineAccountId: 'account-2',
      ctx: {
        eventName: '英検オンライン勉強会',
        startsAtJst: '2026-07-25 16:00',
      },
    });

    expect(pushMessage).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0][1]).toBe('friend-2');
    expect(records[0][2]).toContain('イベント申込みを受け付けました');
    expect(records[0][3]).toBe('account-2');
  });
});
