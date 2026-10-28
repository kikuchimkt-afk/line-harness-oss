import { createRequire } from 'node:module';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { BlockedFriendError, assertFriendNotBlocked, filterUnblockedFriendIds,
  filterUnblockedLineUserIds, isBlockTagName, isFriendBlocked, isLineUserBlocked,
  stopBlockedFriendWork } from './friend-block-policy.js';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let sql: import('node:sqlite').DatabaseSync;
let db: D1Database;
let queries: number;
let beforeMutation: ((query: string) => void) | undefined;
let maxBindings: number;

beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  queries = 0;
  beforeMutation = undefined;
  maxBindings = 0;
  sql.exec(`
    CREATE TABLE friends (id TEXT PRIMARY KEY, line_user_id TEXT, line_account_id TEXT,
      is_following INTEGER, metadata TEXT);
    CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE friend_tags (friend_id TEXT, tag_id TEXT);
    CREATE TABLE friend_scenarios (id TEXT PRIMARY KEY, friend_id TEXT, status TEXT,
      current_step_order INTEGER, next_delivery_at TEXT, updated_at TEXT);
    INSERT INTO friends VALUES ('fa', 'U_shared', 'acc-a', 1, '{}'),
      ('fb', 'U_shared', 'acc-b', 1, '{}'), ('legacy', 'U_legacy', NULL, 0, '{}'),
      ('meta-only', 'U_meta', 'acc-a', 1, '{"blocked":true,"tags":["ブロック"]}');
    INSERT INTO tags VALUES ('block', 'ブロック'), ('ordinary', 'ブロック候補');
    INSERT INTO friend_tags VALUES ('fa', 'block'), ('legacy', 'block'), ('fb', 'ordinary');
  `);
  db = { prepare(query: string) {
    queries++;
    let args: unknown[] = [];
    const statement = { bind(...values: unknown[]) { args = values; maxBindings = Math.max(maxBindings, values.length); return statement; },
      async all() { return { results: sql.prepare(query).all(...args as never[]) }; },
      async first() { return sql.prepare(query).get(...args as never[]) ?? null; },
      async run() { beforeMutation?.(query); return { meta: { changes: Number(sql.prepare(query).run(...args as never[]).changes) } }; },
    };
    return statement;
  } } as unknown as D1Database;
});
afterEach(() => sql.close());

describe('authoritative application block tag policy', () => {
  it.each(['ブロック', '　ブロック ', 'ﾌﾞﾛｯｸ'])('normalizes exactly the control tag: %s', (name) => {
    expect(isBlockTagName(name)).toBe(true);
  });
  it.each(['blocked', 'ブロック候補', 'ブロック解除', '', null])('does not infer control from %s', (name) => {
    expect(isBlockTagName(name)).toBe(false);
  });
  it('requires an actual tag link and ignores client-like metadata', async () => {
    expect(await isFriendBlocked(db, 'fa')).toBe(true);
    expect(await isFriendBlocked(db, 'meta-only')).toBe(false);
    expect(await isFriendBlocked(db, 'unknown')).toBe(false);
    sql.exec("DELETE FROM friend_tags WHERE friend_id = 'fa'");
    expect(await isFriendBlocked(db, 'fa')).toBe(false);
  });
  it('respects actual account scope and never transfers blocking across the shared LINE user ID', async () => {
    expect(await isFriendBlocked(db, 'fa', 'acc-a')).toBe(true);
    expect(await isFriendBlocked(db, 'fa', 'acc-b')).toBe(false);
    expect(await isFriendBlocked(db, 'fa', null)).toBe(false);
    expect(await isFriendBlocked(db, 'legacy', null)).toBe(true);
    expect(await isLineUserBlocked(db, 'U_shared', 'acc-a')).toBe(true);
    expect(await isLineUserBlocked(db, 'U_shared', 'acc-b')).toBe(false);
    expect(await isLineUserBlocked(db, 'U_shared', null)).toBe(false);
  });
  it('throws a stable neutral 403 policy error', async () => {
    await expect(assertFriendNotBlocked(db, 'fa')).rejects.toMatchObject({ code: 'FRIEND_BLOCKED', status: 403 });
    await expect(assertFriendNotBlocked(db, 'fb')).resolves.toBeUndefined();
    expect(new BlockedFriendError().message).not.toContain('fa');
  });
  it('batch-filters friend IDs with bounded binds, preserves order and scopes legacy explicitly', async () => {
    const ids = ['fb', 'fa', ...Array.from({ length: 180 }, (_, i) => 'unknown-' + i), 'legacy'];
    const filtered = await filterUnblockedFriendIds(db, ids);
    expect(filtered).toEqual(ids.filter((id) => id !== 'fa' && id !== 'legacy'));
    expect(queries).toBe(3);
    expect(await filterUnblockedFriendIds(db, ['fa', 'legacy'], null)).toEqual(['fa']);
    expect(await filterUnblockedLineUserIds(db, ['U_shared', 'U_meta'], 'acc-a')).toEqual(['U_meta']);
    expect(await filterUnblockedLineUserIds(db, ['U_shared', 'U_meta'], 'acc-b')).toEqual(['U_shared', 'U_meta']);
  });
  it('pauses only running work, retains history/follow reality, and never resumes after unblock', async () => {
    sql.exec(`INSERT INTO friend_scenarios VALUES ('active', 'fa', 'active', 2, 'next', 'old'),
      ('sending', 'fa', 'delivering', 1, 'next', 'old'), ('complete', 'fa', 'completed', 4, NULL, 'old'),
      ('other', 'fb', 'active', 1, 'next', 'old')`);
    await stopBlockedFriendWork(db, 'fa', 'acc-a');
    expect(sql.prepare('SELECT status, next_delivery_at, current_step_order FROM friend_scenarios WHERE id = ?').get('active'))
      .toMatchObject({ status: 'paused', next_delivery_at: null, current_step_order: 2 });
    expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id = ?').get('sending')!.status).toBe('paused');
    expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id = ?').get('complete')!.status).toBe('completed');
    expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id = ?').get('other')!.status).toBe('active');
    expect(sql.prepare('SELECT is_following FROM friends WHERE id = ?').get('fa')!.is_following).toBe(1);
    sql.exec("DELETE FROM friend_tags WHERE friend_id = 'fa'");
    await stopBlockedFriendWork(db, 'fa');
    expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id = ?').get('active')!.status).toBe('paused');
  });
  it('propagates a policy database failure instead of interpreting it as unblocked', async () => {
    sql.exec('DROP TABLE friend_tags');
    await expect(isFriendBlocked(db, 'fa')).rejects.toThrow();
  });
  it.each(['remove', 'rename', 'move-account'] as const)('does not pause work created after %s between policy read and UPDATE', async (change) => {
    sql.exec(`INSERT INTO friend_scenarios VALUES ('before', 'fa', 'active', 2, 'next', 'old'),
      ('complete', 'fa', 'completed', 4, NULL, 'old')`);
    beforeMutation = query => {
      if (!query.includes('UPDATE friend_scenarios')) return;
      beforeMutation = undefined;
      if (change === 'remove') sql.exec(`DELETE FROM friend_tags WHERE friend_id = 'fa'`);
      else if (change === 'rename') sql.exec(`UPDATE tags SET name = '資料請求' WHERE id = 'block'`);
      else sql.exec(`UPDATE friends SET line_account_id = 'acc-b' WHERE id = 'fa'`);
      sql.exec(`INSERT INTO friend_scenarios VALUES ('after', 'fa', 'active', 0, 'new-next', 'new')`);
    };
    await stopBlockedFriendWork(db, 'fa', 'acc-a');
    expect(sql.prepare('SELECT status, next_delivery_at FROM friend_scenarios WHERE id = ?').get('before'))
      .toEqual({ status: 'active', next_delivery_at: 'next' });
    expect(sql.prepare('SELECT status, next_delivery_at FROM friend_scenarios WHERE id = ?').get('after'))
      .toEqual({ status: 'active', next_delivery_at: 'new-next' });
    expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id = ?').get('complete')?.status).toBe('completed');
  });
  it('atomically matches exact snapshot names while supporting many normalized control tags with fixed binds', async () => {
    sql.exec(`DELETE FROM friend_tags WHERE friend_id = 'fa';
      INSERT INTO friend_scenarios VALUES ('active', 'fa', 'active', 2, 'next', 'old')`);
    const tag = sql.prepare('INSERT INTO tags VALUES (?, ?)');
    const link = sql.prepare('INSERT INTO friend_tags VALUES (?, ?)');
    for (let i = 0; i < 180; i++) {
      tag.run('equivalent-' + i, ' '.repeat(i) + 'ﾌﾞﾛｯｸ ');
      link.run('fa', 'equivalent-' + i);
    }
    await stopBlockedFriendWork(db, 'fa', 'acc-a');
    expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id = ?').get('active')?.status).toBe('paused');
    expect(maxBindings).toBeLessThanOrEqual(5);
  });
  it('does not mistake a replaced tag with the same ID for its previously normalized name', async () => {
    sql.exec(`INSERT INTO friend_scenarios VALUES ('active', 'fa', 'active', 2, 'next', 'old')`);
    beforeMutation = query => {
      if (!query.includes('UPDATE friend_scenarios')) return;
      beforeMutation = undefined;
      sql.exec(`UPDATE tags SET name = 'ブロック候補' WHERE id = 'block'`);
    };
    await stopBlockedFriendWork(db, 'fa');
    expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id = ?').get('active')?.status).toBe('active');
  });
});
