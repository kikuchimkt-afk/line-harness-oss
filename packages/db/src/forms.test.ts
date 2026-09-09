import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { deleteForm, deleteFormSubmission } from './forms.js';

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

  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: result.changes } };
  }
}

function makeD1(db: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return new SqliteD1Statement(db, sql);
    },
    async batch(statements: SqliteD1Statement[]) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
}

function setupDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE forms (
      id TEXT PRIMARY KEY,
      submit_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE form_submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      friend_id TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE form_opens (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      opened_at TEXT NOT NULL
    );
  `);
  sqlite
    .prepare(`INSERT INTO forms (id, submit_count, updated_at) VALUES (?, ?, ?)`)
    .run('form-1', 2, '2026-09-09T00:00:00.000');
  sqlite
    .prepare(
      `INSERT INTO form_submissions (id, form_id, friend_id, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run('sub-1', 'form-1', 'friend-1', '{"name":"test1"}', '2026-09-09T01:00:00.000');
  sqlite
    .prepare(
      `INSERT INTO form_submissions (id, form_id, friend_id, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run('sub-2', 'form-1', 'friend-2', '{"name":"test2"}', '2026-09-09T02:00:00.000');
  sqlite
    .prepare(`INSERT INTO form_opens (id, form_id, opened_at) VALUES (?, ?, ?)`)
    .run('open-1', 'form-1', '2026-09-09T00:30:00.000');

  return { sqlite, d1: makeD1(sqlite) };
}

describe('deleteForm', () => {
  test('deletes the form together with its submissions and access history', async () => {
    const { sqlite, d1 } = setupDb();

    await expect(deleteForm(d1, 'form-1')).resolves.toBeUndefined();

    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM forms`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM form_submissions`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM form_opens`).get()).toEqual({ count: 0 });
  });
});

describe('deleteFormSubmission', () => {
  test('deletes a single submission and recomputes submit_count', async () => {
    const { sqlite, d1 } = setupDb();

    await expect(deleteFormSubmission(d1, 'form-1', 'sub-1')).resolves.toBe(true);

    const remaining = sqlite
      .prepare(`SELECT id FROM form_submissions ORDER BY id`)
      .all() as Array<{ id: string }>;
    expect(remaining).toEqual([{ id: 'sub-2' }]);
    expect(sqlite.prepare(`SELECT submit_count FROM forms WHERE id = ?`).get('form-1')).toEqual({
      submit_count: 1,
    });
  });

  test('keeps data unchanged when the submission does not belong to the form', async () => {
    const { sqlite, d1 } = setupDb();

    await expect(deleteFormSubmission(d1, 'form-other', 'sub-1')).resolves.toBe(false);

    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM form_submissions`).get()).toEqual({
      count: 2,
    });
    expect(sqlite.prepare(`SELECT submit_count FROM forms WHERE id = ?`).get('form-1')).toEqual({
      submit_count: 2,
    });
  });
});
