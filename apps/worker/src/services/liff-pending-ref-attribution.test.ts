import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupExpiredPendingRefs,
  enrollPendingEntryScenarioOnce,
  getAccountScopedEntryRoute,
  hasPendingRefTracking,
  PENDING_REF_TTL_MS,
  recoverPendingRefAttribution,
  savePendingRefAttribution,
} from './liff-pending-ref-attribution.js';

const now = Date.parse('2026-10-12T12:00:00+09:00');
// Vite 5 predates node:sqlite; load the built-in through Node, not Vite.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type SqliteDatabase = import('node:sqlite').DatabaseSync;
let sqlite: SqliteDatabase;
let db: D1Database;

// Execute the actual migration and actual SQL in an isolated in-memory SQLite
// database. None of these synthetic IDs can reach LINE or production D1.
function asD1(sql: SqliteDatabase): D1Database {
  function prepare(query: string) {
    let args: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { args = values; return statement; },
      async first() { return sql.prepare(query).get(...args as never[]) ?? null; },
      async all() { return { success: true, results: sql.prepare(query).all(...args as never[]) }; },
      async run() {
        const result = sql.prepare(query).run(...args as never[]);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
      executeBatch() {
        const rows = sql.prepare(query).all(...args as never[]);
        return { success: true, results: rows, meta: { changes: 0 } };
      },
    };
    return statement;
  }
  return {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec('BEGIN');
      try {
        const results = statements.map((s) => s.executeBatch());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
}

function pendingCount(): number {
  return Number(sqlite.prepare('SELECT COUNT(*) AS n FROM liff_pending_ref_attributions').get()!.n);
}

function createFriend(account = 'acc-1', following = 1, ref: string | null = null) {
  sqlite.prepare('INSERT INTO friends VALUES (?, ?, ?, ?, ?)')
    .run('friend-1', account, 'U_synthetic', following, ref);
  return { id: 'friend-1', line_account_id: account };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE line_accounts (id TEXT PRIMARY KEY, is_active INTEGER);
    CREATE TABLE traffic_pools (id TEXT PRIMARY KEY, active_account_id TEXT, is_active INTEGER);
    CREATE TABLE pool_accounts (pool_id TEXT, line_account_id TEXT, is_active INTEGER);
    CREATE TABLE scenarios (id TEXT PRIMARY KEY, line_account_id TEXT, is_active INTEGER, delivery_mode TEXT);
    CREATE TABLE scenario_steps (id TEXT PRIMARY KEY, scenario_id TEXT, step_order INTEGER,
      delay_minutes INTEGER, offset_days INTEGER, offset_minutes INTEGER, delivery_time TEXT);
    CREATE TABLE entry_routes (id TEXT PRIMARY KEY, ref_code TEXT, pool_id TEXT,
      scenario_id TEXT, is_active INTEGER, tag_id TEXT, run_account_friend_add_scenarios INTEGER);
    CREATE TABLE friends (id TEXT PRIMARY KEY, line_account_id TEXT, line_user_id TEXT,
      is_following INTEGER, ref_code TEXT);
    CREATE TABLE ref_tracking (id TEXT PRIMARY KEY, ref_code TEXT, friend_id TEXT,
      entry_route_id TEXT, source_url TEXT, created_at TEXT);
    CREATE TABLE friend_scenarios (id TEXT PRIMARY KEY, friend_id TEXT, scenario_id TEXT,
      current_step_order INTEGER, status TEXT, started_at TEXT, next_delivery_at TEXT, updated_at TEXT);
    CREATE UNIQUE INDEX one_active_scenario ON friend_scenarios(friend_id, scenario_id) WHERE status != 'completed';
    INSERT INTO line_accounts VALUES ('acc-1', 1), ('acc-2', 1);
    INSERT INTO traffic_pools VALUES ('pool-1', 'acc-1', 1), ('pool-2', 'acc-2', 1);
    INSERT INTO scenarios VALUES ('scenario-1', 'acc-1', 1, 'elapsed'), ('scenario-2', 'acc-2', 1, 'elapsed');
    INSERT INTO scenario_steps VALUES ('step-1', 'scenario-1', 1, 0, 0, 0, NULL),
      ('step-2', 'scenario-1', 2, 0, 1, 0, NULL);
    INSERT INTO entry_routes VALUES
      ('route-1', 'flyer-ref', 'pool-1', 'scenario-1', 1, 'tag-1', 0),
      ('route-2', 'lp-ref', 'pool-1', 'scenario-1', 1, 'tag-2', 0),
      ('route-other', 'other-account-ref', 'pool-2', 'scenario-2', 1, 'tag-other', 0);
  `);
  sqlite.exec(readFileSync(new URL('../../../../packages/db/migrations/058_liff_pending_ref_attributions.sql', import.meta.url), 'utf8'));
  db = asD1(sqlite);
});

afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
});

describe('verified pre-follow pending entry attribution', () => {
  it('stores only the scoped ref with a fixed 24-hour TTL, without a friends row', async () => {
    expect(await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref')).toBe(true);
    const row = sqlite.prepare('SELECT * FROM liff_pending_ref_attributions').get();
    expect(row).toMatchObject({ line_account_id: 'acc-1', line_user_id: 'U_synthetic',
      entry_route_id: 'route-1', ref_code: 'flyer-ref', created_at: now, expires_at: now + PENDING_REF_TTL_MS });
    expect(Object.keys(row!)).toEqual(['line_account_id', 'line_user_id', 'entry_route_id', 'ref_code', 'created_at', 'expires_at']);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM friends').get()!.n).toBe(0);
  });

  it.each(['', 'unknown-ref', 'xh:secret', 'other-account-ref'])('does not persist unauthorized/unknown ref %s', async (ref) => {
    expect(await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', ref)).toBe(false);
    expect(pendingCount()).toBe(0);
  });

  it('fails closed without a resolved verified account', async () => {
    expect(await savePendingRefAttribution(db, null, 'U_synthetic', 'flyer-ref')).toBe(false);
    expect(pendingCount()).toBe(0);
  });

  it('honors active pool memberships instead of the legacy active-account fallback', async () => {
    sqlite.exec("INSERT INTO pool_accounts VALUES ('pool-1', 'acc-2', 0)");
    expect(await getAccountScopedEntryRoute(db, 'flyer-ref', 'acc-1')).toBeNull();
    sqlite.exec("UPDATE pool_accounts SET line_account_id = 'acc-1', is_active = 1");
    expect((await getAccountScopedEntryRoute(db, 'flyer-ref', 'acc-1'))?.id).toBe('route-1');
  });

  it('rejects a route with a mismatched scenario even if its pool matches', async () => {
    sqlite.exec("UPDATE entry_routes SET scenario_id = 'scenario-2' WHERE id = 'route-1'");
    expect(await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref')).toBe(false);
  });

  it.each([
    "UPDATE line_accounts SET is_active = 0 WHERE id = 'acc-1'",
    "UPDATE traffic_pools SET is_active = 0 WHERE id = 'pool-1'",
    "UPDATE scenarios SET is_active = 0 WHERE id = 'scenario-1'",
    "UPDATE entry_routes SET is_active = 0 WHERE id = 'route-1'",
  ])('rejects paused configuration: %s', async (change) => {
    sqlite.exec(change);
    expect(await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref')).toBe(false);
  });

  it('allows a no-pool route only when its active scenario pins the account', async () => {
    sqlite.exec("UPDATE entry_routes SET pool_id = NULL WHERE id = 'route-1'");
    expect(await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref')).toBe(true);
    sqlite.exec("UPDATE scenarios SET line_account_id = NULL WHERE id = 'scenario-1'");
    expect(await savePendingRefAttribution(db, 'acc-1', 'U_other', 'flyer-ref')).toBe(false);
  });

  it('preserves the first pending ref and does not extend TTL on repeat calls', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    vi.setSystemTime(now + 10_000);
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'lp-ref');
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    expect(pendingCount()).toBe(1);
    expect(sqlite.prepare('SELECT * FROM liff_pending_ref_attributions').get()).toMatchObject({
      ref_code: 'flyer-ref', expires_at: now + PENDING_REF_TTL_MS,
    });
  });

  it('recovers after follow, tracks once, and safely deduplicates concurrent/replayed recovery', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    const friend = createFriend();
    const results = await Promise.all([
      recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic'),
      recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic'),
    ]);
    expect(results).toEqual(['flyer-ref', 'flyer-ref']);
    expect(sqlite.prepare('SELECT ref_code FROM friends').get()!.ref_code).toBe('flyer-ref');
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM ref_tracking').get()!.n).toBe(1);
    expect(pendingCount()).toBe(0);
    expect(await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic')).toBeNull();
  });

  it('does not consume or modify an un-followed row', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    const friend = createFriend('acc-1', 0);
    expect(await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic')).toBeNull();
    expect(sqlite.prepare('SELECT ref_code FROM friends').get()!.ref_code).toBeNull();
    expect(pendingCount()).toBe(1);
  });

  it('retains an existing first-touch source instead of overwriting it', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    const friend = createFriend('acc-1', 1, 'earlier-source');
    expect(await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic')).toBe('earlier-source');
    expect(sqlite.prepare('SELECT ref_code FROM friends').get()!.ref_code).toBe('earlier-source');
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM ref_tracking').get()!.n).toBe(0);
    expect(pendingCount()).toBe(0);
  });

  it('does not recover for a different account or user', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    const friend = createFriend();
    expect(await recoverPendingRefAttribution(db, friend, 'acc-2', 'U_synthetic')).toBeNull();
    expect(await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_different')).toBeNull();
    expect(pendingCount()).toBe(1);
  });

  it('discards an expired or newly-paused route without attaching ref', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    const friend = createFriend();
    vi.setSystemTime(now + PENDING_REF_TTL_MS);
    expect(await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic')).toBeNull();
    expect(pendingCount()).toBe(0);
    vi.setSystemTime(now);
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    sqlite.exec("UPDATE entry_routes SET is_active = 0 WHERE id = 'route-1'");
    expect(await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic')).toBeNull();
    expect(pendingCount()).toBe(0);
    expect(sqlite.prepare('SELECT ref_code FROM friends').get()!.ref_code).toBeNull();
  });

  it('allows a fresh route after expiry and cleans only expired pending rows', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    vi.setSystemTime(now + PENDING_REF_TTL_MS);
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'lp-ref');
    expect(sqlite.prepare('SELECT ref_code FROM liff_pending_ref_attributions').get()!.ref_code).toBe('lp-ref');
    const friend = createFriend('acc-1', 1, 'earlier-source');
    await cleanupExpiredPendingRefs(db, now + 2 * PENDING_REF_TTL_MS);
    expect(pendingCount()).toBe(0);
    expect(friend.id).toBe('friend-1');
    expect(sqlite.prepare('SELECT ref_code FROM friends').get()!.ref_code).toBe('earlier-source');
  });

  it('rolls first touch back if tracking fails, so follow retry can recover', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    const friend = createFriend();
    sqlite.exec("CREATE TRIGGER tracking_failure BEFORE INSERT ON ref_tracking BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    await expect(recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic')).rejects.toThrow('synthetic failure');
    expect(sqlite.prepare('SELECT ref_code FROM friends').get()!.ref_code).toBeNull();
    expect(pendingCount()).toBe(1);
    sqlite.exec('DROP TRIGGER tracking_failure');
    expect(await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic')).toBe('flyer-ref');
  });

  it('recognizes recovery proof only for the same friend/account/ref/route', async () => {
    await savePendingRefAttribution(db, 'acc-1', 'U_synthetic', 'flyer-ref');
    const friend = createFriend();
    await recoverPendingRefAttribution(db, friend, 'acc-1', 'U_synthetic');
    expect(await hasPendingRefTracking(db, friend.id, 'acc-1', 'flyer-ref')).toBe(true);
    expect(await hasPendingRefTracking(db, friend.id, 'acc-2', 'flyer-ref')).toBe(false);
    expect(await hasPendingRefTracking(db, friend.id, 'acc-1', 'lp-ref')).toBe(false);
    expect(await hasPendingRefTracking(db, 'other-friend', 'acc-1', 'flyer-ref')).toBe(false);
    sqlite.exec("UPDATE entry_routes SET ref_code = 'renamed-route' WHERE id = 'route-1'");
    expect(await hasPendingRefTracking(db, friend.id, 'acc-1', 'flyer-ref')).toBe(false);
  });

  it('does not interpret regular click tracking or a client-like string as pending proof', async () => {
    const friend = createFriend('acc-1', 1, 'flyer-ref');
    sqlite.exec("INSERT INTO ref_tracking VALUES ('regular-click-uuid', 'flyer-ref', 'friend-1', 'route-1', NULL, 'now')");
    expect(await hasPendingRefTracking(db, friend.id, 'acc-1', 'flyer-ref')).toBe(false);
    expect(await hasPendingRefTracking(db, friend.id, null, 'flyer-ref')).toBe(false);
    expect(await hasPendingRefTracking(db, friend.id, 'acc-1', 'xh:secret')).toBe(false);
  });

  it('atomically enrolls one new pending run for Cron with the original elapsed schedule', async () => {
    const friend = createFriend();
    const inserted = await Promise.all([
      enrollPendingEntryScenarioOnce(db, friend.id, 'scenario-1', 'acc-1'),
      enrollPendingEntryScenarioOnce(db, friend.id, 'scenario-1', 'acc-1'),
    ]);
    expect(inserted.sort()).toEqual([false, true]);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM friend_scenarios').get()!.n).toBe(1);
    expect(sqlite.prepare('SELECT * FROM friend_scenarios').get()).toMatchObject({
      current_step_order: -1, status: 'active',
      started_at: '2026-10-12T12:00:00.000+09:00', next_delivery_at: '2026-10-12T12:00:00.000+09:00',
    });
  });

  it.each(['active', 'paused', 'completed'])('does not replay, restart or overwrite a %s run', async (status) => {
    const friend = createFriend();
    sqlite.prepare('INSERT INTO friend_scenarios VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('historical-run', friend.id, 'scenario-1', 2, status, 'original-start', 'original-next', 'original-update');
    expect(await enrollPendingEntryScenarioOnce(db, friend.id, 'scenario-1', 'acc-1')).toBe(false);
    expect(sqlite.prepare('SELECT * FROM friend_scenarios').get()).toMatchObject({
      id: 'historical-run', current_step_order: 2, status,
      started_at: 'original-start', next_delivery_at: 'original-next', updated_at: 'original-update',
    });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM friend_scenarios').get()!.n).toBe(1);
  });

  it('prevents restart if Cron finishes a run immediately before the enrollment INSERT', async () => {
    const friend = createFriend();
    const ordinaryPrepare = db.prepare.bind(db);
    db.prepare = ((query: string) => {
      if (query.includes('INSERT OR IGNORE INTO friend_scenarios')) {
        sqlite.exec("INSERT INTO friend_scenarios VALUES ('completed-by-cron', 'friend-1', 'scenario-1', 4, 'completed', 'start', NULL, 'finish')");
      }
      return ordinaryPrepare(query);
    }) as D1Database['prepare'];
    expect(await enrollPendingEntryScenarioOnce(db, friend.id, 'scenario-1', 'acc-1')).toBe(false);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM friend_scenarios').get()!.n).toBe(1);
  });

  it('does not enroll for an un-followed friend or mismatched scenario/account', async () => {
    const friend = createFriend('acc-1', 0);
    expect(await enrollPendingEntryScenarioOnce(db, friend.id, 'scenario-1', 'acc-1')).toBe(false);
    expect(await enrollPendingEntryScenarioOnce(db, friend.id, 'scenario-2', 'acc-1')).toBe(false);
    expect(await enrollPendingEntryScenarioOnce(db, friend.id, 'scenario-1', 'acc-2')).toBe(false);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM friend_scenarios').get()!.n).toBe(0);
  });
});
