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
  jstNow: vi.fn(() => '2026-09-22T12:00:00.000+09:00'),
}));

const attachTagAndFireSideEffects = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ added: true }),
);

vi.mock('@line-crm/db', () => dbMocks);
vi.mock('../services/friend-tag-attach.js', () => ({ attachTagAndFireSideEffects }));

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'U_line' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
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
  });
});
