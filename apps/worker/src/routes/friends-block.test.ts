import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
const mocks = vi.hoisted(() => ({ getFriendById: vi.fn(), getFriendByLineUserId: vi.fn(), getFriends: vi.fn(),
  getFriendCount: vi.fn(), addTagToFriend: vi.fn(), removeTagFromFriend: vi.fn(), getFriendTags: vi.fn(),
  getScenarios: vi.fn(), enrollFriendInScenario: vi.fn(), jstNow: vi.fn(() => '2026-10-15T12:00:00+09:00'),
  getStaffAccountIds: vi.fn(), staffCanAccessLineAccount: vi.fn(), getLineAccountById: vi.fn() }));
const sideEffects = vi.hoisted(() => ({ fireEvent: vi.fn(), cancelBlockedFriendOutboundWork: vi.fn(),
  applyBlockedRichMenuForFriend: vi.fn(), restoreRichMenuAfterUnblock: vi.fn(), pushMessage: vi.fn() }));
vi.mock('@line-crm/db', () => mocks);
vi.mock('../services/event-bus.js', () => ({ fireEvent: sideEffects.fireEvent }));
vi.mock('../services/blocked-outbound.js', () => ({ cancelBlockedFriendOutboundWork: sideEffects.cancelBlockedFriendOutboundWork }));
vi.mock('../services/rich-menu-assignment.js', () => ({ applyBlockedRichMenuForFriend: sideEffects.applyBlockedRichMenuForFriend,
  restoreRichMenuAfterUnblock: sideEffects.restoreRichMenuAfterUnblock }));
vi.mock('@line-crm/line-sdk', () => ({ LineClient: vi.fn().mockImplementation(() => ({ pushMessage: sideEffects.pushMessage })) }));
const { friends } = await import('./friends.js');
let blocked: boolean;
let writes: string[];
let app: Hono;
const friend = { id: 'synthetic-friend', line_user_id: 'U_synthetic', line_account_id: 'acc-a',
  display_name: '架空の保護者', is_following: 1, metadata: '{}', user_id: null };
beforeEach(() => {
  vi.clearAllMocks();
  blocked = true;
  writes = [];
  mocks.getFriendById.mockResolvedValue(friend);
  mocks.getFriendTags.mockResolvedValue([{ id: 'block', name: 'ブロック', color: '#ccc' }]);
  mocks.getScenarios.mockResolvedValue([]);
  mocks.staffCanAccessLineAccount.mockResolvedValue(true);
  sideEffects.cancelBlockedFriendOutboundWork.mockResolvedValue(undefined);
  sideEffects.applyBlockedRichMenuForFriend.mockResolvedValue(undefined);
  sideEffects.restoreRichMenuAfterUnblock.mockResolvedValue(undefined);
  mocks.addTagToFriend.mockImplementation(async (_db, _fid, tid) => { if (tid === 'block') blocked = true; });
  mocks.removeTagFromFriend.mockImplementation(async (_db, _fid, tid) => { if (tid === 'block') blocked = false; });
  const db = { prepare(query: string) {
    const statement = { bind() { return statement; }, async first() { return { name: 'ブロック' }; },
      async all() { return { results: query.includes('JOIN friend_tags') && blocked ? [{ name: 'ブロック' }] : [] }; },
      async run() { writes.push(query); return { meta: { changes: 1 } }; } };
    return statement;
  } } as unknown as D1Database;
  app = new Hono();
  app.use('*', async (c, next) => { c.set('staff' as never, { id: 'staff', role: 'owner' } as never); c.env = { DB: db }; await next(); });
  app.route('/', friends);
});
describe('staff block controls and manual delivery', () => {
  it('denies manual message sending without changing history or LINE follow reality', async () => {
    const response = await app.request('/api/friends/synthetic-friend/messages', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '架空メッセージ' }) });
    expect(response.status).toBe(403);
    expect(sideEffects.pushMessage).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it('applies stop/cancel/blank-menu effects on control-tag attachment, without scenario automation', async () => {
    blocked = false;
    const response = await app.request('/api/friends/synthetic-friend/tags', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagId: 'block' }) });
    expect(response.status).toBe(201);
    expect(writes.some((query) => query.includes("status = 'paused'"))).toBe(true);
    expect(sideEffects.cancelBlockedFriendOutboundWork).toHaveBeenCalledOnce();
    expect(sideEffects.applyBlockedRichMenuForFriend).toHaveBeenCalledOnce();
    expect(mocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(sideEffects.fireEvent).not.toHaveBeenCalled();
  });
  it('allows staff tag removal and restores only menu, never resumed scenarios/messages/automation', async () => {
    const response = await app.request('/api/friends/synthetic-friend/tags/block', { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(sideEffects.restoreRichMenuAfterUnblock).toHaveBeenCalledOnce();
    expect(mocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(sideEffects.pushMessage).not.toHaveBeenCalled();
    expect(sideEffects.fireEvent).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it('keeps staff profile/history management readable despite application blocking', async () => {
    expect((await app.request('/api/friends/synthetic-friend')).status).toBe(200);
    expect((await app.request('/api/friends/synthetic-friend/messages')).status).toBe(200);
  });
  it('reports a committed block tag with menu recovery pending, not a failed tag save', async () => {
    blocked = false;
    sideEffects.applyBlockedRichMenuForFriend.mockRejectedValueOnce(new Error('synthetic-secret-error'));
    const response = await app.request('/api/friends/synthetic-friend/tags', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagId: 'block' }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, code: 'BLOCK_MENU_RETRY_PENDING' });
    expect(blocked).toBe(true);
    expect(sideEffects.cancelBlockedFriendOutboundWork).toHaveBeenCalledOnce();
  });
  it('reports a committed unblock with durable menu recovery pending', async () => {
    sideEffects.restoreRichMenuAfterUnblock.mockRejectedValueOnce(new Error('LINE API error: 503 unavailable'));
    const response = await app.request('/api/friends/synthetic-friend/tags/block', { method: 'DELETE' });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, code: 'BLOCK_MENU_RETRY_PENDING' });
    expect(blocked).toBe(false);
    expect(sideEffects.fireEvent).not.toHaveBeenCalled();
  });
  it('does not claim unblock completion when a concurrent action blocked the friend again', async () => {
    sideEffects.restoreRichMenuAfterUnblock.mockImplementationOnce(async () => { blocked = true; throw new Error('synthetic race'); });
    const response = await app.request('/api/friends/synthetic-friend/tags/block', { method: 'DELETE' });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, code: 'BLOCK_STATE_CHANGED', notice: expect.stringContaining('再度ブロック') });
    expect(blocked).toBe(true);
  });
  it('does not hide a failed database cancellation behind a menu-pending response', async () => {
    sideEffects.cancelBlockedFriendOutboundWork.mockRejectedValueOnce(new Error('synthetic database unavailable'));
    const response = await app.request('/api/friends/synthetic-friend/tags', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagId: 'block' }) });
    expect(response.status).toBe(500);
    expect(sideEffects.applyBlockedRichMenuForFriend).not.toHaveBeenCalled();
  });
});
