import Database from '../../../../packages/db/node_modules/better-sqlite3';
import { describe, expect, test, vi } from 'vitest';
import {
  applyDesiredRichMenu,
  isRetryableRichMenuError,
  processDueRichMenuAssignments,
  reconcileRichMenuAssignments,
} from './rich-menu-assignment.js';

class SqliteD1Statement {
  private params: unknown[] = [];
  constructor(private readonly sqlite: Database.Database, private readonly sql: string) {}
  bind(...params: unknown[]) { this.params = params; return this; }
  async first<T>(): Promise<T | null> {
    return (this.sqlite.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.sqlite.prepare(this.sql).all(...this.params) as T[] };
  }
  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = this.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: result.changes } };
  }
}

function setupDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE line_accounts (
      id TEXT PRIMARY KEY,
      channel_access_token TEXT NOT NULL
    );
    CREATE TABLE friends (
      id TEXT PRIMARY KEY,
      line_user_id TEXT NOT NULL,
      line_account_id TEXT
    );
    CREATE TABLE automations (id TEXT PRIMARY KEY);
    CREATE TABLE rich_menu_assignments (
      friend_id TEXT PRIMARY KEY,
      line_account_id TEXT,
      automation_id TEXT,
      desired_rich_menu_id TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      applied_at TEXT,
      verified_at TEXT,
      last_error TEXT,
      generation INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO line_accounts VALUES ('acc-1', 'token-1');
    INSERT INTO friends VALUES ('friend-1', 'U-1', 'acc-1');
    INSERT INTO automations VALUES ('auto-1');
  `);
  const d1 = {
    prepare(sql: string) { return new SqliteD1Statement(sqlite, sql); },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

describe('rich-menu desired-state queue', () => {
  test('persists and marks an immediate switch as applied', async () => {
    const { sqlite, d1 } = setupDb();
    const link = vi.fn().mockResolvedValue(undefined);
    await applyDesiredRichMenu(d1, {
      friendId: 'friend-1', richMenuId: 'menu-a', lineAccessToken: 'token-1',
      lineAccountId: 'acc-1', automationId: 'auto-1',
      now: new Date('2026-09-22T00:00:00Z'),
      clientFactory: () => ({ linkRichMenuToUser: link, getRichMenuIdOfUser: vi.fn() }),
    });
    expect(link).toHaveBeenCalledWith('U-1', 'menu-a');
    expect(sqlite.prepare(
      'SELECT desired_rich_menu_id, status, retry_count, generation FROM rich_menu_assignments WHERE friend_id = ?'
    ).get('friend-1')).toEqual({
      desired_rich_menu_id: 'menu-a', status: 'applied', retry_count: 1, generation: 1,
    });
    sqlite.close();
  });

  test('retries a temporary LINE failure and succeeds on the next cron', async () => {
    const { sqlite, d1 } = setupDb();
    await expect(applyDesiredRichMenu(d1, {
      friendId: 'friend-1', richMenuId: 'menu-a', lineAccessToken: 'token-1',
      lineAccountId: 'acc-1', automationId: 'auto-1',
      now: new Date('2026-09-22T00:00:00Z'),
      clientFactory: () => ({
        linkRichMenuToUser: vi.fn().mockRejectedValue(new Error('LINE API error: 503 Unavailable')),
        getRichMenuIdOfUser: vi.fn(),
      }),
    })).rejects.toThrow('503');
    expect(sqlite.prepare('SELECT status, retry_count FROM rich_menu_assignments').get()).toEqual({
      status: 'retry_wait', retry_count: 1,
    });

    const link = vi.fn().mockResolvedValue(undefined);
    const result = await processDueRichMenuAssignments(d1, {
      now: new Date('2026-09-22T00:06:00Z'),
      clientFactory: () => ({ linkRichMenuToUser: link, getRichMenuIdOfUser: vi.fn() }),
    });
    expect(result).toEqual({ applied: 1, deferred: 0, failedPermanent: 0 });
    expect(link).toHaveBeenCalledWith('U-1', 'menu-a');
    expect(sqlite.prepare('SELECT status, retry_count FROM rich_menu_assignments').get()).toEqual({
      status: 'applied', retry_count: 2,
    });
    sqlite.close();
  });

  test('does not auto-retry a permanent LINE 400 response', async () => {
    const { sqlite, d1 } = setupDb();
    await expect(applyDesiredRichMenu(d1, {
      friendId: 'friend-1', richMenuId: 'bad-menu', lineAccessToken: 'token-1',
      now: new Date('2026-09-22T00:00:00Z'),
      clientFactory: () => ({
        linkRichMenuToUser: vi.fn().mockRejectedValue(new Error('LINE API error: 400 Bad Request')),
        getRichMenuIdOfUser: vi.fn(),
      }),
    })).rejects.toThrow('400');
    expect(sqlite.prepare('SELECT status, next_attempt_at FROM rich_menu_assignments').get()).toEqual({
      status: 'failed_permanent', next_attempt_at: null,
    });
    sqlite.close();
  });

  test('queues repair when periodic reconciliation finds a different menu', async () => {
    const { sqlite, d1 } = setupDb();
    sqlite.prepare(`INSERT INTO rich_menu_assignments
      (friend_id, line_account_id, automation_id, desired_rich_menu_id, source,
       status, retry_count, max_retries, generation, applied_at, verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'automation', 'applied', 1, 5, 1, ?, ?, ?, ?)`)
      .run('friend-1', 'acc-1', 'auto-1', 'menu-a',
        '2026-09-01T09:00:00.000+09:00', '2026-09-01T09:00:00.000+09:00',
        '2026-09-01T09:00:00.000+09:00', '2026-09-01T09:00:00.000+09:00');
    const result = await reconcileRichMenuAssignments(d1, {
      now: new Date('2026-09-22T00:00:00Z'),
      clientFactory: () => ({
        linkRichMenuToUser: vi.fn(),
        getRichMenuIdOfUser: vi.fn().mockResolvedValue({ richMenuId: 'menu-other' }),
      }),
    });
    expect(result).toEqual({ verified: 0, requeued: 1, unavailable: 0 });
    expect(sqlite.prepare('SELECT status, retry_count FROM rich_menu_assignments').get()).toEqual({
      status: 'pending', retry_count: 0,
    });
    sqlite.close();
  });
});

describe('isRetryableRichMenuError', () => {
  test('retries network, 429 and 5xx errors only', () => {
    expect(isRetryableRichMenuError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableRichMenuError(new Error('LINE API error: 429 Too Many Requests'))).toBe(true);
    expect(isRetryableRichMenuError(new Error('LINE API error: 503 Unavailable'))).toBe(true);
    expect(isRetryableRichMenuError(new Error('LINE API error: 400 Bad Request'))).toBe(false);
    expect(isRetryableRichMenuError(new Error('LINE account token is unavailable for switch_rich_menu'))).toBe(false);
  });
});
