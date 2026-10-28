import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendByLineUserId: vi.fn(),
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  linkFriendToUser: vi.fn(),
  upsertFriend: vi.fn(),
  getEntryRouteByRefCode: vi.fn(),
  recordRefTracking: vi.fn().mockResolvedValue(undefined),
  addTagToFriend: vi.fn(),
  getLineAccountByChannelId: vi.fn(),
  getLineAccountById: vi.fn(),
  getLineAccounts: vi.fn(),
  getTrafficPoolBySlug: vi.fn(),
  getTrafficPoolById: vi.fn(),
  getRandomPoolAccount: vi.fn(),
  getPoolAccounts: vi.fn(),
  getTrackedLinkById: vi.fn().mockResolvedValue(null),
  getMessageTemplateById: vi.fn(),
  getScenarioById: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getScenarioSteps: vi.fn(),
  advanceFriendScenario: vi.fn(),
  completeFriendScenario: vi.fn(),
  getFriendById: vi.fn(),
  computeNextDeliveryAt: vi.fn(),
  resolveStepContent: vi.fn(),
  jstNow: vi.fn(() => '2026-09-22T12:00:00.000+09:00'),
}));

const attachTagAndFireSideEffects = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ added: true }),
);
const pendingRefMocks = vi.hoisted(() => ({
  savePendingRefAttribution: vi.fn(),
  recoverPendingRefAttribution: vi.fn(),
  hasPendingRefTracking: vi.fn(),
  enrollPendingEntryScenarioOnce: vi.fn(),
}));
const lineMocks = vi.hoisted(() => ({ pushMessage: vi.fn() }));
const conditionMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@line-crm/db', () => dbMocks);
vi.mock('../services/friend-tag-attach.js', () => ({ attachTagAndFireSideEffects }));
vi.mock('../services/liff-pending-ref-attribution.js', () => pendingRefMocks);
vi.mock('@line-crm/line-sdk', () => ({ LineClient: vi.fn().mockImplementation(() => lineMocks) }));
vi.mock('../services/step-delivery.js', () => ({
  evaluateCondition: conditionMock,
  buildMessage: vi.fn((_type: string, content: string) => ({ type: 'text', text: content })),
  expandVariables: vi.fn((content: string) => content),
  resolveMetadata: vi.fn().mockResolvedValue({}),
  messageToLogPayload: vi.fn((message: { type: string; text: string }) => ({ messageType: message.type, content: message.text })),
}));

const { liffRoutes } = await import('./liff.js');

function makeDb(): D1Database {
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async first() {
          return null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('POST /api/liff/link ref attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conditionMock.mockResolvedValue(true);
    dbMocks.getLineAccounts.mockResolvedValue([
      { id: 'acc-1', login_channel_id: 'login-channel-1' },
    ]);
    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U_line',
      line_account_id: 'acc-1',
      user_id: 'user-uuid',
    });
    dbMocks.getEntryRouteByRefCode.mockResolvedValue({
      id: 'route-1',
      ref_code: 'lp-ref',
      tag_id: 'tag-1',
      scenario_id: null,
      is_active: 1,
    });
    dbMocks.getTrackedLinkById.mockResolvedValue(null);
    dbMocks.recordRefTracking.mockResolvedValue(undefined);
    attachTagAndFireSideEffects.mockResolvedValue({ added: true });
    pendingRefMocks.savePendingRefAttribution.mockResolvedValue(true);
    pendingRefMocks.recoverPendingRefAttribution.mockResolvedValue('lp-ref');
    pendingRefMocks.hasPendingRefTracking.mockResolvedValue(false);
    pendingRefMocks.enrollPendingEntryScenarioOnce.mockResolvedValue(true);
    dbMocks.createUser.mockResolvedValue({ id: 'new-user' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(
        new Response(JSON.stringify({ sub: 'U_line' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes an LP entry tag through the idempotent side-effect helper', async () => {
    const db = makeDb();
    const response = await liffRoutes.request(
      'https://worker.example.com/api/liff/link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'valid-token', ref: 'lp-ref' }),
      },
      {
        DB: db,
        LINE_LOGIN_CHANNEL_ID: 'login-channel-1',
        WORKER_URL: 'https://worker.example.com',
      },
    );

    expect(response.status).toBe(200);
    expect(dbMocks.getFriendByLineUserId).toHaveBeenCalledWith(db, 'U_line', 'acc-1');
    expect(attachTagAndFireSideEffects).toHaveBeenCalledWith(db, 'friend-1', 'tag-1');
    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
    expect(pendingRefMocks.savePendingRefAttribution).not.toHaveBeenCalled();
  });

  async function dispatch(db = makeDb(), ref: string | null = 'lp-ref') {
    return liffRoutes.request('https://worker.example.com/api/liff/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'synthetic-valid-token', ref }),
    }, { DB: db, LINE_LOGIN_CHANNEL_ID: 'login-channel-1', WORKER_URL: 'https://worker.example.com' });
  }

  it('durably saves a verified new entrant before follow without tags/messages/users', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    const db = makeDb();
    const response = await dispatch(db);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ success: true, data: { pendingAttribution: true, entryRefRequired: true, awaitingFriendship: true } });
    expect(pendingRefMocks.savePendingRefAttribution).toHaveBeenCalledWith(db, 'acc-1', 'U_line', 'lp-ref');
    expect(attachTagAndFireSideEffects).not.toHaveBeenCalled();
    expect(dbMocks.createUser).not.toHaveBeenCalled();
    expect(dbMocks.recordRefTracking).not.toHaveBeenCalled();
  });

  it('does not push or attach tags for a known unfollowed friend', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue({ id: 'friend-1', line_account_id: 'acc-1', is_following: 0, user_id: 'user-uuid' });
    expect((await dispatch()).status).toBe(202);
    expect(pendingRefMocks.savePendingRefAttribution).toHaveBeenCalledOnce();
    expect(attachTagAndFireSideEffects).not.toHaveBeenCalled();
    expect(dbMocks.recordRefTracking).not.toHaveBeenCalled();
  });

  it('rejects an account-mismatched known route rather than claiming it was saved', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    pendingRefMocks.savePendingRefAttribution.mockResolvedValue(false);
    expect((await dispatch()).status).toBe(400);
    expect(attachTagAndFireSideEffects).not.toHaveBeenCalled();
  });

  it('keeps unknown/modern tracked refs compatible without storing an inferred entry route', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    dbMocks.getEntryRouteByRefCode.mockResolvedValue(null);
    const response = await dispatch(makeDb(), 'modern-tracked-link');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: 'Friend not found',
      data: { entryRefRequired: false, awaitingFriendship: true } });
    expect(pendingRefMocks.savePendingRefAttribution).not.toHaveBeenCalled();
    expect(attachTagAndFireSideEffects).not.toHaveBeenCalled();
  });

  it('returns retryable failure when pending persistence fails', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    pendingRefMocks.savePendingRefAttribution.mockRejectedValue(new Error('synthetic DB error'));
    expect((await dispatch()).status).toBe(500);
    expect(attachTagAndFireSideEffects).not.toHaveBeenCalled();
  });

  it('does not infer a campaign when ref is absent', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    expect((await dispatch(makeDb(), null)).status).toBe(404);
    expect(pendingRefMocks.savePendingRefAttribution).not.toHaveBeenCalled();
  });

  it('recovers the pending first touch if follow arrives during the save', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValueOnce(null).mockResolvedValue({
      id: 'friend-1', line_account_id: 'acc-1', is_following: 1, user_id: 'user-uuid',
    });
    const db = makeDb();
    pendingRefMocks.hasPendingRefTracking.mockResolvedValue(true);
    expect((await dispatch(db)).status).toBe(200);
    expect(pendingRefMocks.recoverPendingRefAttribution).toHaveBeenCalledWith(db, expect.objectContaining({ id: 'friend-1' }), 'acc-1', 'U_line');
    expect(attachTagAndFireSideEffects).toHaveBeenCalledWith(db, 'friend-1', 'tag-1');
    expect(dbMocks.recordRefTracking).not.toHaveBeenCalled();
  });

  it('does not count a followed pending entrant twice when issuing the first UUID', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue({ id: 'friend-1', line_account_id: 'acc-1', is_following: 1, user_id: null });
    pendingRefMocks.hasPendingRefTracking.mockResolvedValue(true);
    expect((await dispatch()).status).toBe(200);
    expect(dbMocks.createUser).toHaveBeenCalledOnce();
    expect(dbMocks.recordRefTracking).not.toHaveBeenCalled();
  });

  it.each(['cron-already-sent', 'cron-in-flight', 'completed-history', 'uuid-refollow'])('delegates a proven pending return to Cron, without initial push replay: %s', async () => {
    dbMocks.getEntryRouteByRefCode.mockResolvedValue({ id: 'route-1', ref_code: 'lp-ref', tag_id: 'tag-1',
      scenario_id: 'scenario-1', is_active: 1 });
    pendingRefMocks.hasPendingRefTracking.mockResolvedValue(true);
    pendingRefMocks.enrollPendingEntryScenarioOnce.mockResolvedValue(false);
    expect((await dispatch()).status).toBe(200);
    expect(pendingRefMocks.enrollPendingEntryScenarioOnce).toHaveBeenCalledWith(expect.anything(), 'friend-1', 'scenario-1', 'acc-1');
    expect(attachTagAndFireSideEffects).toHaveBeenCalledWith(expect.anything(), 'friend-1', 'tag-1');
    expect(pendingRefMocks.enrollPendingEntryScenarioOnce.mock.invocationCallOrder[0])
      .toBeLessThan(attachTagAndFireSideEffects.mock.invocationCallOrder[0]);
    expect(lineMocks.pushMessage).not.toHaveBeenCalled();
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    // Already-linked visits remain click counts; only duplicate first-link
    // attribution is suppressed. No client boolean controls this decision.
    expect(dbMocks.recordRefTracking).toHaveBeenCalledOnce();
  });

  it('keeps first-link click tracking without a matching pending DB record', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue({ id: 'friend-1', line_account_id: 'acc-1', is_following: 1, user_id: null });
    pendingRefMocks.hasPendingRefTracking.mockResolvedValue(false);
    expect((await dispatch()).status).toBe(200);
    expect(dbMocks.recordRefTracking).toHaveBeenCalledOnce();
  });

  it('returns retryable failure instead of falling into a legacy tag-trigger if atomic enrollment fails', async () => {
    dbMocks.getEntryRouteByRefCode.mockResolvedValue({ id: 'route-1', ref_code: 'lp-ref', tag_id: 'tag-1',
      scenario_id: 'scenario-1', is_active: 1 });
    pendingRefMocks.hasPendingRefTracking.mockResolvedValue(true);
    pendingRefMocks.enrollPendingEntryScenarioOnce.mockRejectedValue(new Error('synthetic enrollment write failure'));
    expect((await dispatch()).status).toBe(500);
    expect(attachTagAndFireSideEffects).not.toHaveBeenCalled();
    expect(lineMocks.pushMessage).not.toHaveBeenCalled();
  });

  it.each(['legacy-entry', 'modern-tracked'])('preserves every-click first push outside proven pending routes: %s', async (kind) => {
    const source = { id: 'route-1', ref_code: 'lp-ref', tag_id: 'tag-1', scenario_id: 'scenario-1', is_active: 1 };
    dbMocks.getEntryRouteByRefCode.mockResolvedValue(kind === 'legacy-entry' ? source : null);
    dbMocks.getTrackedLinkById.mockResolvedValue(kind === 'modern-tracked' ? source : null);
    pendingRefMocks.hasPendingRefTracking.mockResolvedValue(false);
    dbMocks.getScenarioById.mockResolvedValue({ id: 'scenario-1', delivery_mode: 'elapsed', steps: [{
      id: 'step-1', step_order: 1, delay_minutes: 0, offset_days: 0, offset_minutes: 0, on_reach_tag_id: null,
    }] });
    dbMocks.computeNextDeliveryAt.mockImplementation(() => new Date(0));
    dbMocks.enrollFriendInScenario.mockResolvedValue(null);
    dbMocks.getFriendById.mockResolvedValue({ id: 'friend-1', line_account_id: 'acc-1', user_id: 'user-uuid' });
    dbMocks.getLineAccountById.mockResolvedValue({ channel_access_token: 'synthetic-account-token' });
    dbMocks.resolveStepContent.mockResolvedValue({ messageType: 'text', messageContent: '架空の案内', templateIdAtSend: null });
    expect((await dispatch()).status).toBe(200);
    expect((await dispatch()).status).toBe(200);
    expect(lineMocks.pushMessage).toHaveBeenCalledTimes(2);
    expect(pendingRefMocks.enrollPendingEntryScenarioOnce).not.toHaveBeenCalled();
    expect(dbMocks.recordRefTracking).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid ID token before reading or saving attribution', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error_description: 'invalid synthetic token' }), { status: 401 })));
    expect((await dispatch()).status).toBe(401);
    expect(dbMocks.getFriendByLineUserId).not.toHaveBeenCalled();
    expect(pendingRefMocks.savePendingRefAttribution).not.toHaveBeenCalled();
  });

  it.each(['quiet', 'inactive', 'expired'])('does not replay a first push for %s campaign entry', async (reason) => {
    dbMocks.getEntryRouteByRefCode.mockResolvedValue({ id: 'route-1', ref_code: 'lp-ref', tag_id: null, scenario_id: 'scenario-1', is_active: 1 });
    dbMocks.getScenarioById.mockResolvedValue({ id: 'scenario-1', is_active: reason === 'inactive' ? 0 : 1,
      expires_at: reason === 'expired' ? '2000-01-01T00:00:00+09:00' : null,
      delivery_mode: 'absolute_time', steps: [{ id: 'step-1', step_order: 1, condition_type: 'tag_not_exists', condition_value: 'quiet-tag' }] });
    conditionMock.mockResolvedValue(reason !== 'quiet');
    expect((await dispatch()).status).toBe(200);
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(lineMocks.pushMessage).not.toHaveBeenCalled();
  });
});
