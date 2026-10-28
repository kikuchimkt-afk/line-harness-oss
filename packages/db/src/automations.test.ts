import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { createAutomation, updateAutomation } from './automations.js';

class SqliteD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: result.changes } };
  }
}

function setupDb(): { d1: D1Database; sqlite: Database.Database } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      event_type TEXT NOT NULL,
      conditions TEXT NOT NULL DEFAULT '{}',
      actions TEXT NOT NULL DEFAULT '[]',
      line_account_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  const d1 = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite, sql);
    },
  } as unknown as D1Database;
  return { d1, sqlite };
}

describe('automation account scope', () => {
  test('createAutomation stores lineAccountId in the insert', async () => {
    const { d1, sqlite } = setupDb();

    const created = await createAutomation(d1, {
      name: 'age reply',
      eventType: 'message_received',
      conditions: { keyword_exact: '5歳' },
      actions: [{ type: 'send_message', params: { content: 'hello' } }],
      lineAccountId: 'account-aikotoba',
      priority: 100,
    });

    expect(created.line_account_id).toBe('account-aikotoba');
    expect(created.conditions).toBe('{"keyword_exact":"5歳"}');
    sqlite.close();
  });

  test('updateAutomation changes and can clear lineAccountId explicitly', async () => {
    const { d1, sqlite } = setupDb();
    const created = await createAutomation(d1, {
      name: 'age reply',
      eventType: 'message_received',
      actions: [],
      lineAccountId: 'account-before',
    });

    await updateAutomation(d1, created.id, { lineAccountId: 'account-after' });
    expect(
      sqlite.prepare('SELECT line_account_id FROM automations WHERE id = ?').get(created.id),
    ).toEqual({ line_account_id: 'account-after' });

    await updateAutomation(d1, created.id, { lineAccountId: null });
    expect(
      sqlite.prepare('SELECT line_account_id FROM automations WHERE id = ?').get(created.id),
    ).toEqual({ line_account_id: null });
    sqlite.close();
  });
});
