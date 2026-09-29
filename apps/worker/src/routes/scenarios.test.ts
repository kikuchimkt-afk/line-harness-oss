import { describe, expect, test, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

const dbMocks = {
  getScenarios: vi.fn(),
  getScenarioById: vi.fn(),
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  createScenarioStep: vi.fn(),
  updateScenarioStep: vi.fn(),
  deleteScenarioStep: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getManualScenarioStartState: vi.fn(),
  startFriendScenarioFromStep: vi.fn(),
  getFriendById: vi.fn(),
  computeNextDeliveryAt: vi.fn(),
  resolveStepContent: vi.fn(),
  getStaffAccountIds: vi.fn(),
  staffCanAccessLineAccount: vi.fn(),
};
vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../services/scenario-stats.js', () => ({
  computeScenarioStats: vi.fn(),
}));

const scenarioDeliveryStatusMocks = {
  getScenarioDeliveryStatus: vi.fn(),
};
vi.mock('../services/scenario-delivery-status.js', () => scenarioDeliveryStatusMocks);

const { scenarios: scenariosModule } = await import('./scenarios.js');

interface ScenarioRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_tag_id: string | null;
  is_active: number;
  delivery_mode: string;
  created_at: string;
  updated_at: string;
  line_account_id: string | null;
  step_count: number;
}

function makeScenarioDb(rows: ScenarioRow[]) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async all<_T>() {
          calls.push({ sql, binds: bound });
          if (/FROM scenarios s\b/i.test(sql) && /line_account_id IS NULL/i.test(sql)) {
            const [lineAccountId] = bound as [string];
            const filtered = rows.filter(
              (r) => r.line_account_id == null || r.line_account_id === lineAccountId,
            );
            return { results: filtered };
          }
          if (/FROM scenarios s\b/i.test(sql) && /s\.line_account_id = \?/i.test(sql)) {
            const [lineAccountId] = bound as [string];
            return { results: rows.filter((r) => r.line_account_id === lineAccountId) };
          }
          if (/FROM scenarios s\b/i.test(sql) && /s\.line_account_id IN/i.test(sql)) {
            const allowed = new Set(bound as string[]);
            return { results: rows.filter((r) => r.line_account_id && allowed.has(r.line_account_id)) };
          }
          return { results: [] };
        },
        async first<_T>() {
          calls.push({ sql, binds: bound });
          if (/SELECT line_account_id FROM scenarios WHERE id = \?/i.test(sql)) {
            const [scenarioId] = bound as [string];
            const row = rows.find((candidate) => candidate.id === scenarioId);
            return (row ? { line_account_id: row.line_account_id } : null) as _T | null;
          }
          return null;
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls };
}

function setupApp(db: D1Database, role: 'owner' | 'admin' | 'staff' = 'owner') {
  const app = new Hono<{
    Bindings: { DB: D1Database };
    Variables: { staff: { id: string; name: string; role: 'owner' | 'admin' | 'staff' } };
  }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db };
    c.set('staff', { id: `${role}-1`, name: role, role });
    await next();
  });
  app.route('/', scenariosModule);
  return app;
}

const rowBase = {
  description: null,
  trigger_type: 'friend_add',
  trigger_tag_id: null,
  is_active: 1,
  delivery_mode: 'relative',
  created_at: '2026-05-20T00:00:00.000',
  updated_at: '2026-05-20T00:00:00.000',
  step_count: 0,
};

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  scenarioDeliveryStatusMocks.getScenarioDeliveryStatus.mockReset();
  dbMocks.staffCanAccessLineAccount.mockResolvedValue(true);
  dbMocks.getStaffAccountIds.mockResolvedValue([]);
});

describe('GET /api/scenarios/:id/delivery-status', () => {
  test('returns private non-cacheable recipient status without exposing raw LINE fields', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    scenarioDeliveryStatusMocks.getScenarioDeliveryStatus.mockResolvedValue({
      generatedAt: '2026-09-29T09:00:00.000Z',
      sentMessageTotal: 1,
      sentDeliveryTotal: 1,
      sentRecipientTotal: 1,
      upcomingRecipientTotal: 1,
      sentHasMore: false,
      upcomingHasMore: false,
      sent: [{
        id: 'friend-1:step-1',
        friendId: 'friend-1',
        displayName: '徳島 花子',
        pictureUrl: null,
        stepOrder: 1,
        sentAt: '2026-09-29T18:00:00.000+09:00',
        messageType: 'text',
        sendCount: 1,
      }],
      upcoming: [{
        enrollmentId: 'enrollment-1',
        friendId: 'friend-1',
        displayName: '徳島 花子',
        pictureUrl: null,
        status: 'active',
        startedAt: '2026-09-29T18:00:00.000+09:00',
        nextDeliveryAt: '2026-09-30T18:30:00.000+09:00',
        updatedAt: '2026-09-29T18:00:00.000+09:00',
        nextStepOrder: 2,
        messageType: 'text',
      }],
    });

    const res = await setupApp(db).request('/api/scenarios/scenario-1/delivery-status?limit=25');

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(scenarioDeliveryStatusMocks.getScenarioDeliveryStatus)
      .toHaveBeenCalledWith(db, 'scenario-1', '25');
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('line_user_id');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('messageContent');
  });

  test('keeps the account boundary and does not query recipient data when access is denied', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    dbMocks.staffCanAccessLineAccount.mockResolvedValue(false);

    const res = await setupApp(db, 'staff').request('/api/scenarios/scenario-1/delivery-status');

    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(scenarioDeliveryStatusMocks.getScenarioDeliveryStatus).not.toHaveBeenCalled();
  });
});

describe('GET /api/scenarios?lineAccountId=X', () => {
  test('includes both account-bound and global (NULL) scenarios', async () => {
    const rows: ScenarioRow[] = [
      { id: 's-global', name: 'global', line_account_id: null, ...rowBase },
      { id: 's-acc1', name: 'acc1', line_account_id: 'acc-1', ...rowBase },
      { id: 's-acc2', name: 'acc2', line_account_id: 'acc-2', ...rowBase },
    ];
    const { db, calls } = makeScenarioDb(rows);

    const res = await setupApp(db).request('/api/scenarios?lineAccountId=acc-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { id: string; lineAccountId: string | null }[] };
    expect(body.success).toBe(true);
    // webhook.ts:211 / liff.ts:878 trigger scenarios where line_account_id is
    // NULL (global) OR matches the active account. The list endpoint must
    // mirror that so the UI does not hide records the engine will fire.
    const ids = body.data.map((d) => d.id).sort();
    expect(ids).toEqual(['s-acc1', 's-global']);
    // Serializer surfaces the binding so the UI can distinguish 全アカ共通 from
    // an account-specific scenario.
    const globalRow = body.data.find((d) => d.id === 's-global');
    expect(globalRow?.lineAccountId).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/line_account_id IS NULL/);
    expect(calls[0].sql).toMatch(/s\.line_account_id = \?/);
    expect(calls[0].binds).toEqual(['acc-1']);
  });

  test('falls back to getScenarios helper when no lineAccountId is provided', async () => {
    dbMocks.getScenarios.mockResolvedValue([
      { id: 's-x', name: 'x', line_account_id: null, ...rowBase },
    ]);
    const { db } = makeScenarioDb([]);

    const res = await setupApp(db).request('/api/scenarios');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { id: string }[] };
    expect(body.data.map((d) => d.id)).toEqual(['s-x']);
    expect(dbMocks.getScenarios).toHaveBeenCalledTimes(1);
  });

  test('restricted admin with no assigned accounts sees no scenarios', async () => {
    dbMocks.getStaffAccountIds.mockResolvedValue([]);
    dbMocks.getScenarios.mockResolvedValue([
      { id: 's-global', name: 'global', line_account_id: null, ...rowBase },
      { id: 's-acc1', name: 'acc1', line_account_id: 'acc-1', ...rowBase },
    ]);
    const { db } = makeScenarioDb([]);

    const res = await setupApp(db, 'admin').request('/api/scenarios');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { id: string }[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(dbMocks.getScenarios).not.toHaveBeenCalled();
  });

  test('returns empty array when filter matches nothing and no globals exist', async () => {
    const rows: ScenarioRow[] = [
      { id: 's-other', name: 'other', line_account_id: 'acc-other', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);

    const res = await setupApp(db).request('/api/scenarios?lineAccountId=acc-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.data).toEqual([]);
  });

  test('restricted admin sees only assigned account scenarios, not global scenarios', async () => {
    dbMocks.staffCanAccessLineAccount.mockResolvedValue(true);
    dbMocks.getStaffAccountIds.mockResolvedValue(['acc-1']);
    const rows: ScenarioRow[] = [
      { id: 's-global', name: 'global', line_account_id: null, ...rowBase },
      { id: 's-acc1', name: 'acc1', line_account_id: 'acc-1', ...rowBase },
      { id: 's-acc2', name: 'acc2', line_account_id: 'acc-2', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);

    const res = await setupApp(db, 'admin').request('/api/scenarios?lineAccountId=acc-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { id: string }[] };
    expect(body.data.map((d) => d.id)).toEqual(['s-acc1']);
  });
});

const manualSteps = [
  {
    id: 'step-10',
    scenario_id: 'scenario-1',
    step_order: 10,
    delay_minutes: 0,
    offset_days: null,
    offset_minutes: null,
    delivery_time: null,
    message_type: 'text',
    message_content: 'first',
    condition_type: null,
    condition_value: null,
    next_step_on_false: null,
    template_id: null,
    on_reach_tag_id: null,
    created_at: '2026-09-01T00:00:00.000+09:00',
  },
  {
    id: 'step-30',
    scenario_id: 'scenario-1',
    step_order: 30,
    delay_minutes: 60,
    offset_days: null,
    offset_minutes: null,
    delivery_time: null,
    message_type: 'text',
    message_content: 'second',
    condition_type: null,
    condition_value: null,
    next_step_on_false: null,
    template_id: null,
    on_reach_tag_id: null,
    created_at: '2026-09-01T00:00:00.000+09:00',
  },
] as const;

function mockManualContext(overrides?: {
  scenarioAccountId?: string | null;
  friendAccountId?: string | null;
  scenarioActive?: number;
  friendFollowing?: number;
}) {
  dbMocks.getScenarioById.mockResolvedValue({
    id: 'scenario-1',
    name: 'Scenario',
    description: null,
    trigger_type: 'manual',
    trigger_tag_id: null,
    line_account_id: overrides?.scenarioAccountId === undefined ? 'acc-1' : overrides.scenarioAccountId,
    is_active: overrides?.scenarioActive ?? 1,
    delivery_mode: 'relative',
    created_at: '2026-09-01T00:00:00.000+09:00',
    updated_at: '2026-09-01T00:00:00.000+09:00',
    steps: manualSteps,
  });
  dbMocks.getFriendById.mockResolvedValue({
    id: 'friend-1',
    line_user_id: 'U-secret',
    display_name: 'Test Friend',
    picture_url: 'https://example.com/picture.jpg',
    status_message: 'secret status',
    is_following: overrides?.friendFollowing ?? 1,
    user_id: 'user-secret',
    line_account_id: overrides?.friendAccountId === undefined ? 'acc-1' : overrides.friendAccountId,
    metadata: '{"private":"value"}',
    first_tracked_link_id: null,
    created_at: '2026-09-01T00:00:00.000+09:00',
    updated_at: '2026-09-01T00:00:00.000+09:00',
  });
}

describe('manual scenario start endpoints', () => {
  test('GET returns a no-store sanitized confirmation snapshot', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext();
    dbMocks.getManualScenarioStartState.mockResolvedValue({
      enrollment: {
        id: 'run-1',
        friend_id: 'friend-1',
        scenario_id: 'scenario-1',
        current_step_order: 10,
        status: 'active',
        started_at: '2026-09-28T09:00:00.000+09:00',
        next_delivery_at: '2026-09-29T10:00:00.000+09:00',
        updated_at: '2026-09-28T09:00:00.000+09:00',
      },
      current_next_step: manualSteps[1],
      sent_step_orders: [10],
      state_version: 'snapshot-1',
    });

    const res = await setupApp(db, 'staff').request(
      '/api/scenarios/scenario-1/manual-start-state/friend-1',
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await res.json() as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.stateVersion).toBe('snapshot-1');
    expect(body.data.sentStepOrders).toEqual([10]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('U-secret');
    expect(serialized).not.toContain('user-secret');
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('messageContent');
  });

  test('GET allows a global scenario after checking the friend account scope and normalizes a blank name', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'global scenario', line_account_id: null, ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext({ scenarioAccountId: null, friendAccountId: 'acc-1' });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U-secret',
      display_name: '   ',
      picture_url: null,
      status_message: null,
      is_following: 1,
      user_id: null,
      line_account_id: 'acc-1',
      metadata: '{}',
      first_tracked_link_id: null,
      created_at: '2026-09-01T00:00:00.000+09:00',
      updated_at: '2026-09-01T00:00:00.000+09:00',
    });
    dbMocks.getManualScenarioStartState.mockResolvedValue({
      enrollment: null,
      current_next_step: null,
      sent_step_orders: [],
      state_version: 'none',
    });

    const res = await setupApp(db, 'staff').request(
      '/api/scenarios/scenario-1/manual-start-state/friend-1',
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { friend: { displayName: string } } };
    expect(body.data.friend.displayName).toBe('名前未設定');
    expect(dbMocks.staffCanAccessLineAccount).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ role: 'staff' }),
      'acc-1',
    );
  });

  test('POST repositions a run through the queue without invoking any LINE push', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext();
    dbMocks.startFriendScenarioFromStep.mockResolvedValue({
      ok: true,
      action: 'repositioned',
      enrollment: {
        id: 'run-1',
        friend_id: 'friend-1',
        scenario_id: 'scenario-1',
        current_step_order: 10,
        status: 'active',
        started_at: '2026-09-28T09:00:00.000+09:00',
        next_delivery_at: '2026-09-29T09:00:00.000+09:00',
        updated_at: '2026-09-29T09:00:00.000+09:00',
      },
      start_step: manualSteps[1],
      previous_step_order: 10,
      sent_step_orders: [10],
      state_version: 'snapshot-2',
    });

    const res = await setupApp(db).request('/api/scenarios/scenario-1/start-from-step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        friendId: 'friend-1',
        stepId: 'step-30',
        deliveryTiming: 'next_cron',
        expectedStateVersion: 'snapshot-1',
      }),
    });

    expect(res.status).toBe(200);
    expect(dbMocks.startFriendScenarioFromStep).toHaveBeenCalledWith(db, {
      scenarioId: 'scenario-1',
      friendId: 'friend-1',
      stepId: 'step-30',
      deliveryTiming: 'next_cron',
      expectedStateVersion: 'snapshot-1',
    });
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.action).toBe('repositioned');
    expect(body.data.sentStepOrders).toEqual([10]);
    expect(body.data.skippedStepOrders).toEqual([]);
  });

  test.each([
    ['delivery_in_progress', 'DELIVERY_IN_PROGRESS', '配信処理中'],
    ['state_changed', 'STATE_CHANGED', '状態が変わりました'],
  ] as const)('POST maps %s races to a retryable 409', async (reason, code, message) => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext();
    dbMocks.startFriendScenarioFromStep.mockResolvedValue({ ok: false, reason });

    const res = await setupApp(db).request('/api/scenarios/scenario-1/start-from-step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        friendId: 'friend-1',
        stepId: 'step-30',
        deliveryTiming: 'configured',
        expectedStateVersion: 'snapshot-1',
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { code: string; error: string };
    expect(body.code).toBe(code);
    expect(body.error).toContain(message);
  });

  test('POST rejects a step that belongs to another scenario before changing state', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext();
    const res = await setupApp(db).request('/api/scenarios/scenario-1/start-from-step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        friendId: 'friend-1',
        stepId: 'foreign-step',
        deliveryTiming: 'configured',
        expectedStateVersion: 'none',
      }),
    });
    expect(res.status).toBe(404);
    expect((await res.json() as { code: string }).code).toBe('STEP_NOT_FOUND');
    expect(dbMocks.startFriendScenarioFromStep).not.toHaveBeenCalled();
  });

  test.each([
    [{ scenarioActive: 0 }, 'SCENARIO_INACTIVE', '無効'],
    [{ friendFollowing: 0 }, 'FRIEND_NOT_FOLLOWING', '解除済み'],
    [{ friendAccountId: 'acc-2' }, 'LINE_ACCOUNT_MISMATCH', '別のLINEアカウント'],
  ])('POST protects eligibility: %j', async (overrides, code, message) => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext(overrides);
    const res = await setupApp(db).request('/api/scenarios/scenario-1/start-from-step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        friendId: 'friend-1',
        stepId: 'step-30',
        deliveryTiming: 'configured',
        expectedStateVersion: 'none',
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { code: string; error: string };
    expect(body.code).toBe(code);
    expect(body.error).toContain(message);
    expect(dbMocks.startFriendScenarioFromStep).not.toHaveBeenCalled();
  });

  test('friend account staff scope is checked independently of scenario scope', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext();
    dbMocks.staffCanAccessLineAccount
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const res = await setupApp(db, 'staff').request(
      '/api/scenarios/scenario-1/manual-start-state/friend-1',
    );
    expect(res.status).toBe(403);
    expect(dbMocks.getManualScenarioStartState).not.toHaveBeenCalled();
  });
});

describe('legacy manual enroll eligibility', () => {
  test('does not enroll an inactive scenario', async () => {
    const rows: ScenarioRow[] = [
      { id: 'scenario-1', name: 'scenario', line_account_id: 'acc-1', ...rowBase },
    ];
    const { db } = makeScenarioDb(rows);
    mockManualContext({ scenarioActive: 0 });

    const res = await setupApp(db).request('/api/scenarios/scenario-1/enroll/friend-1', {
      method: 'POST',
    });

    expect(res.status).toBe(409);
    expect((await res.json() as { code: string }).code).toBe('SCENARIO_INACTIVE');
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
  });
});
