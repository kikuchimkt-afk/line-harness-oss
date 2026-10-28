import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getLineAccounts: vi.fn(), isFriendBlocked: vi.fn(), findIdempotencyResponse: vi.fn(), saveIdempotencyResponse: vi.fn() }));
vi.mock('@line-crm/db', () => ({ getLineAccounts: mocks.getLineAccounts }));
vi.mock('../services/booking-idempotency.js', () => mocks);
vi.mock('../services/friend-block-policy.js', () => ({ isFriendBlocked: mocks.isFriendBlocked, BLOCKED_FRIEND_MESSAGE: '現在、この機能はご利用いただけません。' }));
import booking from './booking.js';

let db: D1Database;
let run: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLineAccounts.mockResolvedValue([{ login_channel_id: 'login-a' }]);
  mocks.isFriendBlocked.mockResolvedValue(true);
  mocks.findIdempotencyResponse.mockResolvedValue({ status: 201, body: { booking_id: 'existing-a' } });
  run = vi.fn();
  db = { prepare: vi.fn((sql: string) => ({ bind: (...args: unknown[]) => ({
    first: async () => sql.includes('FROM line_accounts') ? { id: 'account-a' } : sql.includes('FROM friends') && args[0] === 'U_verified' && args[1] === 'account-a' ? { id: 'verified-friend' } : null,
    run,
  }) })) } as unknown as D1Database;
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: 'U_verified' })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function request(auth = 'Bearer synthetic-token') {
  return booking.request('/api/liff/booking/requests?liffId=synthetic-liff', {
    method: 'POST', headers: { Authorization: auth, 'Idempotency-Key': 'synthetic-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu_id: 'menu-a', staff_id: 'staff-a', starts_at: '2026-12-01T00:00:00Z', friendId: 'forged-friend', lineUserId: 'U_forged' }),
  }, { DB: db });
}

describe('booking customer block gate', () => {
  it('rejects blocked caller before idempotency replay, booking writes, and body-ID spoofing', async () => {
    const response = await request();
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FRIEND_BLOCKED');
    expect(mocks.isFriendBlocked).toHaveBeenCalledTimes(1);
    expect(mocks.isFriendBlocked).toHaveBeenCalledWith(db, 'verified-friend', 'account-a');
    expect(mocks.findIdempotencyResponse).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('preserves an unblocked caller account-scoped idempotency replay', async () => {
    mocks.isFriendBlocked.mockResolvedValue(false);
    const response = await request();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ booking_id: 'existing-a' });
    expect(mocks.findIdempotencyResponse).toHaveBeenCalledWith(db, expect.objectContaining({ friendId: 'verified-friend', lineAccountId: 'account-a' }));
    expect(run).not.toHaveBeenCalled();
  });
  it('does not accept forged body identity without authentication', async () => {
    expect((await request('')).status).toBe(401);
    expect(mocks.isFriendBlocked).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
