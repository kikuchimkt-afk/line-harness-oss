import { describe, expect, test, vi } from 'vitest';
import {
  buildEventAdminBookingUrl,
  notifyEventBookingAdminRecipients,
  renderEventBookingAdminNoticeText,
} from './event-booking-admin-notifier.js';

function makeDb(params: {
  settingValue?: string | null;
  accountName?: string | null;
  recipients?: Array<{ id: string; line_user_id: string }>;
}): D1Database {
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          bound = values;
          return stmt;
        },
        async first<T>() {
          if (sql.includes('FROM account_settings')) {
            return (params.settingValue === undefined
              ? null
              : { value: params.settingValue }) as T | null;
          }
          if (sql.includes('FROM line_accounts')) {
            return { name: params.accountName ?? null } as T;
          }
          return null as T | null;
        },
        async all<T>() {
          const allowedIds = new Set(bound.slice(1) as string[]);
          return {
            results: (params.recipients ?? []).filter((row) => allowedIds.has(row.id)),
            success: true,
            meta: {},
          } as unknown as D1Result<T>;
        },
      };
      return stmt as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe('event booking admin notifier', () => {
  test('複数日程を1通の通知文にまとめる', () => {
    const text = renderEventBookingAdminNoticeText({
      accountName: 'あいことば',
      friendName: '山田保護者',
      eventName: '英検オンラインレッスン',
      startsAtJstList: ['2026-08-01 13:00', '2026-08-02 14:00'],
      status: 'requested',
      adminBookingUrl: 'https://admin.example.com/events/bookings?id=e1',
    });
    expect(text).toContain('予約件数：2件');
    expect(text).toContain('状態：承認待ち');
    expect(text).toContain('・2026-08-01 13:00\n・2026-08-02 14:00');
    expect(text).toContain('https://admin.example.com/events/bookings?id=e1');
  });

  test('管理画面URLをイベント予約管理へ組み立てる', () => {
    expect(buildEventAdminBookingUrl('https://admin.example.com/', 'event 1')).toBe(
      'https://admin.example.com/events/bookings?id=event%201',
    );
    expect(buildEventAdminBookingUrl(undefined, 'e1')).toBeNull();
  });

  test('設定した管理者へ1通ずつ送り、予約者本人は除外する', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const db = makeDb({
      settingValue: JSON.stringify(['admin1', 'booking-friend', 'admin1']),
      accountName: 'あいことば',
      recipients: [
        { id: 'admin1', line_user_id: 'U-ADMIN' },
        { id: 'booking-friend', line_user_id: 'U-BOOKING' },
      ],
    });

    const result = await notifyEventBookingAdminRecipients({
      db,
      channelAccessToken: 'token',
      lineAccountId: 'account1',
      bookingFriendId: 'booking-friend',
      friendName: '山田保護者',
      eventName: '英検オンラインレッスン',
      startsAtJstList: ['2026-08-01 13:00', '2026-08-02 14:00'],
      status: 'confirmed',
      sendText,
    });

    expect(result).toEqual({ sent: 1 });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      'U-ADMIN',
      expect.stringContaining('予約件数：2件'),
    );
  });

  test('通知先が未設定なら送信しない', async () => {
    const sendText = vi.fn();
    const result = await notifyEventBookingAdminRecipients({
      db: makeDb({ settingValue: null }),
      channelAccessToken: 'token',
      lineAccountId: 'account1',
      bookingFriendId: 'friend1',
      friendName: '山田保護者',
      eventName: '説明会',
      startsAtJstList: ['2026-08-01 13:00'],
      status: 'requested',
      sendText,
    });
    expect(result).toEqual({ sent: 0 });
    expect(sendText).not.toHaveBeenCalled();
  });
});
