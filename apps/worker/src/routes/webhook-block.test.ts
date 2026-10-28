import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upsertFriend: vi.fn(), updateFriendFollowStatus: vi.fn(),
  getFriendById: vi.fn(),
  getFriendByLineUserId: vi.fn(), getScenarios: vi.fn(), enrollFriendInScenario: vi.fn(), getScenarioSteps: vi.fn(),
  advanceFriendScenario: vi.fn(), completeFriendScenario: vi.fn(), upsertChatOnMessage: vi.fn(), getLineAccounts: vi.fn(),
  jstNow: vi.fn(() => '2026-10-15T12:00:00+09:00'), computeNextDeliveryAt: vi.fn(), resolveStepContent: vi.fn(),
  addTagToFriend: vi.fn(), getEntryRouteByRefCode: vi.fn(), getMessageTemplateById: vi.fn() }));
const line = vi.hoisted(() => ({ getProfile: vi.fn(), replyMessage: vi.fn(), pushMessage: vi.fn(), pushTextMessage: vi.fn() }));
const fireEvent = vi.hoisted(() => vi.fn());
vi.mock('@line-crm/db', () => mocks);
vi.mock('@line-crm/line-sdk', () => ({ verifySignature: vi.fn().mockResolvedValue(true),
  LineClient: vi.fn().mockImplementation(() => line) }));
vi.mock('../services/event-bus.js', () => ({ fireEvent }));
const { webhook } = await import('./webhook.js');
let logs: Array<{ query: string; args: unknown[] }>;
let db: D1Database;
const friend = { id: 'synthetic-blocked', line_user_id: 'U_synthetic', line_account_id: 'acc-a', is_following: 1, display_name: '架空の保護者' };
beforeEach(() => {
  vi.clearAllMocks(); logs = [];
  mocks.getFriendByLineUserId.mockResolvedValue(friend);
  mocks.getLineAccounts.mockResolvedValue([{ id: 'acc-a', is_active: 1, channel_id: 'channel-a',
    channel_secret: 'synthetic-secret', channel_access_token: 'synthetic-access' }]);
  db = { prepare(query: string) {
    let args: unknown[] = [];
    const statement = { bind(...values: unknown[]) { args = values; return statement; },
      async all() { return { results: query.includes('JOIN friend_tags') ? [{ name: 'ブロック' }] : [] }; },
      async first() { return null; }, async run() { logs.push({ query, args }); return { meta: { changes: 1 } }; } };
    return statement;
  } } as unknown as D1Database;
});
async function dispatch(event: Record<string, unknown>) {
  const deferred: Promise<unknown>[] = [];
  const response = await webhook.request('https://worker.example.com/webhook', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Line-Signature': 'A'.repeat(43) + '=' },
    body: JSON.stringify({ destination: 'channel-a', events: [{ source: { type: 'user', userId: 'U_synthetic' },
      replyToken: 'synthetic-reply', timestamp: Date.now(), ...event }] }),
  }, { DB: db, LINE_CHANNEL_SECRET: 'synthetic-secret', LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-access' },
  { waitUntil: (promise: Promise<unknown>) => deferred.push(promise), passThroughOnException() {}, props: {} } as ExecutionContext);
  await Promise.all(deferred);
  return response;
}
describe('blocked inbound LINE events', () => {
  it.each([
    { type: 'message', message: { type: 'text', id: 'synthetic-msg', text: '基礎学' } },
    { type: 'postback', postback: { data: 'lh:richmenu:text-image:old-action' } },
    { type: 'message', message: { type: 'image', id: 'synthetic-image' } },
  ])('logs incoming $type without any automatic reply, keyword/menu action or automation', async (event) => {
    expect((await dispatch(event)).status).toBe(200);
    expect(logs.some((row) => row.query.includes('INSERT INTO messages_log') && row.query.includes("'incoming'"))).toBe(true);
    expect(mocks.upsertChatOnMessage).toHaveBeenCalledWith(db, friend.id, 'acc-a');
    expect(line.replyMessage).not.toHaveBeenCalled();
    expect(line.pushMessage).not.toHaveBeenCalled();
    expect(line.pushTextMessage).not.toHaveBeenCalled();
    expect(fireEvent).not.toHaveBeenCalled();
    expect(mocks.enrollFriendInScenario).not.toHaveBeenCalled();
  });
  it('does not restart on re-follow but updates the true LINE follow state', async () => {
    expect((await dispatch({ type: 'follow' })).status).toBe(200);
    expect(mocks.updateFriendFollowStatus).toHaveBeenCalledWith(db, 'U_synthetic', true, 'acc-a');
    expect(mocks.upsertFriend).not.toHaveBeenCalled();
    expect(line.getProfile).not.toHaveBeenCalled();
    expect(line.replyMessage).not.toHaveBeenCalled();
    expect(fireEvent).not.toHaveBeenCalled();
    expect(logs.some((row) => row.query.includes("status = 'paused'"))).toBe(true);
  });

  it('suppresses LINE staff notices to a blocked recipient even when the new sender is unblocked', async () => {
    mocks.getFriendByLineUserId.mockResolvedValue(null);
    mocks.upsertFriend.mockResolvedValue({ ...friend, ref_code: 'known-non-campaign' });
    mocks.getEntryRouteByRefCode.mockResolvedValue(null);
    mocks.getScenarios.mockResolvedValue([]);
    line.getProfile.mockResolvedValue({ displayName: '架空の新規保護者' });
    let recipientPolicyRead = false;
    db = { prepare(query: string) {
      let args: unknown[] = [];
      const statement = { bind(...values: unknown[]) { args = values; return statement; },
        async first() {
          if (query.includes('FROM account_settings')) return { value: '["blocked-manager"]' };
          if (query.includes('SELECT name FROM line_accounts')) return { name: '架空の教室' };
          return null;
        },
        async all() {
          if (query.includes('JOIN friend_tags')) {
            if (args[0] === 'blocked-manager') { recipientPolicyRead = true; return { results: [{ name: 'ブロック' }] }; }
            return { results: [] };
          }
          return { results: [{ id: 'blocked-manager', line_user_id: 'U_manager' }] };
        },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    } } as unknown as D1Database;
    expect((await dispatch({ type: 'follow' })).status).toBe(200);
    expect(line.getProfile).toHaveBeenCalledOnce();
    expect(recipientPolicyRead).toBe(true);
    expect(line.pushTextMessage).not.toHaveBeenCalled();
  });
});
