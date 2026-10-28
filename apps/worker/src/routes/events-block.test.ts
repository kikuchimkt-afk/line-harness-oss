import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCallerLineUserId: vi.fn(), isFriendBlocked: vi.fn(), isLineUserBlocked: vi.fn(),
  reserveEventIdempotency: vi.fn(), finalizeEventIdempotencyResponse: vi.fn(),
}));
vi.mock('../services/liff-auth.js', () => mocks);
vi.mock('../services/event-booking-idempotency.js', () => mocks);
vi.mock('../services/friend-block-policy.js', () => ({ ...mocks, BLOCKED_FRIEND_MESSAGE: '現在、この機能はご利用いただけません。' }));
import events from './events.js';

let db: D1Database;
let run: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCallerLineUserId.mockResolvedValue('U_verified');
  mocks.isFriendBlocked.mockResolvedValue(true);
  mocks.isLineUserBlocked.mockResolvedValue(true);
  mocks.reserveEventIdempotency.mockResolvedValue({ kind: 'cached', status: 201, body: { booking_id: 'existing-a' } });
  run = vi.fn();
  db = { prepare: vi.fn((sql: string) => ({ bind: (...args: unknown[]) => ({
    first: async () => sql.includes('FROM line_accounts') ? { id: 'account-a' } : sql.includes('FROM friends') && args[0] === 'U_verified' && args[1] === 'account-a' ? { id: 'verified-friend' } : null,
    all: async () => ({ results: [] }), run,
  }) })) } as unknown as D1Database;
});

function request(path: string) {
  return events.request(`${path}?liffId=synthetic-liff`, {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-token', 'Idempotency-Key': 'synthetic-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: 'forged-friend', lineUserId: 'U_forged', booking_ids: ['synthetic-booking'] }),
  }, { DB: db });
}

describe('event customer block gates', () => {
  it.each(['/api/liff/events/me/booking-a/cancel', '/api/liff/events/event-a/bookings'])('rejects blocked %s without cancelling or enrolling', async (path) => {
    const response = await request(path);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FRIEND_BLOCKED');
    expect(mocks.isFriendBlocked).toHaveBeenCalledTimes(1);
    expect(mocks.isFriendBlocked).toHaveBeenCalledWith(db, 'verified-friend', 'account-a');
    expect(mocks.reserveEventIdempotency).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('stops a summary notification using the verified LINE user, not the body identity', async () => {
    expect((await request('/api/liff/events/event-a/bookings/summary')).status).toBe(403);
    expect(mocks.isLineUserBlocked).toHaveBeenCalledTimes(1);
    expect(mocks.isLineUserBlocked).toHaveBeenCalledWith(db, 'U_verified', 'account-a');
    expect(mocks.reserveEventIdempotency).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('keeps allowed new-booking idempotency replay intact', async () => {
    mocks.isFriendBlocked.mockResolvedValue(false);
    const response = await request('/api/liff/events/event-a/bookings');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ booking_id: 'existing-a' });
    expect(mocks.reserveEventIdempotency).toHaveBeenCalledWith(db, expect.objectContaining({ lineAccountId: 'account-a', friendId: 'verified-friend' }));
    expect(run).not.toHaveBeenCalled();
  });
  it.each(['/api/liff/events/me/booking-a/cancel', '/api/liff/events/event-a/bookings', '/api/liff/events/event-a/bookings/summary'])('does not trust body IDs without a verified caller for %s', async (path) => {
    mocks.verifyCallerLineUserId.mockResolvedValue(null);
    expect((await request(path)).status).toBe(401);
    expect(mocks.isFriendBlocked).not.toHaveBeenCalled();
    expect(mocks.isLineUserBlocked).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
