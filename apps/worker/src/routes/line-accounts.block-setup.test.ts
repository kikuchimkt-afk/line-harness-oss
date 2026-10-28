import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';

const mocks = vi.hoisted(() => ({
  getLineAccounts: vi.fn(),
  getLineAccountById: vi.fn(),
  createLineAccount: vi.fn(),
  updateLineAccount: vi.fn(),
  updateLineAccountFields: vi.fn(),
  updateLineAccountOrder: vi.fn(),
  deleteLineAccount: vi.fn(),
  getStaffAccountIds: vi.fn(),
  staffCanAccessLineAccount: vi.fn(),
  getTrafficPoolBySlug: vi.fn(),
  createTrafficPool: vi.fn(),
  addPoolAccount: vi.fn(),
  ensure: vi.fn(),
}));

vi.mock('@line-crm/db', () => mocks);
vi.mock('../services/blocked-menu-setup.js', () => ({ ensureBlockedMenuForAccount: mocks.ensure }));
vi.mock('@line-crm/line-sdk', () => ({ LineClient: vi.fn() }));

const { lineAccounts } = await import('./line-accounts.js');

const account = {
  id: 'acc-new', channel_id: '123', name: '新規公式LINE',
  channel_access_token: 'private-token', channel_secret: 'private-secret',
  login_channel_id: null, login_channel_secret: null, liff_id: null,
  is_active: 1, country: null, role: null, display_order: 0,
  token_expires_at: null, created_at: '2026-10-15', updated_at: '2026-10-15',
};

function appFor(role: 'owner' | 'admin' | 'staff' = 'owner') {
  const db = { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first: vi.fn().mockResolvedValue(null) })) })) } as unknown as D1Database;
  const app = new Hono<{
    Variables: { staff: { id: string; role: 'owner' | 'admin' | 'staff' } };
    Bindings: { DB: D1Database };
  }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db };
    c.set('staff', { id: 'staff-test', role });
    await next();
  });
  app.route('/', lineAccounts);
  return { app, db };
}

function requestBody(method: string, body: Record<string, unknown>) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const createBody = { channelId: '123', name: '新規公式LINE', channelAccessToken: 'private-token', channelSecret: 'private-secret' };

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getLineAccountById.mockResolvedValue(account);
  mocks.createLineAccount.mockResolvedValue(account);
  mocks.updateLineAccount.mockResolvedValue(account);
  mocks.updateLineAccountFields.mockResolvedValue(account);
  mocks.getTrafficPoolBySlug.mockResolvedValue({ id: 'main-pool' });
  mocks.staffCanAccessLineAccount.mockResolvedValue(true);
  mocks.getStaffAccountIds.mockResolvedValue([]);
  mocks.ensure.mockResolvedValue({ status: 'ready', richMenuId: 'richmenu-private-implementation' });
});

describe('automatic block-menu account initialization', () => {
  test('POST initializes only after saving the new account and returns non-secret setup status', async () => {
    const { app, db } = appFor();
    const result = await app.request('/api/line-accounts', requestBody('POST', createBody));
    expect(result.status).toBe(201);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.ensure).toHaveBeenCalledWith(db, account.id);
    expect(mocks.createLineAccount.mock.invocationCallOrder[0]).toBeLessThan(mocks.ensure.mock.invocationCallOrder[0]);
    expect((await result.json()).blockSetup).toEqual({ status: 'ready' });
  });

  test('PUT initializes against the persisted account after replacing credentials and metadata', async () => {
    const { app, db } = appFor();
    const result = await app.request('/api/line-accounts/acc-new', requestBody('PUT', {
      channelAccessToken: 'rotated-token', country: '日本',
    }));
    expect(result.status).toBe(200);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.ensure).toHaveBeenCalledWith(db, account.id);
    expect(mocks.updateLineAccount.mock.invocationCallOrder[0]).toBeLessThan(mocks.ensure.mock.invocationCallOrder[0]);
    expect(mocks.updateLineAccountFields.mock.invocationCallOrder[0]).toBeLessThan(mocks.ensure.mock.invocationCallOrder[0]);
  });

  test('PATCH reactivation initializes after inactive-to-active transition', async () => {
    mocks.getLineAccountById.mockResolvedValue({ ...account, is_active: 0 });
    const { app, db } = appFor('admin');
    const result = await app.request('/api/line-accounts/acc-new', requestBody('PATCH', { isActive: true }));
    expect(result.status).toBe(200);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.ensure).toHaveBeenCalledWith(db, account.id);
    expect(mocks.updateLineAccountFields.mock.invocationCallOrder[0]).toBeLessThan(mocks.ensure.mock.invocationCallOrder[0]);
  });

  test('PATCH name-plus-reactivation also initializes only after the full update', async () => {
    mocks.getLineAccountById.mockResolvedValue({ ...account, is_active: 0 });
    const { app } = appFor('admin');
    const result = await app.request('/api/line-accounts/acc-new', requestBody('PATCH', { isActive: true, name: '再開' }));
    expect(result.status).toBe(200);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.updateLineAccount.mock.invocationCallOrder[0]).toBeLessThan(mocks.ensure.mock.invocationCallOrder[0]);
  });

  test.each([
    { isActive: false }, { isActive: true }, { country: '日本' }, { name: '新名称' },
  ])('PATCH active-account metadata %j does not initialize', async (body) => {
    const { app } = appFor('admin');
    const result = await app.request('/api/line-accounts/acc-new', requestBody('PATCH', body));
    expect(result.status).toBe(200);
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect((await result.json()).blockSetup).toBeUndefined();
  });

  test('PUT metadata-only changes do not contact setup', async () => {
    const { app } = appFor();
    const result = await app.request('/api/line-accounts/acc-new', requestBody('PUT', { country: '日本' }));
    expect(result.status).toBe(200);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  test('PUT inactive account credentials are saved and helper may report inactive', async () => {
    mocks.updateLineAccount.mockResolvedValue({ ...account, is_active: 0 });
    mocks.ensure.mockResolvedValue({ status: 'inactive' });
    const { app } = appFor();
    const result = await app.request('/api/line-accounts/acc-new', requestBody('PUT', { channelAccessToken: 'rotated-token' }));
    expect(result.status).toBe(200);
    expect((await result.json()).blockSetup).toEqual({ status: 'inactive' });
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
  });

  test.each(['pending', 'retry_wait'] as const)('successful account save reports %s retry state', async (status) => {
    mocks.ensure.mockResolvedValue({ status, code: 'LINE_API_UNAVAILABLE' });
    const { app } = appFor();
    const result = await app.request('/api/line-accounts', requestBody('POST', createBody));
    expect(result.status).toBe(201);
    expect((await result.json()).blockSetup).toEqual({ status, code: 'LINE_API_UNAVAILABLE' });
  });

  test('helper exception never undoes account save or logs secret exception contents', async () => {
    const secret = 'Bearer sensitive-channel-token';
    mocks.ensure.mockRejectedValue(new Error(secret));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { app } = appFor();
      const result = await app.request('/api/line-accounts', requestBody('POST', createBody));
      expect(result.status).toBe(201);
      expect((await result.json()).blockSetup).toEqual({ status: 'pending', code: 'BLOCK_SETUP_FAILED' });
      expect(JSON.stringify(warning.mock.calls)).not.toContain(secret);
      expect(warning).toHaveBeenCalledWith('[line-accounts] block setup deferred: BLOCK_SETUP_FAILED');
    } finally { warning.mockRestore(); }
  });

  test('unsafe service error codes are not reflected in response', async () => {
    mocks.ensure.mockResolvedValue({ status: 'pending', code: 'Bearer sensitive-channel-token' });
    const { app } = appFor();
    const result = await app.request('/api/line-accounts', requestBody('POST', createBody));
    expect((await result.json()).blockSetup).toEqual({ status: 'pending' });
  });

  test.each(['POST', 'PUT'] as const)('admin cannot trigger owner-only %s or setup', async (method) => {
    const { app } = appFor('admin');
    const path = method === 'POST' ? '/api/line-accounts' : '/api/line-accounts/acc-new';
    const result = await app.request(path, requestBody(method, createBody));
    expect(result.status).toBe(403);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  test('restricted admin cannot reactivate another account or initialize it', async () => {
    mocks.staffCanAccessLineAccount.mockResolvedValue(false);
    const { app } = appFor('admin');
    const result = await app.request('/api/line-accounts/acc-new', requestBody('PATCH', { isActive: true }));
    expect(result.status).toBe(403);
    expect(mocks.updateLineAccountFields).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  test('failed account write never attempts setup', async () => {
    mocks.createLineAccount.mockRejectedValue(new Error('UNIQUE constraint failed'));
    const { app } = appFor();
    const result = await app.request('/api/line-accounts', requestBody('POST', createBody));
    expect(result.status).toBe(409);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  test('listing accounts does not create setup resources or make extra LINE requests', async () => {
    mocks.getLineAccounts.mockResolvedValue([account]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { app } = appFor();
      const result = await app.request('/api/line-accounts');
      expect(result.status).toBe(200);
      expect(mocks.ensure).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.line.me/v2/bot/info');
    } finally { vi.unstubAllGlobals(); }
  });
});
