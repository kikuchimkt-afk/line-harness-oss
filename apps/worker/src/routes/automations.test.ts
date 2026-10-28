import { describe, expect, test, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// We assert on the SQL/binds the route forwards to D1. The DB-helper path
// (no lineAccountId query) is mocked separately on @line-crm/db.
const dbMocks = {
  getAutomations: vi.fn(),
  getAutomationById: vi.fn(),
  createAutomation: vi.fn(),
  updateAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  getAutomationLogs: vi.fn(),
  staffCanAccessLineAccount: vi.fn(),
  getStaffAccountIds: vi.fn(),
};
vi.mock('@line-crm/db', () => dbMocks);

const retryMocks = {
  retryFailedRichMenuAssignments: vi.fn(),
  retryRichMenuAssignment: vi.fn(),
};
vi.mock('../services/rich-menu-assignment.js', () => retryMocks);

const { automations } = await import('./automations.js');

interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  event_type: string;
  conditions: string;
  actions: string;
  is_active: number;
  priority: number;
  created_at: string;
  updated_at: string;
  line_account_id: string | null;
}

function makeAutomationDb(rows: AutomationRow[]) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async all() {
          calls.push({ sql, binds: bound });
          // NULL-aware filter: row matches when its line_account_id is NULL
          // (global) OR equals the bound lineAccountId.
          if (/FROM automations\b/i.test(sql) && /line_account_id IS NULL/i.test(sql)) {
            const [lineAccountId] = bound as [string];
            const filtered = rows.filter(
              (r) => r.line_account_id == null || r.line_account_id === lineAccountId,
            );
            return { results: filtered };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls };
}

function setupApp(db: D1Database) {
  const app = new Hono<{
    Bindings: { DB: D1Database };
    Variables: { staff: { id: string; name: string; role: 'owner' | 'admin' | 'staff' } };
  }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db };
    c.set('staff', { id: 'owner-test', name: 'Owner', role: 'owner' });
    await next();
  });
  app.route('/', automations);
  return app;
}

const rowBase = {
  description: null,
  event_type: 'message_received',
  conditions: '{}',
  actions: '[]',
  is_active: 1,
  priority: 0,
  created_at: '2026-05-20T00:00:00.000',
  updated_at: '2026-05-20T00:00:00.000',
};

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  for (const fn of Object.values(retryMocks)) fn.mockReset();
  dbMocks.staffCanAccessLineAccount.mockResolvedValue(true);
});

describe('GET /api/automations?lineAccountId=X', () => {
  test('includes both account-bound and global (NULL) automations', async () => {
    const rows: AutomationRow[] = [
      { id: 'a-global', name: 'global', line_account_id: null, ...rowBase },
      { id: 'a-acc1', name: 'acc1', line_account_id: 'acc-1', ...rowBase },
      { id: 'a-acc2', name: 'acc2', line_account_id: 'acc-2', ...rowBase },
    ];
    const { db, calls } = makeAutomationDb(rows);

    const res = await setupApp(db).request('/api/automations?lineAccountId=acc-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { id: string; lineAccountId: string | null }[];
    };
    expect(body.success).toBe(true);
    const ids = body.data.map((d) => d.id).sort();
    // The engine (event-bus.ts:149) fires automations whose line_account_id
    // is NULL OR equal to the active account. The list endpoint must mirror
    // that scope, otherwise globals + freshly-created records disappear in
    // the UI even though they will still execute.
    expect(ids).toEqual(['a-acc1', 'a-global']);
    // Scope must be surfaced so callers can tell globals from account-bound
    // rows — otherwise the UI cannot safely offer per-account edit/disable.
    const byId = new Map(body.data.map((d) => [d.id, d.lineAccountId] as const));
    expect(byId.get('a-global')).toBeNull();
    expect(byId.get('a-acc1')).toBe('acc-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/line_account_id IS NULL/);
    expect(calls[0].sql).toMatch(/line_account_id = \?/);
    expect(calls[0].binds).toEqual(['acc-1']);
  });

  test('falls back to getAutomations helper when no lineAccountId is provided', async () => {
    dbMocks.getAutomations.mockResolvedValue([
      { id: 'a-x', name: 'x', line_account_id: null, ...rowBase },
    ]);
    const { db } = makeAutomationDb([]);

    const res = await setupApp(db).request('/api/automations');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { id: string }[] };
    expect(body.data.map((d) => d.id)).toEqual(['a-x']);
    expect(dbMocks.getAutomations).toHaveBeenCalledTimes(1);
  });

  test('returns empty array when filter matches nothing and no globals exist', async () => {
    const rows: AutomationRow[] = [
      { id: 'a-other', name: 'other', line_account_id: 'acc-other', ...rowBase },
    ];
    const { db } = makeAutomationDb(rows);

    const res = await setupApp(db).request('/api/automations?lineAccountId=acc-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.data).toEqual([]);
  });
});

describe('automation account scope mutations', () => {
  test('POST forwards lineAccountId and returns it', async () => {
    const row: AutomationRow = {
      id: 'a-created',
      name: '5歳 reply',
      line_account_id: 'acc-aikotoba',
      ...rowBase,
    };
    dbMocks.createAutomation.mockResolvedValue(row);
    const { db } = makeAutomationDb([]);

    const res = await setupApp(db).request('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '5歳 reply',
        eventType: 'message_received',
        conditions: { keyword_exact: '5歳' },
        actions: [{ type: 'send_message', params: { content: 'hello' } }],
        lineAccountId: 'acc-aikotoba',
        priority: 100,
      }),
    });

    expect(res.status).toBe(201);
    expect(dbMocks.createAutomation).toHaveBeenCalledWith(db, expect.objectContaining({
      lineAccountId: 'acc-aikotoba',
    }));
    const body = (await res.json()) as { data: { lineAccountId: string | null } };
    expect(body.data.lineAccountId).toBe('acc-aikotoba');
  });

  test('GET by id returns lineAccountId', async () => {
    dbMocks.getAutomationById.mockResolvedValue({
      id: 'a-scoped',
      name: 'scoped',
      line_account_id: 'acc-aikotoba',
      ...rowBase,
    });
    dbMocks.getAutomationLogs.mockResolvedValue([]);
    const { db } = makeAutomationDb([]);

    const res = await setupApp(db).request('/api/automations/a-scoped');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { lineAccountId: string | null } };
    expect(body.data.lineAccountId).toBe('acc-aikotoba');
  });

  test('PUT forwards and returns lineAccountId', async () => {
    dbMocks.updateAutomation.mockResolvedValue(undefined);
    dbMocks.getAutomationById.mockResolvedValue({
      id: 'a-scoped',
      name: 'scoped',
      line_account_id: 'acc-after',
      ...rowBase,
    });
    const { db } = makeAutomationDb([]);

    const res = await setupApp(db).request('/api/automations/a-scoped', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineAccountId: 'acc-after', isActive: false }),
    });

    expect(res.status).toBe(200);
    expect(dbMocks.updateAutomation).toHaveBeenCalledWith(db, 'a-scoped', {
      lineAccountId: 'acc-after',
      isActive: false,
    });
    const body = (await res.json()) as { data: { lineAccountId: string | null } };
    expect(body.data.lineAccountId).toBe('acc-after');
  });
});

describe('rich-menu assignment operations', () => {
  test('returns sanitized status counts and never exposes raw LINE errors', async () => {
    const db = {
      prepare(sql: string) {
        let bound: unknown[] = [];
        const stmt = {
          bind(...args: unknown[]) { bound = args; return stmt; },
          async all() {
            if (sql.includes('COUNT(*)')) {
              return { results: [
                { status: 'applied', count: 12 },
                { status: 'retry_wait', count: 2 },
                { status: 'failed_permanent', count: 1 },
              ] };
            }
            return { results: [{
              friend_id: 'friend-secret', automation_id: 'auto-1', automation_name: 'LP流入',
              source: 'automation', status: 'failed_permanent', retry_count: 5,
              max_retries: 5, next_attempt_at: null, last_attempt_at: '2026-09-22T10:00:00+09:00',
              applied_at: null, verified_at: null,
              last_error: 'LINE API error: 401 raw-provider-body', updated_at: '2026-09-22T10:00:00+09:00',
            }] };
          },
          async first() { return null; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        void bound;
        return stmt;
      },
    } as unknown as D1Database;

    const res = await setupApp(db).request(
      '/api/automations/rich-menu-assignments?lineAccountId=acc-1',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { summary: { applied: number; waiting: number; needsAttention: number; total: number }; items: Array<Record<string, unknown>> };
    };
    expect(body.data.summary).toEqual({ applied: 12, waiting: 2, needsAttention: 1, total: 15 });
    expect(body.data.items[0]).toMatchObject({
      assignmentKey: 'friend-secret', reasonLabel: '設定またはLINE接続の確認が必要です', canRetry: true,
    });
    expect(JSON.stringify(body)).not.toContain('raw-provider-body');
    expect(dbMocks.staffCanAccessLineAccount).toHaveBeenCalled();
  });

  test('queues one failed assignment for manual retry', async () => {
    const db = {
      prepare() {
        return {
          bind() { return this; },
          async first() { return { line_account_id: 'acc-1' }; },
        };
      },
    } as unknown as D1Database;
    retryMocks.retryRichMenuAssignment.mockResolvedValue(true);
    const res = await setupApp(db).request(
      '/api/automations/rich-menu-assignments/friend-1/retry',
      { method: 'POST' },
    );
    expect(res.status).toBe(202);
    expect(retryMocks.retryRichMenuAssignment).toHaveBeenCalledWith(db, 'friend-1');
  });

  test('queues up to 500 failed assignments for an accessible account', async () => {
    const { db } = makeAutomationDb([]);
    retryMocks.retryFailedRichMenuAssignments.mockResolvedValue(37);
    const res = await setupApp(db).request(
      '/api/automations/rich-menu-assignments/retry-failed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineAccountId: 'acc-1' }),
      },
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ success: true, data: { queued: 37 } });
  });
});
