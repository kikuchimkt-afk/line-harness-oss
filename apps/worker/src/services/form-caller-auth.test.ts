import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getLineAccounts: vi.fn(), getFriendByLineUserId: vi.fn() }));
vi.mock('@line-crm/db', () => mocks);
import { resolveFormCallerFriend } from './form-caller-auth.js';

const db = {} as D1Database;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLineAccounts.mockResolvedValue([
    { id: 'account-a', login_channel_id: 'login-a', is_active: 1 },
    { id: 'account-b', login_channel_id: 'login-b', is_active: 1 },
    { id: 'inactive', login_channel_id: 'login-inactive', is_active: 0 },
  ]);
  mocks.getFriendByLineUserId.mockResolvedValue({ id: 'friend-b', line_account_id: 'account-b' });
  fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('verified form caller account scope', () => {
  it.each([undefined, '', 'Bearer ', 'Basic forged'])('rejects missing tokens (%s) without looking up a friend', async (auth) => {
    expect(await resolveFormCallerFriend(db, auth)).toEqual({ friend: null, authenticated: false });
    expect(mocks.getLineAccounts).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses only LINE-verified sub and the channel-matched active account', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const channel = (init.body as URLSearchParams).get('client_id');
      return channel === 'login-b'
        ? new Response(JSON.stringify({ sub: 'U_verified' }))
        : new Response('{}', { status: 401 });
    });
    expect(await resolveFormCallerFriend(db, 'Bearer synthetic-token', 'login-a')).toEqual({
      friend: { id: 'friend-b', line_account_id: 'account-b' }, authenticated: true,
    });
    expect(mocks.getFriendByLineUserId).toHaveBeenCalledTimes(1);
    expect(mocks.getFriendByLineUserId).toHaveBeenCalledWith(db, 'U_verified', 'account-b');
  });

  it('does not invent an account for an unmapped env channel or accept inactive channels', async () => {
    expect(await resolveFormCallerFriend(db, 'Bearer synthetic-token', 'unmapped-env')).toEqual({ friend: null, authenticated: false });
    const channels = fetchMock.mock.calls.map((call) => (call[1].body as URLSearchParams).get('client_id'));
    expect(channels).toEqual(['login-a', 'login-b']);
    expect(mocks.getFriendByLineUserId).not.toHaveBeenCalled();
  });

  it('does not fall back to another account when the verified caller has no friend row', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sub: 'U_verified' })));
    mocks.getFriendByLineUserId.mockResolvedValue(null);
    expect(await resolveFormCallerFriend(db, 'Bearer synthetic-token')).toEqual({ friend: null, authenticated: true });
    expect(mocks.getFriendByLineUserId).toHaveBeenCalledTimes(1);
    expect(mocks.getFriendByLineUserId).toHaveBeenCalledWith(db, 'U_verified', 'account-a');
  });

  it('propagates database errors rather than treating them as an allowed caller', async () => {
    mocks.getLineAccounts.mockRejectedValue(new Error('synthetic database error'));
    await expect(resolveFormCallerFriend(db, 'Bearer synthetic-token')).rejects.toThrow('synthetic database error');
  });
});
