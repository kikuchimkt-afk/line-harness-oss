import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';

const dbMocks = {
  getForms: vi.fn(),
  getFormsWithStats: vi.fn(),
  getFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  deleteForm: vi.fn(),
  getFormSubmissions: vi.fn(),
  createFormSubmission: vi.fn(),
  deleteFormSubmission: vi.fn(),
  getFriendByLineUserId: vi.fn(),
  getFriendById: vi.fn(),
  addTagToFriend: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  jstNow: vi.fn(() => '2026-09-09T00:00:00.000'),
};

vi.mock('@line-crm/db', () => dbMocks);

const { forms } = await import('./forms.js');

type TestEnv = {
  Bindings: {
    DB: D1Database;
    LINE_CHANNEL_ACCESS_TOKEN: string;
  };
  Variables: {
    staff: { id: string; name: string; role: 'owner' | 'admin' | 'staff' };
  };
};

function setupApp() {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.env = {
      DB: {} as D1Database,
      LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
    };
    c.set('staff', { id: 'owner-1', name: 'Owner', role: 'owner' });
    await next();
  });
  app.route('/', forms);
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  dbMocks.jstNow.mockReturnValue('2026-09-09T00:00:00.000');
});

describe('DELETE /api/forms/:id', () => {
  test('deletes an existing form', async () => {
    dbMocks.getFormById.mockResolvedValue({ id: 'form-1' });

    const res = await setupApp().request('/api/forms/form-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(dbMocks.deleteForm).toHaveBeenCalledWith(expect.anything(), 'form-1');
    expect(await res.json()).toEqual({ success: true, data: null });
  });

  test('returns 404 when the form does not exist', async () => {
    dbMocks.getFormById.mockResolvedValue(null);

    const res = await setupApp().request('/api/forms/form-missing', { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(dbMocks.deleteForm).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ success: false, error: 'Form not found' });
  });
});

describe('DELETE /api/forms/:formId/submissions/:submissionId', () => {
  test('deletes one form submission', async () => {
    dbMocks.getFormById.mockResolvedValue({ id: 'form-1' });
    dbMocks.deleteFormSubmission.mockResolvedValue(true);

    const res = await setupApp().request('/api/forms/form-1/submissions/sub-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(dbMocks.getFormById).toHaveBeenCalledWith(expect.anything(), 'form-1');
    expect(dbMocks.deleteFormSubmission).toHaveBeenCalledWith(expect.anything(), 'form-1', 'sub-1');
    expect(await res.json()).toEqual({ success: true, data: null });
  });

  test('returns 404 when the form does not exist', async () => {
    dbMocks.getFormById.mockResolvedValue(null);

    const res = await setupApp().request('/api/forms/form-missing/submissions/sub-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(dbMocks.deleteFormSubmission).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ success: false, error: 'Form not found' });
  });

  test('returns 404 when the submission is not on the form', async () => {
    dbMocks.getFormById.mockResolvedValue({ id: 'form-1' });
    dbMocks.deleteFormSubmission.mockResolvedValue(false);

    const res = await setupApp().request('/api/forms/form-1/submissions/sub-missing', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Submission not found' });
  });
});
