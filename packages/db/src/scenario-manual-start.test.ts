import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import {
  getManualScenarioStartState,
  startFriendScenarioFromStep,
} from './scenarios.js';

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

function setupDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE scenarios (
      id TEXT PRIMARY KEY,
      delivery_mode TEXT NOT NULL
    );
    CREATE TABLE scenario_steps (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      delay_minutes INTEGER NOT NULL DEFAULT 0,
      message_type TEXT NOT NULL DEFAULT 'text',
      message_content TEXT NOT NULL DEFAULT '',
      condition_type TEXT,
      condition_value TEXT,
      next_step_on_false INTEGER,
      offset_days INTEGER,
      offset_minutes INTEGER,
      delivery_time TEXT,
      template_id TEXT,
      on_reach_tag_id TEXT,
      created_at TEXT NOT NULL DEFAULT '2026-09-01T00:00:00.000+09:00',
      UNIQUE (scenario_id, step_order)
    );
    CREATE TABLE friend_scenarios (
      id TEXT PRIMARY KEY,
      friend_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      current_step_order INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      next_delivery_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_friend_scenarios_unique
      ON friend_scenarios (friend_id, scenario_id) WHERE status != 'completed';
    CREATE TABLE messages_log (
      id TEXT PRIMARY KEY,
      friend_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      scenario_step_id TEXT
    );
  `);
  const d1 = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite, sql);
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

function insertScenario(sqlite: Database.Database, mode = 'relative') {
  sqlite.prepare(`INSERT INTO scenarios (id, delivery_mode) VALUES ('scenario-1', ?)`).run(mode);
  const insert = sqlite.prepare(
    `INSERT INTO scenario_steps
       (id, scenario_id, step_order, delay_minutes, message_type, message_content,
        offset_days, offset_minutes, delivery_time)
     VALUES (?, 'scenario-1', ?, ?, 'text', ?, ?, ?, ?)`,
  );
  insert.run('step-10', 10, 0, 'step 1', null, null, null);
  insert.run('step-30', 30, 60, 'step 2', null, null, null);
  insert.run('step-50', 50, 120, 'step 3', null, null, null);
}

describe('manual scenario start state', () => {
  test('reports the live run, next sparse step, and delivered history without changing it', async () => {
    const { sqlite, d1 } = setupDb();
    insertScenario(sqlite);
    sqlite.prepare(
      `INSERT INTO friend_scenarios VALUES
       ('run-1', 'friend-1', 'scenario-1', 10, 'active', ?, ?, ?)`,
    ).run(
      '2026-09-28T09:00:00.000+09:00',
      '2026-09-29T09:00:00.000+09:00',
      '2026-09-29T09:00:00.000+09:00',
    );
    sqlite.prepare(`INSERT INTO messages_log VALUES ('log-1', 'friend-1', 'outgoing', 'step-10')`).run();
    sqlite.prepare(`INSERT INTO messages_log VALUES ('log-in', 'friend-1', 'incoming', 'step-30')`).run();

    const state = await getManualScenarioStartState(d1, 'scenario-1', 'friend-1');

    expect(state.enrollment?.id).toBe('run-1');
    expect(state.current_next_step?.id).toBe('step-30');
    expect(state.sent_step_orders).toEqual([10]);
    expect(state.state_version).not.toBe('none');
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM messages_log`).get()).toEqual({ count: 2 });
    sqlite.close();
  });
});

describe('startFriendScenarioFromStep', () => {
  test('repositions an active run to a sparse step, queues Cron, and preserves sent logs', async () => {
    const { sqlite, d1 } = setupDb();
    insertScenario(sqlite);
    sqlite.prepare(
      `INSERT INTO friend_scenarios VALUES
       ('run-1', 'friend-1', 'scenario-1', 10, 'active', ?, ?, ?)`,
    ).run(
      '2026-09-28T09:00:00.000+09:00',
      '2026-09-29T09:00:00.000+09:00',
      '2026-09-29T09:00:00.000+09:00',
    );
    sqlite.prepare(`INSERT INTO messages_log VALUES ('log-1', 'friend-1', 'outgoing', 'step-10')`).run();
    const before = await getManualScenarioStartState(d1, 'scenario-1', 'friend-1');
    const now = new Date('2026-09-29T00:00:00.000Z');

    const result = await startFriendScenarioFromStep(d1, {
      friendId: 'friend-1',
      scenarioId: 'scenario-1',
      stepId: 'step-30',
      deliveryTiming: 'next_cron',
      expectedStateVersion: before.state_version,
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.action).toBe('repositioned');
    expect(result.previous_step_order).toBe(10);
    expect(result.enrollment.next_delivery_at).toBe('2026-09-29T09:00:00.000+09:00');
    expect(result.enrollment.updated_at).toBe('2026-09-29T09:00:00.001+09:00');
    expect(result.state_version).not.toBe(before.state_version);
    expect(result.sent_step_orders).toEqual([10]);
    const stored = sqlite.prepare(`SELECT * FROM friend_scenarios WHERE id = 'run-1'`).get() as Record<string, unknown>;
    expect(stored.current_step_order).toBe(10);
    expect(stored.status).toBe('active');
    expect(stored.started_at).toBe('2026-09-28T09:00:00.000+09:00');
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM messages_log`).get()).toEqual({ count: 1 });

    const staleRetry = await startFriendScenarioFromStep(d1, {
      friendId: 'friend-1',
      scenarioId: 'scenario-1',
      stepId: 'step-50',
      deliveryTiming: 'next_cron',
      expectedStateVersion: before.state_version,
      now: new Date('2026-09-29T00:01:00.000Z'),
    });
    expect(staleRetry).toEqual({ ok: false, reason: 'state_changed' });
    sqlite.close();
  });

  test('resumes a paused run and applies the configured delay from now', async () => {
    const { sqlite, d1 } = setupDb();
    insertScenario(sqlite);
    sqlite.prepare(
      `INSERT INTO friend_scenarios VALUES
       ('run-1', 'friend-1', 'scenario-1', 10, 'paused', ?, NULL, ?)`,
    ).run('2026-09-20T09:00:00.000+09:00', '2026-09-28T09:00:00.000+09:00');
    const before = await getManualScenarioStartState(d1, 'scenario-1', 'friend-1');

    const result = await startFriendScenarioFromStep(d1, {
      friendId: 'friend-1',
      scenarioId: 'scenario-1',
      stepId: 'step-30',
      deliveryTiming: 'configured',
      expectedStateVersion: before.state_version,
      now: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.action).toBe('resumed');
    expect(result.enrollment.next_delivery_at).toBe('2026-09-29T10:00:00.000+09:00');
    expect(result.enrollment.started_at).toBe('2026-09-20T09:00:00.000+09:00');
    sqlite.close();
  });

  test('never overwrites a run currently claimed for delivery', async () => {
    const { sqlite, d1 } = setupDb();
    insertScenario(sqlite);
    sqlite.prepare(
      `INSERT INTO friend_scenarios VALUES
       ('run-1', 'friend-1', 'scenario-1', 10, 'delivering', ?, ?, ?)`,
    ).run(
      '2026-09-28T09:00:00.000+09:00',
      '2026-09-29T09:00:00.000+09:00',
      '2026-09-29T09:00:00.000+09:00',
    );
    const before = await getManualScenarioStartState(d1, 'scenario-1', 'friend-1');

    const result = await startFriendScenarioFromStep(d1, {
      friendId: 'friend-1',
      scenarioId: 'scenario-1',
      stepId: 'step-30',
      deliveryTiming: 'next_cron',
      expectedStateVersion: before.state_version,
      now: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result).toEqual({ ok: false, reason: 'delivery_in_progress' });
    expect(sqlite.prepare(`SELECT status, current_step_order FROM friend_scenarios`).get())
      .toEqual({ status: 'delivering', current_step_order: 10 });
    sqlite.close();
  });

  test('creates a new run after completed history and uses the previous real sparse order', async () => {
    const { sqlite, d1 } = setupDb();
    insertScenario(sqlite, 'elapsed');
    sqlite.prepare(
      `UPDATE scenario_steps SET offset_days = 1, offset_minutes = 30 WHERE id = 'step-50'`,
    ).run();
    sqlite.prepare(
      `INSERT INTO friend_scenarios VALUES
       ('completed-run', 'friend-1', 'scenario-1', 50, 'completed', ?, NULL, ?)`,
    ).run('2026-09-01T09:00:00.000+09:00', '2026-09-03T09:00:00.000+09:00');
    sqlite.prepare(`INSERT INTO messages_log VALUES ('log-1', 'friend-1', 'outgoing', 'step-10')`).run();
    const before = await getManualScenarioStartState(d1, 'scenario-1', 'friend-1');
    expect(before.state_version).toBe('none');

    const result = await startFriendScenarioFromStep(d1, {
      friendId: 'friend-1',
      scenarioId: 'scenario-1',
      stepId: 'step-50',
      deliveryTiming: 'configured',
      expectedStateVersion: 'none',
      now: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.action).toBe('created');
    expect(result.previous_step_order).toBe(30);
    expect(result.enrollment.current_step_order).toBe(30);
    expect(result.enrollment.started_at).toBe('2026-09-29T09:00:00.000+09:00');
    expect(result.enrollment.next_delivery_at).toBe('2026-09-30T09:30:00.000+09:00');
    expect(result.sent_step_orders).toEqual([10]);
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM friend_scenarios`).get()).toEqual({ count: 2 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM messages_log`).get()).toEqual({ count: 1 });
    sqlite.close();
  });

  test('rejects a step from another scenario without changing the run', async () => {
    const { sqlite, d1 } = setupDb();
    insertScenario(sqlite);
    sqlite.prepare(`INSERT INTO scenarios VALUES ('scenario-2', 'relative')`).run();
    sqlite.prepare(
      `INSERT INTO scenario_steps
       (id, scenario_id, step_order, delay_minutes, message_type, message_content)
       VALUES ('foreign-step', 'scenario-2', 20, 0, 'text', 'foreign')`,
    ).run();
    const result = await startFriendScenarioFromStep(d1, {
      friendId: 'friend-1',
      scenarioId: 'scenario-1',
      stepId: 'foreign-step',
      deliveryTiming: 'next_cron',
      expectedStateVersion: 'none',
      now: new Date('2026-09-29T00:00:00.000Z'),
    });
    expect(result).toEqual({ ok: false, reason: 'step_not_found' });
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM friend_scenarios`).get()).toEqual({ count: 0 });
    sqlite.close();
  });
});
