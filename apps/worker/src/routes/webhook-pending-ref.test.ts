import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  upsertFriend: vi.fn(), getFriendByLineUserId: vi.fn(), getFriendById: vi.fn(),
  getScenarios: vi.fn(), enrollFriendInScenario: vi.fn(), getScenarioSteps: vi.fn(),
  getLineAccounts: vi.fn(), getEntryRouteByRefCode: vi.fn(),
  updateFriendFollowStatus: vi.fn(), advanceFriendScenario: vi.fn(), completeFriendScenario: vi.fn(),
  upsertChatOnMessage: vi.fn(), jstNow: vi.fn(), computeNextDeliveryAt: vi.fn(),
  resolveStepContent: vi.fn(), addTagToFriend: vi.fn(), getMessageTemplateById: vi.fn(),
}));
const pendingMocks = vi.hoisted(() => ({ recoverPendingRefAttribution: vi.fn(),
  hasPendingRefTracking: vi.fn(), enrollPendingEntryScenarioOnce: vi.fn() }));
const lineMocks = vi.hoisted(() => ({ getProfile: vi.fn(), pushMessage: vi.fn(), replyMessage: vi.fn() }));
const tagMocks = vi.hoisted(() => ({ attachTagAndFireSideEffects: vi.fn() }));
const eventMocks = vi.hoisted(() => ({ fireEvent: vi.fn() }));
vi.mock('@line-crm/db', () => dbMocks);
vi.mock('@line-crm/line-sdk', () => ({
  verifySignature: vi.fn().mockResolvedValue(true),
  LineClient: vi.fn().mockImplementation(() => lineMocks),
}));
vi.mock('../services/liff-pending-ref-attribution.js', () => pendingMocks);
vi.mock('../services/friend-tag-attach.js', () => tagMocks);
vi.mock('../services/event-bus.js', () => eventMocks);

const { webhook } = await import('./webhook.js');
const friend = { id: 'synthetic-friend', line_user_id: 'U_synthetic', line_account_id: 'synthetic-account',
  is_following: 1, display_name: '架空の保護者', ref_code: null };
const route = { id: 'synthetic-route', ref_code: 'synthetic-flyer-ref', name: '架空チラシ',
  tag_id: 'synthetic-source-tag', scenario_id: 'synthetic-campaign', intro_template_id: null,
  run_account_friend_add_scenarios: 0, is_active: 1 };

function makeDb(): D1Database {
  const statement = { bind() { return statement; }, first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }), run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) };
  return { prepare: vi.fn().mockReturnValue(statement) } as unknown as D1Database;
}

async function dispatch(db = makeDb()) {
  const deferred: Promise<unknown>[] = [];
  const response = await webhook.request('https://worker.example.com/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Line-Signature': 'A'.repeat(43) + '=' },
    body: JSON.stringify({ destination: 'synthetic-channel', events: [{
      type: 'follow', source: { type: 'user', userId: 'U_synthetic' }, replyToken: 'synthetic-reply-token',
      timestamp: Date.now(), mode: 'active', webhookEventId: 'synthetic-event', deliveryContext: { isRedelivery: false },
    }] }),
  }, { DB: db, LINE_CHANNEL_SECRET: 'synthetic-secret', LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-access-token',
    WORKER_URL: 'https://worker.example.com' }, { waitUntil: (p: Promise<unknown>) => deferred.push(p),
    passThroughOnException() {}, props: {} } as ExecutionContext);
  await vi.runAllTimersAsync();
  await Promise.all(deferred);
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-10-12T12:00:00+09:00'));
  dbMocks.getLineAccounts.mockResolvedValue([{ id: 'synthetic-account', channel_id: 'synthetic-channel',
    channel_secret: 'synthetic-secret', channel_access_token: 'synthetic-access-token', is_active: 1 }]);
  dbMocks.getFriendByLineUserId.mockResolvedValue(null);
  dbMocks.upsertFriend.mockResolvedValue(friend);
  dbMocks.getFriendById.mockResolvedValue(friend);
  dbMocks.getScenarios.mockResolvedValue([]);
  dbMocks.getEntryRouteByRefCode.mockResolvedValue(route);
  dbMocks.enrollFriendInScenario.mockResolvedValue({ id: 'synthetic-enrollment', current_step_order: 0, status: 'active' });
  lineMocks.getProfile.mockResolvedValue({ displayName: '架空の保護者' });
  pendingMocks.recoverPendingRefAttribution.mockResolvedValue('synthetic-flyer-ref');
  pendingMocks.hasPendingRefTracking.mockResolvedValue(false);
  pendingMocks.enrollPendingEntryScenarioOnce.mockResolvedValue(true);
  tagMocks.attachTagAndFireSideEffects.mockResolvedValue({ added: true });
  eventMocks.fireEvent.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('follow webhook recovers saved pre-follow entry route', () => {
  it('recovers immediately after upsert, skips standard welcome and enrolls/tags the campaign', async () => {
    const db = makeDb();
    expect((await dispatch(db)).status).toBe(200);
    expect(pendingMocks.recoverPendingRefAttribution).toHaveBeenCalledWith(db, friend, 'synthetic-account', 'U_synthetic');
    expect(dbMocks.upsertFriend.mock.invocationCallOrder[0]).toBeLessThan(pendingMocks.recoverPendingRefAttribution.mock.invocationCallOrder[0]);
    expect(dbMocks.getEntryRouteByRefCode).toHaveBeenCalledWith(db, 'synthetic-flyer-ref');
    expect(dbMocks.getScenarios).not.toHaveBeenCalled();
    expect(dbMocks.enrollFriendInScenario).toHaveBeenCalledWith(db, friend.id, 'synthetic-campaign');
    expect(tagMocks.attachTagAndFireSideEffects).toHaveBeenCalledWith(db, friend.id, 'synthetic-source-tag');
    expect(dbMocks.enrollFriendInScenario.mock.invocationCallOrder[0]).toBeLessThan(tagMocks.attachTagAndFireSideEffects.mock.invocationCallOrder[0]);
    expect(lineMocks.replyMessage).not.toHaveBeenCalled();
    expect(lineMocks.pushMessage).not.toHaveBeenCalled();
    expect(eventMocks.fireEvent).toHaveBeenCalledWith(db, 'friend_add', expect.objectContaining({ friendId: friend.id }), 'synthetic-access-token', 'synthetic-account');
  });

  it('recovers a pending write which lands during the existing bounded follow retry', async () => {
    pendingMocks.recoverPendingRefAttribution.mockResolvedValueOnce(null).mockResolvedValue('synthetic-flyer-ref');
    await dispatch();
    expect(pendingMocks.recoverPendingRefAttribution).toHaveBeenCalledTimes(2);
    expect(dbMocks.getScenarios).not.toHaveBeenCalled();
    expect(dbMocks.enrollFriendInScenario).toHaveBeenCalledOnce();
    expect(tagMocks.attachTagAndFireSideEffects).toHaveBeenCalledOnce();
  });

  it('does not guess a campaign after an expired/missing pending ref; existing standard flow stays intact', async () => {
    pendingMocks.recoverPendingRefAttribution.mockResolvedValue(null);
    await dispatch();
    expect(dbMocks.getEntryRouteByRefCode).not.toHaveBeenCalled();
    expect(dbMocks.getScenarios).toHaveBeenCalledOnce();
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(tagMocks.attachTagAndFireSideEffects).not.toHaveBeenCalled();
  });

  it('keeps an earlier OAuth first touch rather than attempting pending recovery', async () => {
    dbMocks.upsertFriend.mockResolvedValue({ ...friend, ref_code: 'earlier-oauth-ref' });
    await dispatch();
    expect(pendingMocks.recoverPendingRefAttribution).not.toHaveBeenCalled();
    expect(dbMocks.getEntryRouteByRefCode).toHaveBeenCalledWith(expect.anything(), 'earlier-oauth-ref');
  });

  it('uses the no-restart Cron enrollment for a recovered pending route, including follow redelivery', async () => {
    pendingMocks.hasPendingRefTracking.mockResolvedValue(true);
    await dispatch();
    expect(pendingMocks.enrollPendingEntryScenarioOnce).toHaveBeenCalledWith(expect.anything(), friend.id, 'synthetic-campaign', 'synthetic-account');
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(lineMocks.replyMessage).not.toHaveBeenCalled();
    expect(lineMocks.pushMessage).not.toHaveBeenCalled();
  });

  it('defers tag side effects after pending-mode atomic enrollment fails, leaving the known ref available to retry', async () => {
    pendingMocks.hasPendingRefTracking.mockResolvedValue(true);
    pendingMocks.enrollPendingEntryScenarioOnce.mockRejectedValue(new Error('synthetic atomic enrollment failure'));
    await dispatch();
    expect(pendingMocks.recoverPendingRefAttribution).toHaveBeenCalledOnce();
    expect(pendingMocks.enrollPendingEntryScenarioOnce).toHaveBeenCalledOnce();
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(tagMocks.attachTagAndFireSideEffects).not.toHaveBeenCalled();
    expect(lineMocks.pushMessage).not.toHaveBeenCalled();
    expect(eventMocks.fireEvent).toHaveBeenCalledOnce();
  });

  it('keeps legacy tag side effects after a non-pending scenario enrollment failure', async () => {
    pendingMocks.hasPendingRefTracking.mockResolvedValue(false);
    dbMocks.enrollFriendInScenario.mockRejectedValue(new Error('synthetic legacy enrollment failure'));
    await dispatch();
    expect(tagMocks.attachTagAndFireSideEffects).toHaveBeenCalledOnce();
  });

  it('does not treat a failed pending-proof lookup as a legacy route or trigger tags', async () => {
    pendingMocks.hasPendingRefTracking.mockRejectedValue(new Error('synthetic proof lookup failure'));
    await dispatch();
    expect(pendingMocks.enrollPendingEntryScenarioOnce).not.toHaveBeenCalled();
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(tagMocks.attachTagAndFireSideEffects).not.toHaveBeenCalled();
    expect(lineMocks.pushMessage).not.toHaveBeenCalled();
  });
});
