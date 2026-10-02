import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import {
  deleteTagRichMenuBinding,
  getFollowingLineUserIdsByPreferredRichMenuGroup,
  getActiveTagRichMenuBinding,
  getTagRichMenuBinding,
  listTagRichMenuBindingsByAccount,
  upsertTagRichMenuBinding,
} from './rich-menu-bindings.js';

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
  } as unknown as D1Database;
}

function setupDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE line_accounts (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE tags (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE rich_menu_groups (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE
    );
    CREATE TABLE tag_rich_menu_bindings (
      account_id TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      rich_menu_group_id TEXT NOT NULL REFERENCES rich_menu_groups(id) ON DELETE CASCADE,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (account_id, tag_id)
    );
    CREATE TABLE friends (
      id TEXT PRIMARY KEY,
      line_user_id TEXT NOT NULL,
      line_account_id TEXT,
      is_following INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE friend_tags (
      friend_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (friend_id, tag_id)
    );
  `);
  sqlite.exec(`
    INSERT INTO line_accounts (id) VALUES ('account-a'), ('account-b');
    INSERT INTO tags (id) VALUES ('tag-a'), ('tag-b');
    INSERT INTO rich_menu_groups (id, account_id) VALUES
      ('group-a1', 'account-a'),
      ('group-a2', 'account-a'),
      ('group-b1', 'account-b');
  `);
  return { sqlite, d1: makeD1(sqlite) };
}

describe('tag rich-menu bindings', () => {
  test('creates an account-scoped binding and reads it back', async () => {
    const { d1 } = setupDb();

    const created = await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-a',
      richMenuGroupId: 'group-a1',
    });

    expect(created).toMatchObject({
      account_id: 'account-a',
      tag_id: 'tag-a',
      rich_menu_group_id: 'group-a1',
      is_active: 1,
    });
    await expect(
      getActiveTagRichMenuBinding(d1, 'account-a', 'tag-a'),
    ).resolves.toEqual(created);
    await expect(
      getActiveTagRichMenuBinding(d1, 'account-b', 'tag-a'),
    ).resolves.toBeNull();
  });

  test('replaces the group without creating a duplicate binding', async () => {
    const { sqlite, d1 } = setupDb();
    await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-a',
      richMenuGroupId: 'group-a1',
    });

    const updated = await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-a',
      richMenuGroupId: 'group-a2',
    });

    expect(updated.rich_menu_group_id).toBe('group-a2');
    expect(
      sqlite.prepare(`SELECT COUNT(*) AS count FROM tag_rich_menu_bindings`).get(),
    ).toEqual({ count: 1 });
  });

  test('rejects a rich-menu group belonging to another account', async () => {
    const { d1 } = setupDb();

    await expect(
      upsertTagRichMenuBinding(d1, {
        accountId: 'account-a',
        tagId: 'tag-a',
        richMenuGroupId: 'group-b1',
      }),
    ).rejects.toThrow('rich menu group does not belong to the LINE account');
  });

  test('lists bindings by account and omits inactive bindings from active lookup', async () => {
    const { sqlite, d1 } = setupDb();
    await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-a',
      richMenuGroupId: 'group-a1',
    });
    await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-b',
      richMenuGroupId: 'group-a2',
    });
    sqlite
      .prepare(
        `UPDATE tag_rich_menu_bindings SET is_active = 0
          WHERE account_id = ? AND tag_id = ?`,
      )
      .run('account-a', 'tag-a');

    await expect(
      listTagRichMenuBindingsByAccount(d1, 'account-a'),
    ).resolves.toHaveLength(2);
    await expect(
      getTagRichMenuBinding(d1, 'account-a', 'tag-a'),
    ).resolves.toMatchObject({ is_active: 0 });
    await expect(
      getActiveTagRichMenuBinding(d1, 'account-a', 'tag-a'),
    ).resolves.toBeNull();
  });

  test('deletes a binding idempotently', async () => {
    const { d1 } = setupDb();
    await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-a',
      richMenuGroupId: 'group-a1',
    });

    await expect(
      deleteTagRichMenuBinding(d1, 'account-a', 'tag-a'),
    ).resolves.toBe(true);
    await expect(
      deleteTagRichMenuBinding(d1, 'account-a', 'tag-a'),
    ).resolves.toBe(false);
  });

  test('relink selection honors the most recently assigned bound tag', async () => {
    const { sqlite, d1 } = setupDb();
    await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-a',
      richMenuGroupId: 'group-a1',
    });
    await upsertTagRichMenuBinding(d1, {
      accountId: 'account-a',
      tagId: 'tag-b',
      richMenuGroupId: 'group-a2',
    });
    sqlite.exec(`
      INSERT INTO friends (id, line_user_id, line_account_id, is_following)
      VALUES ('friend-1', 'U1', 'account-a', 1), ('friend-2', 'U2', 'account-a', 1);
      INSERT INTO friend_tags (friend_id, tag_id, assigned_at)
      VALUES
        ('friend-1', 'tag-a', '2026-10-01T10:00:00'),
        ('friend-1', 'tag-b', '2026-10-02T10:00:00'),
        ('friend-2', 'tag-a', '2026-10-02T10:00:00');
    `);

    await expect(
      getFollowingLineUserIdsByPreferredRichMenuGroup(d1, 'account-a', 'group-a1'),
    ).resolves.toEqual(['U2']);
    await expect(
      getFollowingLineUserIdsByPreferredRichMenuGroup(d1, 'account-a', 'group-a2'),
    ).resolves.toEqual(['U1']);
  });
});
