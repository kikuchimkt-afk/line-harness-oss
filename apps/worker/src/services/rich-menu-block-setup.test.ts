import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { applyBlockedRichMenuForFriend } from './rich-menu-assignment.js';

const mocks = vi.hoisted(() => ({ ensure: vi.fn(), link: vi.fn(), get: vi.fn() }));
vi.mock('./blocked-menu-setup.js', () => ({ ensureBlockedMenuForAccount: mocks.ensure }));
vi.mock('@line-crm/line-sdk', () => ({ LineClient: class { linkRichMenuToUser = mocks.link; getRichMenuIdOfUser = mocks.get; } }));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let sql: import('node:sqlite').DatabaseSync;
let db: D1Database;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue({ status: 'pending', code: 'setup_retry' });
  mocks.link.mockResolvedValue(undefined);
  mocks.get.mockRejectedValue(new Error('LINE API error: 404 Not found'));
  sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE friends(id TEXT PRIMARY KEY, line_user_id TEXT, line_account_id TEXT);
    CREATE TABLE line_accounts(id TEXT PRIMARY KEY, channel_access_token TEXT);
    CREATE TABLE automations(id TEXT PRIMARY KEY);
    CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE friend_tags(friend_id TEXT, tag_id TEXT);
    CREATE TABLE account_settings(id TEXT PRIMARY KEY, line_account_id TEXT, key TEXT, value TEXT, created_at TEXT, updated_at TEXT, UNIQUE(line_account_id, key));
    INSERT INTO friends VALUES('blocked', 'U-blocked', 'acc'), ('normal', 'U-normal', 'acc');
    INSERT INTO line_accounts VALUES('acc', 'synthetic-token');
    INSERT INTO tags VALUES('b', 'ブロック');
    INSERT INTO friend_tags VALUES('blocked', 'b');
  `);
  sql.exec(readFileSync(new URL('../../../../packages/db/migrations/056_rich_menu_assignments.sql', import.meta.url), 'utf8'));
  db = {
    prepare(query: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) { args = bound; return statement; },
        async all() { return { results: sql.prepare(query).all(...args as never[]) }; },
        async first() { return sql.prepare(query).get(...args as never[]) ?? null; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...args as never[]).changes) } }; },
      };
      return statement;
    },
  } as unknown as D1Database;
});
afterEach(() => sql.close());

function addConfiguration() {
  sql.exec(`INSERT INTO account_settings VALUES('cfg', 'acc', 'blocked_dedicated_rich_menu_id', 'blank', NULL, NULL)`);
}

describe('on-demand blocked-menu account setup', () => {
  test('existing configured accounts do not make provisioning or validation calls', async () => {
    addConfiguration();
    await applyBlockedRichMenuForFriend(db, 'blocked', undefined, 'acc');
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.link).toHaveBeenCalledTimes(1);
    expect(mocks.link).toHaveBeenCalledWith('U-blocked', 'blank');
  });
  test('provisions a new account only on a real block action and applies the new blank menu', async () => {
    mocks.ensure.mockImplementationOnce(async () => { addConfiguration(); return { status: 'ready', richMenuId: 'blank' }; });
    await applyBlockedRichMenuForFriend(db, 'blocked', undefined, 'acc');
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.ensure).toHaveBeenCalledWith(db, 'acc');
    expect(mocks.link).toHaveBeenCalledTimes(1);
    expect(mocks.link).toHaveBeenCalledWith('U-blocked', 'blank');
    expect(sql.prepare('SELECT desired_rich_menu_id, status FROM rich_menu_assignments').get())
      .toEqual({ desired_rich_menu_id: 'blank', status: 'applied' });
  });
  test.each(['pending', 'retry_wait', 'inactive'])('leaves the actual tag and normal menu unchanged when setup is %s', async status => {
    mocks.ensure.mockResolvedValueOnce({ status, code: 'token_unavailable' });
    await expect(applyBlockedRichMenuForFriend(db, 'blocked', undefined, 'acc')).rejects.toThrow('Blocked-only rich menu setup is pending');
    expect(sql.prepare('SELECT COUNT(*) AS n FROM friend_tags').get()?.n).toBe(1);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM rich_menu_assignments').get()?.n).toBe(0);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  test('never exposes raw setup errors or tokens', async () => {
    mocks.ensure.mockRejectedValueOnce(new Error('synthetic-secret-token / raw LINE response'));
    await expect(applyBlockedRichMenuForFriend(db, 'blocked', undefined, 'acc')).rejects.toThrow(/^Blocked-only rich menu setup is pending$/);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  test('does not provision for an ordinary friend or a mismatched account', async () => {
    await applyBlockedRichMenuForFriend(db, 'normal', undefined, 'acc');
    await expect(applyBlockedRichMenuForFriend(db, 'blocked', undefined, 'another')).rejects.toMatchObject({ code: 'FRIEND_BLOCKED' });
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });
  test('does not apply a blank menu when the tag is removed while setup is running', async () => {
    mocks.ensure.mockImplementationOnce(async () => {
      addConfiguration();
      sql.exec('DELETE FROM friend_tags');
      return { status: 'ready', richMenuId: 'blank' };
    });
    await applyBlockedRichMenuForFriend(db, 'blocked', undefined, 'acc');
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(sql.prepare('SELECT COUNT(*) AS n FROM rich_menu_assignments').get()?.n).toBe(0);
  });
});
