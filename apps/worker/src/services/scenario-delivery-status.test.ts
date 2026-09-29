import { describe, expect, it } from 'vitest';
import {
  getScenarioDeliveryStatus,
  normalizeScenarioDeliveryStatusLimit,
} from './scenario-delivery-status.js';

type DbCall = { sql: string; binds: unknown[] };

function mockDb(input: {
  sentCount?: { message_count: number; delivery_count: number; recipient_count: number };
  upcomingCount?: { recipient_count: number };
  sent?: Array<Record<string, unknown>>;
  upcoming?: Array<Record<string, unknown>>;
}) {
  const calls: DbCall[] = [];
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          binds = values;
          return statement;
        },
        async first() {
          calls.push({ sql, binds });
          if (sql.includes('COUNT(*) AS message_count')) {
            return input.sentCount ?? null;
          }
          if (sql.includes('COUNT(*) AS recipient_count')) {
            return input.upcomingCount ?? null;
          }
          return null;
        },
        async all() {
          calls.push({ sql, binds });
          if (sql.includes('FROM ranked_deliveries')) {
            return { results: input.sent ?? [] };
          }
          if (sql.includes('fs.id AS enrollment_id')) {
            return { results: input.upcoming ?? [] };
          }
          return { results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe('normalizeScenarioDeliveryStatusLimit', () => {
  it('defaults invalid values and clamps to a safe range', () => {
    expect(normalizeScenarioDeliveryStatusLimit(undefined)).toBe(200);
    expect(normalizeScenarioDeliveryStatusLimit('not-a-number')).toBe(200);
    expect(normalizeScenarioDeliveryStatusLimit('0')).toBe(1);
    expect(normalizeScenarioDeliveryStatusLimit('12.9')).toBe(12);
    expect(normalizeScenarioDeliveryStatusLimit('9999')).toBe(500);
  });
});

describe('getScenarioDeliveryStatus', () => {
  it('returns successful send history and the actual next-delivery queue', async () => {
    const { db, calls } = mockDb({
      sentCount: { message_count: 3, delivery_count: 2, recipient_count: 1 },
      upcomingCount: { recipient_count: 1 },
      sent: [
        {
          friend_id: 'friend-1',
          display_name: '徳島 花子',
          picture_url: 'https://example.com/avatar.jpg',
          step_id: 'step-2',
          step_order: 2,
          sent_at: '2026-09-29T18:30:00.000+09:00',
          message_type: 'text',
          send_count: 2,
        },
        {
          friend_id: 'friend-1',
          display_name: '徳島 花子',
          picture_url: 'https://example.com/avatar.jpg',
          step_id: 'step-1',
          step_order: 1,
          sent_at: '2026-09-28T09:00:00.000+09:00',
          message_type: 'text',
          send_count: 1,
        },
      ],
      upcoming: [
        {
          enrollment_id: 'enrollment-1',
          friend_id: 'friend-1',
          display_name: '徳島 花子',
          picture_url: null,
          status: 'active',
          started_at: '2026-09-28T08:55:00.000+09:00',
          next_delivery_at: '2026-10-01T18:30:00.000+09:00',
          updated_at: '2026-09-29T18:30:00.000+09:00',
          next_step_order: 3,
          message_type: 'text',
        },
      ],
    });

    const status = await getScenarioDeliveryStatus(db, 'scenario-1', 200);

    expect(status.sentMessageTotal).toBe(3);
    expect(status.sentDeliveryTotal).toBe(2);
    expect(status.sentRecipientTotal).toBe(1);
    expect(status.upcomingRecipientTotal).toBe(1);
    expect(status.sentHasMore).toBe(false);
    expect(status.upcomingHasMore).toBe(false);
    expect(status.sent[0]).toMatchObject({
      id: 'friend-1:step-2',
      displayName: '徳島 花子',
      stepOrder: 2,
      sendCount: 2,
    });
    expect(status.upcoming[0]).toMatchObject({
      enrollmentId: 'enrollment-1',
      nextStepOrder: 3,
      status: 'active',
    });

    const sql = calls.map((call) => call.sql).join('\n');
    expect(sql).toContain("ml.direction = 'outgoing'");
    expect(sql).toContain("ml.source = 'scenario'");
    expect(sql).toContain("ml.delivery_type != 'test'");
    expect(sql).toContain("fs.status IN ('active', 'delivering')");
    expect(sql).toContain('s.is_active = 1');
    expect(sql).toContain('f.is_following = 1');
    expect(sql).toContain('candidate.step_order > fs.current_step_order');
    expect(sql).toContain('f.line_account_id = s.line_account_id');
    expect(sql).not.toContain('julianday(le.started_at)');
    expect(sql).not.toContain('latest_enrollments');
    expect(sql).not.toContain('line_user_id');
    expect(sql).not.toContain('ml.content');
    expect(sql).not.toContain('f.metadata');
    expect(calls.filter((call) => call.binds.at(-1) === 201)).toHaveLength(2);

    expect(Object.keys(status.sent[0]).sort()).toEqual([
      'displayName',
      'friendId',
      'id',
      'messageType',
      'pictureUrl',
      'sendCount',
      'sentAt',
      'stepOrder',
    ]);
    expect(Object.keys(status.upcoming[0]).sort()).toEqual([
      'displayName',
      'enrollmentId',
      'friendId',
      'messageType',
      'nextDeliveryAt',
      'nextStepOrder',
      'pictureUrl',
      'startedAt',
      'status',
      'updatedAt',
    ]);
  });

  it('reports truncation and normalizes blank display names', async () => {
    const { db } = mockDb({
      sentCount: { message_count: 2, delivery_count: 2, recipient_count: 2 },
      upcomingCount: { recipient_count: 0 },
      sent: [
        {
          friend_id: 'friend-1', display_name: '  ', picture_url: null, step_id: 'step-1',
          step_order: 1, sent_at: '2026-09-29T09:00:00.000+09:00', message_type: 'text', send_count: 1,
        },
        {
          friend_id: 'friend-2', display_name: null, picture_url: null, step_id: 'step-1',
          step_order: 1, sent_at: '2026-09-28T09:00:00.000+09:00', message_type: 'text', send_count: 1,
        },
      ],
      upcoming: [],
    });

    const status = await getScenarioDeliveryStatus(db, 'scenario-1', 1);
    expect(status.sentHasMore).toBe(true);
    expect(status.sent).toHaveLength(1);
    expect(status.sent[0].displayName).toBe('名前未設定');
  });
});
