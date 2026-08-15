import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteExpiredAccountHealthLogs } from './health.js';
import { toJstString } from './utils.js';

function createTestDatabase(): { d1: D1Database; sqlite: Database.Database } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE account_health_logs (
      id TEXT PRIMARY KEY,
      line_account_id TEXT NOT NULL,
      error_code INTEGER,
      error_count INTEGER NOT NULL DEFAULT 0,
      check_period TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL
    )
  `);

  const d1 = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const prepared = {
        bind(...values: unknown[]) {
          bindings = values;
          return prepared;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { success: true, meta: { changes: result.changes } };
        },
      };
      return prepared;
    },
  } as unknown as D1Database;

  return { d1, sqlite };
}

function insertHealthLog(sqlite: Database.Database, id: string, createdAt: string): void {
  sqlite
    .prepare(
      `INSERT INTO account_health_logs
       (id, line_account_id, error_code, error_count, check_period, risk_level, created_at)
       VALUES (?, 'account-1', NULL, 0, '5m', 'normal', ?)`,
    )
    .run(id, createdAt);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('deleteExpiredAccountHealthLogs', () => {
  it('90日を超えたログだけを削除し、境界時刻と新しいログを残す', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000+09:00'));
    const { d1, sqlite } = createTestDatabase();

    insertHealthLog(sqlite, 'expired', '2026-05-18T11:59:59.999+09:00');
    insertHealthLog(sqlite, 'boundary-with-offset', '2026-05-18T12:00:00.000+09:00');
    insertHealthLog(sqlite, 'boundary-legacy', '2026-05-18T12:00:00.000');
    insertHealthLog(sqlite, 'recent', '2026-08-01T00:00:00.000+09:00');

    await expect(deleteExpiredAccountHealthLogs(d1)).resolves.toBe(1);

    const remaining = sqlite
      .prepare('SELECT id FROM account_health_logs ORDER BY id')
      .all()
      .map((row) => (row as { id: string }).id);
    expect(remaining).toEqual(['boundary-legacy', 'boundary-with-offset', 'recent']);

    sqlite.close();
  });

  it('1回の削除を500件に限定し、最も古いログから削除する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000+09:00'));
    const { d1, sqlite } = createTestDatabase();
    const insert = sqlite.transaction(() => {
      const baseTime = new Date('2026-01-01T00:00:00.000+09:00').getTime();
      for (let index = 0; index < 501; index += 1) {
        insertHealthLog(
          sqlite,
          `log-${index.toString().padStart(3, '0')}`,
          toJstString(new Date(baseTime + index * 1_000)),
        );
      }
    });
    insert();

    await expect(deleteExpiredAccountHealthLogs(d1)).resolves.toBe(500);

    const remaining = sqlite
      .prepare('SELECT id FROM account_health_logs')
      .all() as Array<{ id: string }>;
    expect(remaining).toEqual([{ id: 'log-500' }]);

    sqlite.close();
  });
});
