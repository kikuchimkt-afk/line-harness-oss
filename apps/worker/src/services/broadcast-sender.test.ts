import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLineAccountById = vi.hoisted(() => vi.fn());
vi.mock('@line-crm/db', () => ({ getLineAccountById }));
const LineClient = vi.hoisted(() => vi.fn(function (this: { token: string }, token: string) { this.token = token; }));
vi.mock('@line-crm/line-sdk', () => ({ LineClient }));

const { resolveBroadcastSender, BroadcastSenderError } = await import('./broadcast-sender.js');

const defaultClient = { token: 'default-account-token' } as never;
function dbWithAccounts(registered: boolean, fail = false) {
  return { prepare: () => ({ first: async () => {
    if (fail) throw new Error('D1 unavailable');
    return registered ? { id: 'acc-1' } : null;
  } }) } as unknown as D1Database;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('resolveBroadcastSender', () => {
  it('uses the broadcast account token', async () => {
    getLineAccountById.mockResolvedValue({ id: 'acc-1', is_active: 1, channel_access_token: 'acc-1-token' });
    const client = await resolveBroadcastSender(dbWithAccounts(true), { id: 'b1', target_type: 'all', line_account_id: 'acc-1' }, defaultClient);
    expect((client as unknown as { token: string }).token).toBe('acc-1-token');
  });

  it.each([
    ['missing', null],
    ['inactive', { id: 'acc-1', is_active: 0, channel_access_token: 'acc-1-token' }],
    ['token-less', { id: 'acc-1', is_active: 1, channel_access_token: '  ' }],
  ])('refuses a %s sender instead of using the default account', async (_label, account) => {
    getLineAccountById.mockResolvedValue(account);
    await expect(resolveBroadcastSender(dbWithAccounts(true), { id: 'b1', target_type: 'all', line_account_id: 'acc-1' }, defaultClient))
      .rejects.toBeInstanceOf(BroadcastSenderError);
  });

  it('refuses an account-less broadcast once LINE accounts are registered', async () => {
    await expect(resolveBroadcastSender(dbWithAccounts(true), { id: 'b1', target_type: 'all', line_account_id: null }, defaultClient))
      .rejects.toBeInstanceOf(BroadcastSenderError);
  });

  it('keeps the default client only for an installation without accounts', async () => {
    const client = await resolveBroadcastSender(dbWithAccounts(false), { id: 'b1', target_type: 'all', line_account_id: null }, defaultClient);
    expect(client).toBe(defaultClient);
  });

  it('fails closed when the sender cannot be looked up', async () => {
    getLineAccountById.mockRejectedValue(new Error('D1 unavailable'));
    await expect(resolveBroadcastSender(dbWithAccounts(true), { id: 'b1', target_type: 'all', line_account_id: 'acc-1' }, defaultClient))
      .rejects.toBeInstanceOf(BroadcastSenderError);
  });
});
