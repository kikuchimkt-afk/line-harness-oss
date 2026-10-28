import { createRequire } from 'node:module';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { processBlockedFriendMenuRepairs, processBlockedMenuMaintenance, processUnblockedFriendMenuRepairs } from './blocked-menu-maintenance.js';

const mocks = vi.hoisted(() => ({ setup: vi.fn(), apply: vi.fn(), restore: vi.fn() }));
vi.mock('./blocked-menu-setup.js', () => ({ processDueBlockedMenuSetups: mocks.setup }));
vi.mock('./rich-menu-assignment.js', () => ({ applyBlockedRichMenuForFriend: mocks.apply, restoreRichMenuAfterUnblock: mocks.restore }));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let sql: import('node:sqlite').DatabaseSync;
let db: D1Database;
let afterCandidateRead: (() => void) | undefined;
let afterRestoreCandidateRead: (() => void) | undefined;
const now = new Date('2026-10-15T03:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setup.mockResolvedValue({ readyAccountIds: [], attempted: 0, ready: 0, deferred: 0, failed: 0 });
  mocks.apply.mockResolvedValue(undefined);
  mocks.restore.mockResolvedValue(undefined);
  afterCandidateRead = undefined;
  afterRestoreCandidateRead = undefined;
  sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE line_accounts(id TEXT PRIMARY KEY, is_active INTEGER, channel_access_token TEXT);
    CREATE TABLE friends(id TEXT PRIMARY KEY, line_user_id TEXT, line_account_id TEXT, is_following INTEGER);
    CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE friend_tags(friend_id TEXT, tag_id TEXT);
    CREATE TABLE account_settings(id TEXT PRIMARY KEY, line_account_id TEXT, key TEXT, value TEXT, created_at TEXT, updated_at TEXT, UNIQUE(line_account_id, key));
    CREATE TABLE rich_menu_assignments(friend_id TEXT PRIMARY KEY, line_account_id TEXT, desired_rich_menu_id TEXT, status TEXT, updated_at TEXT);
    CREATE TABLE friend_scenarios(id TEXT PRIMARY KEY, friend_id TEXT, status TEXT, next_delivery_at TEXT, updated_at TEXT);
    CREATE TABLE friend_reminders(id TEXT PRIMARY KEY, friend_id TEXT, status TEXT);
    CREATE TABLE scheduled_chat_messages(id TEXT PRIMARY KEY, friend_id TEXT, status TEXT, last_error TEXT);
    CREATE TABLE event_booking_decision_notifications(id TEXT PRIMARY KEY, friend_id TEXT, status TEXT, last_error TEXT);
    CREATE TABLE bookings(id TEXT PRIMARY KEY, friend_id TEXT);
    CREATE TABLE event_bookings(id TEXT PRIMARY KEY, friend_id TEXT);
    CREATE TABLE booking_reminders(id TEXT PRIMARY KEY, booking_id TEXT, status TEXT, last_error TEXT);
    CREATE TABLE event_booking_reminders(id TEXT PRIMARY KEY, booking_id TEXT, status TEXT, last_error TEXT);
    INSERT INTO line_accounts VALUES('acc', 1, 'synthetic-token'), ('inactive', 0, 'synthetic-inactive');
    INSERT INTO tags VALUES('block', 'ブロック'), ('equivalent', ' ﾌﾞﾛｯｸ '), ('normal', '資料請求');
    INSERT INTO account_settings VALUES('cfg', 'acc', 'blocked_dedicated_rich_menu_id', 'menu-blank', NULL, NULL);
    INSERT INTO account_settings VALUES('cfg-inactive', 'inactive', 'blocked_dedicated_rich_menu_id', 'inactive-blank', NULL, NULL);
  `);
  db = {
    prepare(query: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) { args = bound; return statement; },
        async all() {
          const rows = sql.prepare(query).all(...args as never[]);
          if (query.includes('SELECT DISTINCT f.id AS friend_id')) afterCandidateRead?.();
          if (query.includes('SELECT f.id AS friend_id')) afterRestoreCandidateRead?.();
          return { results: rows };
        },
        async first() { return sql.prepare(query).get(...args as never[]) ?? null; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...args as never[]).changes) } }; },
      };
      return statement;
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) { return Promise.all(statements.map(s => s.run())); },
  } as unknown as D1Database;
});
afterEach(() => sql.close());

function addFriend(id: string, tag = 'block', account = 'acc') {
  sql.prepare('INSERT INTO friends VALUES(?, ?, ?, 1)').run(id, 'U-' + id, account);
  sql.prepare('INSERT INTO friend_tags VALUES(?, ?)').run(id, tag);
  sql.prepare('INSERT INTO friend_scenarios VALUES(?, ?, ?, ?, NULL)').run('sc-' + id, id, 'active', '2099-01-01');
  sql.prepare('INSERT INTO scheduled_chat_messages VALUES(?, ?, ?, NULL)').run('msg-' + id, id, 'pending');
}

describe('bounded block-menu maintenance', () => {
  test('sets up at most one account and repairs at most two actual blocked friends per tick', async () => {
    for (const id of ['a', 'b', 'c']) addFriend(id);
    addFriend('normal', 'normal');
    addFriend('inactive', 'block', 'inactive');
    const result = await processBlockedMenuMaintenance(db, { now });
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(mocks.setup).toHaveBeenCalledWith(db, { now, limit: 1 });
    expect(result.repair).toEqual({ attempted: 2, repaired: 2, failed: 0, skipped: 0 });
    expect(mocks.apply.mock.calls.map(c => c.slice(1))).toEqual([['a', undefined, 'acc'], ['b', undefined, 'acc']]);
    for (const id of ['a', 'b']) {
      expect(sql.prepare('SELECT status, next_delivery_at FROM friend_scenarios WHERE friend_id = ?').get(id))
        .toEqual({ status: 'paused', next_delivery_at: null });
      expect(sql.prepare('SELECT status FROM scheduled_chat_messages WHERE friend_id = ?').get(id)?.status).toBe('cancelled');
    }
    for (const id of ['c', 'normal', 'inactive']) {
      expect(sql.prepare('SELECT status FROM friend_scenarios WHERE friend_id = ?').get(id)?.status).toBe('active');
    }
    expect(sql.prepare('SELECT SUM(is_following) AS n FROM friends').get()?.n).toBe(5);
  });

  test('recovers a tag saved before setup existed, in the same tick setup becomes ready', async () => {
    addFriend('new');
    sql.exec(`DELETE FROM account_settings WHERE line_account_id = 'acc'`);
    expect(await processBlockedFriendMenuRepairs(db, { now })).toMatchObject({ attempted: 0 });
    mocks.setup.mockImplementationOnce(async () => {
      sql.exec(`INSERT INTO account_settings VALUES('cfg', 'acc', 'blocked_dedicated_rich_menu_id', 'menu-blank', NULL, NULL)`);
      return { readyAccountIds: ['acc'], attempted: 1, ready: 1, deferred: 0, failed: 0 };
    });
    expect(await processBlockedMenuMaintenance(db, { now })).toMatchObject({ repair: { repaired: 1 } });
    expect(mocks.apply).toHaveBeenCalledWith(db, 'new', undefined, 'acc');
  });

  test('recognizes normalized block tags, but never repairs a friend whose tag was removed during setup', async () => {
    addFriend('equivalent', 'equivalent');
    addFriend('removed');
    mocks.setup.mockImplementationOnce(async () => {
      sql.exec(`DELETE FROM friend_tags WHERE friend_id = 'removed'`);
      return { readyAccountIds: [], attempted: 0, ready: 0, deferred: 0, failed: 0 };
    });
    await processBlockedMenuMaintenance(db, { now });
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.apply).toHaveBeenCalledWith(db, 'equivalent', undefined, 'acc');
    expect(sql.prepare(`SELECT status FROM friend_scenarios WHERE friend_id = 'removed'`).get()?.status).toBe('active');
  });

  test('rechecks the actual tag after selecting candidates before any customer mutation', async () => {
    addFriend('removed');
    afterCandidateRead = () => sql.exec(`DELETE FROM friend_tags WHERE friend_id = 'removed'`);
    expect(await processBlockedFriendMenuRepairs(db, { now })).toEqual({ attempted: 0, repaired: 0, failed: 0, skipped: 1 });
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages`).get()?.status).toBe('pending');
    expect(sql.prepare(`SELECT COUNT(*) AS n FROM account_settings WHERE key LIKE 'blocked_menu_repair_attempt:%'`).get()?.n).toBe(0);
  });

  test('does not reset an existing blank-menu retry queue or repeatedly retry a recent permanent error', async () => {
    for (const id of ['applied', 'retry', 'permanent-recent', 'permanent-old', 'normal-desired']) addFriend(id);
    const insert = sql.prepare('INSERT INTO rich_menu_assignments VALUES(?, ?, ?, ?, ?)');
    insert.run('applied', 'acc', 'menu-blank', 'applied', '2026-01-01');
    insert.run('retry', 'acc', 'menu-blank', 'retry_wait', '2026-01-01');
    insert.run('permanent-recent', 'acc', 'menu-blank', 'failed_permanent', '2026-10-15T11:59:00.000+09:00');
    insert.run('permanent-old', 'acc', 'menu-blank', 'failed_permanent', '2026-01-01');
    insert.run('normal-desired', 'acc', 'menu-normal', 'retry_wait', '2026-01-01');
    expect(await processBlockedFriendMenuRepairs(db, { now, limit: 200 })).toMatchObject({ attempted: 2, repaired: 2 });
    expect(mocks.apply.mock.calls.map(c => c[1]).sort()).toEqual(['normal-desired', 'permanent-old']);
  });

  test('setup failure does not prevent configured-account repair, while repair failure rotates fairly and respects cooldown', async () => {
    for (const id of ['a', 'b', 'c']) addFriend(id);
    mocks.setup.mockRejectedValueOnce(new Error('synthetic-secret-must-not-be-returned'));
    mocks.apply.mockRejectedValue(new Error('synthetic-secret-must-not-be-returned'));
    const first = await processBlockedMenuMaintenance(db, { now });
    expect(first).toMatchObject({ setup: { failed: 1 }, repair: { attempted: 2, failed: 2 } });
    expect(JSON.stringify(first)).not.toContain('synthetic-secret');
    const second = await processBlockedFriendMenuRepairs(db, { now: new Date(now.getTime() + 60_000) });
    expect(second).toMatchObject({ attempted: 1, failed: 1 });
    expect(mocks.apply.mock.calls.at(-1)?.[1]).toBe('c');
    const third = await processBlockedFriendMenuRepairs(db, { now: new Date(now.getTime() + 5 * 60_000) });
    expect(third).toMatchObject({ attempted: 2, failed: 2 });
    expect(mocks.apply.mock.calls.slice(-2).map(c => c[1])).toEqual(['a', 'b']);
  });
  test('recovers only unblocked, account-scoped backup owners without resuming any stopped jobs', async () => {
    for (const id of ['restoring', 'blocked', 'retrying']) addFriend(id);
    sql.exec(`DELETE FROM friend_tags WHERE friend_id IN ('restoring','retrying');
      INSERT INTO account_settings VALUES('old-r','acc','blocked_previous_rich_menu_id:restoring','{"richMenuId":null}',NULL,NULL);
      INSERT INTO account_settings VALUES('old-b','acc','blocked_previous_rich_menu_id:blocked','{"richMenuId":null}',NULL,NULL);
      INSERT INTO account_settings VALUES('old-q','acc','blocked_previous_rich_menu_id:retrying','{"richMenuId":"old"}',NULL,NULL);
      INSERT INTO account_settings VALUES('wrong','inactive','blocked_previous_rich_menu_id:restoring','{"richMenuId":"foreign"}',NULL,NULL);
      INSERT INTO rich_menu_assignments VALUES('retrying','acc','old','retry_wait','2000');`);
    expect(await processUnblockedFriendMenuRepairs(db, { now })).toEqual({ attempted: 1, repaired: 1, failed: 0, skipped: 0 });
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(mocks.restore).toHaveBeenCalledWith(db, 'restoring', undefined, 'acc');
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(sql.prepare("SELECT status FROM friend_scenarios WHERE friend_id='restoring'").get()?.status).toBe('active');
    expect(sql.prepare("SELECT status FROM scheduled_chat_messages WHERE friend_id='restoring'").get()?.status).toBe('pending');
  });
  test('shares at most two repair attempts fairly between blocking and restoring under a backlog', async () => {
    for (const id of ['a', 'b', 'c', 'restoring']) addFriend(id);
    sql.exec(`DELETE FROM friend_tags WHERE friend_id='restoring';
      INSERT INTO account_settings VALUES('old','acc','blocked_previous_rich_menu_id:restoring','{"richMenuId":null}',NULL,NULL);`);
    const result = await processBlockedMenuMaintenance(db, { now });
    expect(result.repair.attempted).toBe(1);
    expect(result.restore.attempted).toBe(1);
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    await processUnblockedFriendMenuRepairs(db, { now: new Date(now.getTime() + 60_000) });
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });
  test('does not restore when the friend is reblocked after selecting an unblock candidate', async () => {
    addFriend('restoring');
    sql.exec(`DELETE FROM friend_tags WHERE friend_id='restoring';
      INSERT INTO account_settings VALUES('old','acc','blocked_previous_rich_menu_id:restoring','{"richMenuId":null}',NULL,NULL);`);
    afterRestoreCandidateRead = () => sql.exec("INSERT INTO friend_tags VALUES('restoring','equivalent')");
    expect(await processUnblockedFriendMenuRepairs(db, { now })).toEqual({ attempted: 0, repaired: 0, failed: 0, skipped: 1 });
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
