import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';

const dbMocks = {
  getStaffMembers: vi.fn(),
  getStaffById: vi.fn(),
  createStaffMember: vi.fn(),
  updateStaffMember: vi.fn(),
  deleteStaffMember: vi.fn(),
  regenerateStaffApiKey: vi.fn(),
  countActiveStaffByRole: vi.fn(),
  getStaffAccountIds: vi.fn(),
  getStaffAccountIdsMap: vi.fn(),
  setStaffAccountIds: vi.fn(),
};

vi.mock('@line-crm/db', () => dbMocks);

const { staff } = await import('./staff.js');

type TestEnv = {
  Variables: { staff: { id: string; name: string; role: 'owner' | 'admin' | 'staff' } };
  Bindings: { DB: D1Database };
};

const fakeMember = {
  id: 'staff-1',
  name: '山田 花子',
  email: 'hanako@example.com',
  role: 'admin' as const,
  api_key: 'lh_1234567890abcdef1234567890abcdef',
  is_active: 1,
  created_at: '2026-07-03T00:00:00.000',
  updated_at: '2026-07-03T00:00:00.000',
};

function setupApp(role: 'owner' | 'admin' | 'staff' = 'owner') {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('staff', { id: 'owner-1', name: 'Owner', role });
    c.env = { DB: {} as D1Database };
    await next();
  });
  app.route('/', staff);
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  dbMocks.createStaffMember.mockResolvedValue(fakeMember);
  dbMocks.getStaffAccountIds.mockResolvedValue([]);
  dbMocks.getStaffAccountIdsMap.mockResolvedValue(new Map());
});

describe('POST /api/staff account scope', () => {
  test('rejects admin/staff creation without assigned LINE accounts', async () => {
    const res = await setupApp().request('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '山田 花子',
        role: 'admin',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('LINEアカウント');
    expect(dbMocks.createStaffMember).not.toHaveBeenCalled();
  });

  test('stores selected LINE accounts and returns them with the one-time API key', async () => {
    const res = await setupApp().request('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '山田 花子',
        email: 'hanako@example.com',
        role: 'admin',
        lineAccountIds: ['acc-1', 'acc-2', 'acc-1'],
      }),
    });

    expect(res.status).toBe(201);
    expect(dbMocks.createStaffMember).toHaveBeenCalledWith(expect.anything(), {
      name: '山田 花子',
      email: 'hanako@example.com',
      role: 'admin',
    });
    expect(dbMocks.setStaffAccountIds).toHaveBeenCalledWith(expect.anything(), 'staff-1', [
      'acc-1',
      'acc-2',
    ]);

    const body = (await res.json()) as {
      success: boolean;
      data: { apiKey: string; lineAccountIds: string[] };
    };
    expect(body.success).toBe(true);
    expect(body.data.apiKey).toBe(fakeMember.api_key);
    expect(body.data.lineAccountIds).toEqual(['acc-1', 'acc-2']);
  });
});

describe('POST /api/staff/:id/regenerate-key', () => {
  test('returns the newly generated API key', async () => {
    dbMocks.getStaffById.mockResolvedValue(fakeMember);
    dbMocks.regenerateStaffApiKey.mockResolvedValue('lh_newkey1234567890abcdef1234567890');

    const res = await setupApp().request('/api/staff/staff-1/regenerate-key', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(dbMocks.regenerateStaffApiKey).toHaveBeenCalledWith(expect.anything(), 'staff-1');
    const body = (await res.json()) as { success: boolean; data: { apiKey: string } };
    expect(body.success).toBe(true);
    expect(body.data.apiKey).toBe('lh_newkey1234567890abcdef1234567890');
  });
});
