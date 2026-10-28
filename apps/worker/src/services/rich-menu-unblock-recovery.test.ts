import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applyBlockedRichMenuForFriend, applyDesiredRichMenu, processDueRichMenuAssignments,
  reconcileRichMenuAssignments, restoreRichMenuAfterUnblock } from './rich-menu-assignment.js';
import { processUnblockedFriendMenuRepairs } from './blocked-menu-maintenance.js';

const sdk = vi.hoisted(() => ({ link: vi.fn(), unlink: vi.fn(), get: vi.fn(), request: vi.fn() }));
vi.mock('@line-crm/line-sdk', () => ({ LineClient: class {
  linkRichMenuToUser = sdk.link; unlinkRichMenuFromUser = sdk.unlink; getRichMenuIdOfUser = sdk.get;
  request = sdk.request;
} }));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const DEFAULT = '__lineharness_account_default__';
let sql: import('node:sqlite').DatabaseSync;
let db: D1Database;
let current: string | null;
let beforeBackupDelete: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  current = null;
  beforeBackupDelete = undefined;
  sdk.request.mockResolvedValue({ data: {}, headers: new Headers() });
  sdk.get.mockImplementation(async () => {
    if (!current) throw new Error('LINE API error: 404 Not found');
    return { richMenuId: current };
  });
  sdk.link.mockImplementation(async (_user: string, menu: string) => { current = menu; });
  sdk.unlink.mockImplementation(async () => { current = null; });
  sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE friends(id TEXT PRIMARY KEY, line_user_id TEXT, line_account_id TEXT);
    CREATE TABLE line_accounts(id TEXT PRIMARY KEY, channel_access_token TEXT, is_active INTEGER);
    CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE friend_tags(friend_id TEXT, tag_id TEXT);
    CREATE TABLE automations(id TEXT PRIMARY KEY);
    CREATE TABLE account_settings(id TEXT PRIMARY KEY, line_account_id TEXT, key TEXT, value TEXT,
      created_at TEXT, updated_at TEXT, UNIQUE(line_account_id,key));
    INSERT INTO friends VALUES('friend','U-synthetic','acc');
    INSERT INTO line_accounts VALUES('acc','synthetic-token',1);
    INSERT INTO tags VALUES('b','ブロック'), ('half',' ﾌﾞﾛｯｸ ');
    INSERT INTO friend_tags VALUES('friend','b');
    INSERT INTO account_settings VALUES('config','acc','blocked_dedicated_rich_menu_id','blank',NULL,NULL);`);
  sql.exec(readFileSync(new URL('../../../../packages/db/migrations/056_rich_menu_assignments.sql', import.meta.url), 'utf8'));
  db = { prepare(query: string) { let args: unknown[] = []; const statement = {
    bind(...a: unknown[]) { args = a; return statement; },
    async all() { return { results: sql.prepare(query).all(...args as never[]) }; },
    async first() { return sql.prepare(query).get(...args as never[]) ?? null; },
    async run() {
      if (query.includes('DELETE FROM account_settings')) beforeBackupDelete?.();
      return { meta: { changes: Number(sql.prepare(query).run(...args as never[]).changes) } };
    },
  }; return statement; } } as unknown as D1Database;
});
afterEach(() => sql.close());
const backup = () => sql.prepare("SELECT value FROM account_settings WHERE key='blocked_previous_rich_menu_id:friend'").get();
const assignment = () => sql.prepare('SELECT desired_rich_menu_id, status, next_attempt_at FROM rich_menu_assignments').get();
const unblock = () => sql.exec("DELETE FROM friend_tags WHERE friend_id='friend'");
const block = () => sql.exec("INSERT INTO friend_tags VALUES('friend','b')");
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

describe('durable unblock-menu recovery and block/unblock races', () => {
  test('a default-menu unlink 503 remains queued and Cron restores it without a second operator action', async () => {
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    sdk.unlink.mockRejectedValueOnce(new Error('LINE API error: 503 Unavailable'));
    await expect(restoreRichMenuAfterUnblock(db, 'friend')).rejects.toThrow('503');
    expect(assignment()).toMatchObject({ desired_rich_menu_id: DEFAULT, status: 'retry_wait' });
    expect(backup()).toBeDefined();
    expect(await processDueRichMenuAssignments(db, { now: new Date('2099-01-01') })).toEqual({ applied: 1, deferred: 0, failedPermanent: 0 });
    expect(current).toBeNull();
    expect(assignment()).toMatchObject({ desired_rich_menu_id: DEFAULT, status: 'applied', next_attempt_at: null });
    expect(backup()).toBeUndefined();
  });
  test('a previous individual menu also retries durably and cleans the backup only after success', async () => {
    current = 'original';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    sdk.link.mockRejectedValueOnce(new Error('LINE API error: 429 Rate limited'));
    await expect(restoreRichMenuAfterUnblock(db, 'friend')).rejects.toThrow('429');
    expect(backup()).toBeDefined();
    await processDueRichMenuAssignments(db, { now: new Date('2099-01-01') });
    expect(current).toBe('original');
    expect(backup()).toBeUndefined();
  });
  test('a blank LINE call completing after default restoration immediately repairs back to the default', async () => {
    const entered = deferred(); const finish = deferred();
    sdk.link.mockImplementationOnce(async (_user: string, menu: string) => {
      entered.resolve(); await finish.promise; current = menu;
    });
    const inFlightBlock = applyBlockedRichMenuForFriend(db, 'friend');
    await entered.promise;
    unblock();
    await restoreRichMenuAfterUnblock(db, 'friend');
    finish.resolve();
    await inFlightBlock;
    expect(current).toBeNull();
    expect(assignment()).toMatchObject({ desired_rich_menu_id: DEFAULT, status: 'applied' });
    expect(sdk.unlink).toHaveBeenCalledTimes(2);
  });
  test('reblocking during an in-flight default unlink wins and retains the original-menu backup', async () => {
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    const entered = deferred(); const finish = deferred();
    sdk.unlink.mockImplementationOnce(async () => { entered.resolve(); await finish.promise; current = null; });
    const inFlightRestore = restoreRichMenuAfterUnblock(db, 'friend');
    await entered.promise;
    block();
    await applyBlockedRichMenuForFriend(db, 'friend');
    finish.resolve();
    await inFlightRestore;
    expect(current).toBe('blank');
    expect(assignment()).toMatchObject({ desired_rich_menu_id: 'blank', status: 'applied' });
    expect(backup()).toBeDefined();
  });
  test('reblocking during restoration of a prior individual menu immediately wins', async () => {
    current = 'original';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    const entered = deferred(); const finish = deferred();
    sdk.link.mockImplementationOnce(async (_user: string, menu: string) => { entered.resolve(); await finish.promise; current = menu; });
    const restoring = restoreRichMenuAfterUnblock(db, 'friend');
    await entered.promise;
    block();
    await applyBlockedRichMenuForFriend(db, 'friend');
    finish.resolve(); await restoring;
    expect(current).toBe('blank');
    expect(assignment()).toMatchObject({ desired_rich_menu_id: 'blank', status: 'applied' });
    expect(JSON.parse(String(backup()?.value))).toEqual({ richMenuId: 'original' });
  });
  test('an older failing blank call cannot corrupt a newer completed unblock', async () => {
    const entered = deferred(); const finish = deferred();
    sdk.link.mockImplementationOnce(async () => { entered.resolve(); await finish.promise; throw new Error('LINE API error: 503 unavailable'); });
    const blocking = applyBlockedRichMenuForFriend(db, 'friend');
    const observedBlock = blocking.catch(error => error);
    await entered.promise;
    unblock(); await restoreRichMenuAfterUnblock(db, 'friend');
    finish.resolve(); expect(await observedBlock).toBeInstanceOf(Error);
    expect(current).toBeNull();
    expect(assignment()).toMatchObject({ desired_rich_menu_id: DEFAULT, status: 'applied' });
    expect(backup()).toBeUndefined();
  });
  test('the dedicated blank menu cannot be reapplied to a currently unblocked friend', async () => {
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    sdk.link.mockClear();
    await expect(applyDesiredRichMenu(db, { friendId: 'friend', richMenuId: 'blank', lineAccessToken: 'synthetic-token' }))
      .rejects.toMatchObject({ code: 'FRIEND_BLOCKED' });
    expect(sdk.link).not.toHaveBeenCalled();
  });
  test('a newer normal desired menu wins over a stale unblock backup', async () => {
    current = 'old';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    await applyDesiredRichMenu(db, { friendId: 'friend', richMenuId: 'newer', lineAccessToken: 'synthetic-token' });
    await restoreRichMenuAfterUnblock(db, 'friend');
    expect(current).toBe('newer');
    expect(backup()).toBeUndefined();
  });
  test('backup cleanup atomically refuses a normalized reblock at the deletion boundary', async () => {
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    beforeBackupDelete = () => { beforeBackupDelete = undefined; sql.exec("INSERT INTO friend_tags VALUES('friend','half')"); };
    await restoreRichMenuAfterUnblock(db, 'friend');
    expect(backup()).toBeDefined();
    expect(current).toBe('blank');
  });
  test('reconciliation accepts 404 as the desired account default but requeues an unexpected individual menu', async () => {
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    await restoreRichMenuAfterUnblock(db, 'friend');
    expect(await reconcileRichMenuAssignments(db, { now: new Date('2099-01-01') })).toEqual({ verified: 1, requeued: 0, unavailable: 0 });
    current = 'unexpected';
    expect(await reconcileRichMenuAssignments(db, { now: new Date('2099-02-01') })).toEqual({ verified: 0, requeued: 1, unavailable: 0 });
    await processDueRichMenuAssignments(db, { now: new Date('2099-02-01') });
    expect(current).toBeNull();
  });
  test('rejects an account mismatch without restoring or consuming its backup', async () => {
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock(); sdk.unlink.mockClear();
    await expect(restoreRichMenuAfterUnblock(db, 'friend', undefined, 'another')).rejects.toMatchObject({ code: 'FRIEND_BLOCKED' });
    expect(sdk.unlink).not.toHaveBeenCalled();
    expect(backup()).toBeDefined();
  });
  test('preserves newest normal account scope instead of accepting a mismatched desired assignment', async () => {
    unblock();
    await expect(applyDesiredRichMenu(db, { friendId: 'friend', richMenuId: 'normal',
      lineAccessToken: 'synthetic-token', lineAccountId: 'another' })).rejects.toMatchObject({ code: 'FRIEND_BLOCKED' });
    expect(sdk.link).not.toHaveBeenCalled();
    expect(assignment()).toBeUndefined();
  });
  test('maintenance recovers a legacy unlink failure saved with an applied blank assignment', async () => {
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    expect(assignment()).toMatchObject({ desired_rich_menu_id: 'blank', status: 'applied' });
    expect(await processUnblockedFriendMenuRepairs(db, { now: new Date('2099-01-01') }))
      .toEqual({ attempted: 1, repaired: 1, failed: 0, skipped: 0 });
    expect(current).toBeNull();
    expect(backup()).toBeUndefined();
    expect(assignment()).toMatchObject({ desired_rich_menu_id: DEFAULT, status: 'applied' });
  });
  test('a confirmed deleted previous-menu resource restores the current account default instead', async () => {
    current = 'deleted-old';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock(); sdk.link.mockClear();
    sdk.request.mockRejectedValueOnce(new Error('LINE API error: 404 menu resource deleted'));
    await restoreRichMenuAfterUnblock(db, 'friend');
    expect(sdk.request).toHaveBeenCalledWith('GET', '/v2/bot/richmenu/deleted-old');
    expect(sdk.link).not.toHaveBeenCalled();
    expect(current).toBeNull();
    expect(assignment()).toMatchObject({ desired_rich_menu_id: DEFAULT, status: 'applied' });
    expect(backup()).toBeUndefined();
  });
  test('does not confuse a user-link 404 with a deleted menu when the menu resource exists', async () => {
    current = 'original';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock(); sdk.link.mockRejectedValueOnce(new Error('LINE API error: 404 user not found'));
    await expect(restoreRichMenuAfterUnblock(db, 'friend')).rejects.toThrow('404');
    expect(sdk.request).toHaveBeenCalledTimes(2);
    expect(sdk.unlink).not.toHaveBeenCalled();
    expect(assignment()).toMatchObject({ desired_rich_menu_id: 'original', status: 'failed_permanent' });
    expect(backup()).toBeDefined();
  });
  test('resource-check credentials and temporary errors never silently fall back to the default', async () => {
    current = 'original';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    sdk.request.mockRejectedValueOnce(new Error('LINE API error: 401 invalid credentials'));
    await expect(restoreRichMenuAfterUnblock(db, 'friend')).rejects.toThrow('401');
    expect(sdk.unlink).not.toHaveBeenCalled();
    expect(backup()).toBeDefined();
    sdk.request.mockRejectedValueOnce(new Error('LINE API error: 503 unavailable'));
    await expect(restoreRichMenuAfterUnblock(db, 'friend')).rejects.toThrow('503');
    expect(sdk.unlink).not.toHaveBeenCalled();
    expect(backup()).toBeDefined();
    await processUnblockedFriendMenuRepairs(db, { now: new Date('2099-01-01') });
    expect(current).toBe('original');
    expect(backup()).toBeUndefined();
  });
  test('a menu deleted after preflight becomes a durable default operation and retries successfully', async () => {
    current = 'deleted-later';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    sdk.request.mockResolvedValueOnce({ data: {}, headers: new Headers() })
      .mockRejectedValueOnce(new Error('LINE API error: 404 resource deleted'));
    sdk.link.mockRejectedValueOnce(new Error('LINE API error: 404 unavailable menu'));
    await expect(restoreRichMenuAfterUnblock(db, 'friend')).rejects.toThrow('404');
    expect(assignment()).toMatchObject({ desired_rich_menu_id: DEFAULT, status: 'retry_wait' });
    expect(backup()).toBeDefined();
    await processDueRichMenuAssignments(db, { now: new Date('2099-01-01') });
    expect(current).toBeNull();
    expect(backup()).toBeUndefined();
  });
  test('a transient resource-check failure preserves retry instead of assuming a user/menu 404 is permanent', async () => {
    current = 'original';
    await applyBlockedRichMenuForFriend(db, 'friend');
    unblock();
    sdk.request.mockResolvedValueOnce({ data: {}, headers: new Headers() })
      .mockRejectedValueOnce(new Error('LINE API error: 503 resource service unavailable'));
    sdk.link.mockRejectedValueOnce(new Error('LINE API error: 404 unavailable'));
    await expect(restoreRichMenuAfterUnblock(db, 'friend')).rejects.toThrow('404');
    expect(assignment()).toMatchObject({ desired_rich_menu_id: 'original', status: 'retry_wait' });
    expect(sdk.unlink).not.toHaveBeenCalled();
    await processDueRichMenuAssignments(db, { now: new Date('2099-01-01') });
    expect(current).toBe('original');
    expect(backup()).toBeUndefined();
  });
});
