import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getFriendByLineUserId: vi.fn(), createUser: vi.fn(), getUserByEmail: vi.fn(),
  linkFriendToUser: vi.fn(), upsertFriend: vi.fn(), getEntryRouteByRefCode: vi.fn(), recordRefTracking: vi.fn(),
  addTagToFriend: vi.fn(), getLineAccountByChannelId: vi.fn(), getLineAccountById: vi.fn(), getLineAccounts: vi.fn(),
  getTrafficPoolBySlug: vi.fn(), getTrafficPoolById: vi.fn(), getRandomPoolAccount: vi.fn(), getPoolAccounts: vi.fn(),
  getTrackedLinkById: vi.fn(), getMessageTemplateById: vi.fn(), jstNow: vi.fn(),
}));
const pending = vi.hoisted(() => ({ savePendingRefAttribution: vi.fn(), recoverPendingRefAttribution: vi.fn(),
  hasPendingRefTracking: vi.fn(), enrollPendingEntryScenarioOnce: vi.fn() }));
const line = vi.hoisted(() => ({ pushMessage: vi.fn() }));
vi.mock('@line-crm/db', () => mocks);
vi.mock('../services/liff-pending-ref-attribution.js', () => pending);
vi.mock('@line-crm/line-sdk', () => ({ LineClient: vi.fn().mockImplementation(() => line) }));
const { liffRoutes } = await import('./liff.js');
let blocked: boolean;
let db: D1Database;
let reads: string[];
const friend = { id: 'synthetic-friend', line_user_id: 'U_verified', line_account_id: 'acc-a',
  user_id: 'synthetic-user', is_following: 1, display_name: '架空の保護者' };
beforeEach(() => {
  vi.clearAllMocks();
  blocked = true;
  reads = [];
  mocks.getLineAccounts.mockResolvedValue([{ id: 'acc-a', login_channel_id: 'login-a', is_active: 1 }]);
  mocks.getFriendByLineUserId.mockResolvedValue(friend);
  db = { prepare(query: string) {
    reads.push(query);
    const statement = { bind() { return statement; },
      async all() { return { results: query.includes('JOIN friend_tags') && blocked ? [{ name: 'ブロック' }] : [] }; },
      async first() { return null; }, async run() { return { meta: { changes: 1 } }; } };
    return statement;
  } } as unknown as D1Database;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(
    url.includes('/v2.1/token') ? { access_token: 'synthetic-token', id_token: 'synthetic-id' } : { sub: 'U_verified' }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());
function request(path: string, body: unknown) {
  return liffRoutes.request('https://worker.example.com' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, { DB: db, LINE_LOGIN_CHANNEL_ID: 'login-a', WORKER_URL: 'https://worker.example.com' });
}
describe('blocked verified LIFF customer', () => {
  it('denies entry authentication before UUID/ref/tags/scenario writes even if the body claims unblocked', async () => {
    const response = await request('/api/liff/link', { idToken: 'synthetic-id', ref: 'flyer-ref', blocked: false, friendId: 'someone-else' });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, code: 'FRIEND_BLOCKED' });
    expect(mocks.getFriendByLineUserId).toHaveBeenCalledWith(db, 'U_verified', 'acc-a');
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.linkFriendToUser).not.toHaveBeenCalled();
    expect(mocks.recordRefTracking).not.toHaveBeenCalled();
    expect(pending.savePendingRefAttribution).not.toHaveBeenCalled();
    expect(line.pushMessage).not.toHaveBeenCalled();
  });
  it('requires ID token for customer profile and denies a blocked verified profile without row data', async () => {
    expect((await request('/api/liff/profile', { lineUserId: 'U_verified' })).status).toBe(401);
    const response = await request('/api/liff/profile', { lineUserId: 'U_verified', idToken: 'synthetic-id' });
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('data');
  });
  it('rejects a claimed user different from the verified token subject', async () => {
    const response = await request('/api/liff/profile', { lineUserId: 'U_forged', idToken: 'synthetic-id' });
    expect(response.status).toBe(403);
    expect(mocks.getFriendByLineUserId).not.toHaveBeenCalled();
  });
  it('does not send or reveal a customer form link', async () => {
    const response = await request('/api/liff/send-form-link', { lineUserId: 'U_verified', formId: 'synthetic-form', idToken: 'synthetic-id' });
    expect(response.status).toBe(403);
    expect(line.pushMessage).not.toHaveBeenCalled();
    expect(mocks.getTrackedLinkById).not.toHaveBeenCalled();
  });
  it('denies blocked OAuth before profile/upsert/ref flow and never shows registration completion', async () => {
    const response = await liffRoutes.request('https://worker.example.com/auth/callback?code=synthetic-code', undefined,
      { DB: db, LINE_LOGIN_CHANNEL_ID: 'login-a', LINE_LOGIN_CHANNEL_SECRET: 'synthetic-secret' });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('登録完了');
    expect(mocks.upsertFriend).not.toHaveBeenCalled();
    expect(line.pushMessage).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain('https://api.line.me/v2/profile');
  });
  it('retains a normal verified customer profile when no authoritative block tag exists', async () => {
    blocked = false;
    expect((await request('/api/liff/profile', { lineUserId: 'U_verified', idToken: 'synthetic-id' })).status).toBe(200);
  });
});
