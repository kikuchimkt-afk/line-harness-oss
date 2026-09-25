import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { createFormSubmission, deleteForm, deleteFormSubmission, getFormsWithStats } from './forms.js';

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
  let batchTail = Promise.resolve();
  return {
    prepare(sql: string) {
      return new SqliteD1Statement(db, sql);
    },
    async batch(statements: SqliteD1Statement[]) {
      let release!: () => void;
      const previous = batchTail;
      batchTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        db.exec('BEGIN');
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        release();
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
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '2026-09-09T00:00:00.000'
    );

    CREATE TABLE form_submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      friend_id TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      idempotency_key TEXT,
      tracked_link_id TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'sent', 'failed', 'not_required')),
      delivery_retry_key TEXT,
      delivery_error TEXT,
      delivery_attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX idx_form_submissions_idempotency
      ON form_submissions (form_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE TABLE form_opens (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      opened_at TEXT NOT NULL
    );

    CREATE TABLE line_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE friends (
      id TEXT PRIMARY KEY,
      line_account_id TEXT
    );

    CREATE TABLE templates (
      id TEXT PRIMARY KEY,
      message_content TEXT NOT NULL
    );

    CREATE TABLE auto_replies (
      id TEXT PRIMARY KEY,
      response_type TEXT NOT NULL,
      response_content TEXT NOT NULL,
      template_id TEXT,
      line_account_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
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

describe('getFormsWithStats', () => {
  test('includes an account from an active inline auto-reply before the first response', async () => {
    const { sqlite, d1 } = setupDb();
    sqlite
      .prepare(`INSERT INTO line_accounts (id, name, country, display_order) VALUES (?, ?, ?, ?)`)
      .run('account-aiko', 'あいことば', 'JP', 1);
    sqlite
      .prepare(
        `INSERT INTO auto_replies
         (id, response_type, response_content, template_id, line_account_id, is_active)
         VALUES (?, ?, ?, NULL, ?, 1)`,
      )
      .run('reply-1', 'text', 'https://example.test/?page=form&id=form-1', 'account-aiko');

    const [form] = await getFormsWithStats(d1);

    expect(form.used_by_accounts).toEqual([
      { id: 'account-aiko', name: 'あいことば', country: 'JP', displayOrder: 1, count: 0 },
    ]);
  });

  test('merges configured auto-reply accounts with per-account submission counts', async () => {
    const { sqlite, d1 } = setupDb();
    sqlite.exec(`
      INSERT INTO line_accounts (id, name, country, display_order) VALUES
        ('account-aiko', 'あいことば', 'JP', 1),
        ('account-bestone', 'ベストワン', 'JP', 2);
      INSERT INTO friends (id, line_account_id) VALUES
        ('friend-1', 'account-bestone'),
        ('friend-2', 'account-bestone');
      INSERT INTO auto_replies
        (id, response_type, response_content, template_id, line_account_id, is_active)
      VALUES
        ('reply-1', 'text', 'https://example.test/?page=form&id=form-1', NULL, 'account-aiko', 1);
    `);

    const [form] = await getFormsWithStats(d1);

    expect(form.used_by_accounts).toEqual([
      { id: 'account-aiko', name: 'あいことば', country: 'JP', displayOrder: 1, count: 0 },
      { id: 'account-bestone', name: 'ベストワン', country: 'JP', displayOrder: 2, count: 2 },
    ]);
  });

  test('detects a form URL inside a template used by a global auto-reply', async () => {
    const { sqlite, d1 } = setupDb();
    sqlite.exec(`
      INSERT INTO line_accounts (id, name, country, display_order, is_active) VALUES
        ('account-active', '有効アカウント', 'JP', 1, 1),
        ('account-inactive', '停止アカウント', 'JP', 2, 0);
      INSERT INTO templates (id, message_content)
      VALUES ('template-1', 'https://example.test/?page=form&id=form-1');
      INSERT INTO auto_replies
        (id, response_type, response_content, template_id, line_account_id, is_active)
      VALUES ('reply-global', 'text', 'fallback', 'template-1', NULL, 1);
    `);

    const [form] = await getFormsWithStats(d1);

    expect(form.used_by_accounts).toEqual([
      { id: 'account-active', name: '有効アカウント', country: 'JP', displayOrder: 1, count: 0 },
    ]);
  });
});

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

describe('createFormSubmission', () => {
  test('accepts 20 concurrent unique requests and stores one row for a replay burst', async () => {
    const { sqlite, d1 } = setupDb();

    const unique = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      createFormSubmission(d1, {
        formId: 'form-1',
        data: JSON.stringify({ index }),
        idempotencyKey: `event-request-${String(index).padStart(2, '0')}`,
      })));
    expect(unique.every((result) => result.created)).toBe(true);

    const replayBurst = await Promise.all(Array.from({ length: 20 }, () =>
      createFormSubmission(d1, {
        formId: 'form-1',
        data: JSON.stringify({ replay: true }),
        idempotencyKey: 'same-request-12345678',
      })));

    expect(replayBurst.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(replayBurst.map((result) => result.submission.id)).size).toBe(1);
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM form_submissions`).get()).toEqual({ count: 23 });
    expect(sqlite.prepare(`SELECT submit_count FROM forms WHERE id = ?`).get('form-1')).toEqual({
      submit_count: 23,
    });
  });
});
