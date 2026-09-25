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
  getFormSubmissionByIdempotencyKey: vi.fn(),
  markFormSubmissionDelivery: vi.fn(),
  deleteFormSubmission: vi.fn(),
  getFriendByLineUserId: vi.fn(),
  getFriendById: vi.fn(),
  getTrackedLinkById: vi.fn(),
  getMessageTemplateById: vi.fn(),
  addTagToFriend: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  jstNow: vi.fn(() => '2026-09-09T00:00:00.000'),
};

vi.mock('@line-crm/db', () => dbMocks);

const deliveryMocks = {
  pushMessageWithRetry: vi.fn(),
  resolveRewardTemplate: vi.fn(async () => null),
};

vi.mock('../services/line-push-retry.js', () => ({
  pushMessageWithRetry: deliveryMocks.pushMessageWithRetry,
}));
vi.mock('../services/reward-resolver.js', () => ({
  resolveRewardTemplate: deliveryMocks.resolveRewardTemplate,
}));
vi.mock('../services/reward-message.js', () => ({
  buildRewardMessage: vi.fn(() => null),
}));
vi.mock('../services/step-delivery.js', () => ({
  buildMessage: vi.fn((type: string, content: string) => ({ type, text: content })),
  expandVariables: vi.fn((content: string) => content),
  resolveMetadata: vi.fn(async () => ({})),
  messageToLogPayload: vi.fn((message: { type: string; text?: string }) => ({
    messageType: message.type,
    content: message.text ?? '',
  })),
}));
vi.mock('@line-crm/line-sdk', () => ({
  LineClient: class LineClient {
    constructor(readonly accessToken: string) {}
  },
}));

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
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => ({ success: true }),
          }),
        }),
      } as unknown as D1Database,
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
  for (const fn of Object.values(deliveryMocks)) fn.mockReset();
  dbMocks.jstNow.mockReturnValue('2026-09-09T00:00:00.000');
  deliveryMocks.resolveRewardTemplate.mockResolvedValue(null);
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

describe('POST /api/forms/:id/submit idempotency', () => {
  const form = {
    id: 'form-1',
    name: 'Event survey',
    fields: '[]',
    is_active: 1,
    on_submit_webhook_url: null,
    save_to_metadata: 0,
    on_submit_tag_id: null,
    on_submit_scenario_id: null,
  };
  const submission = {
    id: 'submission-1',
    form_id: 'form-1',
    friend_id: null,
    data: '{}',
    idempotency_key: 'request-12345678',
    tracked_link_id: null,
    delivery_status: 'not_required',
    delivery_retry_key: null,
    delivery_error: null,
    delivery_attempts: 0,
    created_at: '2026-09-09T00:00:00.000',
  };

  test('returns the first saved row without repeating side effects on replay', async () => {
    dbMocks.getFormById.mockResolvedValue(form);
    dbMocks.createFormSubmission
      .mockResolvedValueOnce({ submission, created: true })
      .mockResolvedValueOnce({ submission, created: false });
    const app = setupApp();
    const request = () => app.request('/api/forms/form-1/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'request-12345678',
      },
      body: JSON.stringify({ data: {} }),
    });

    const first = await request();
    const replay = await request();

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect((await first.json()).data.idempotentReplay).toBe(false);
    expect((await replay.json()).data.idempotentReplay).toBe(true);
    expect(dbMocks.createFormSubmission).toHaveBeenNthCalledWith(1, expect.anything(), {
      formId: 'form-1',
      friendId: null,
      data: '{}',
      idempotencyKey: 'request-12345678',
      trackedLinkId: null,
    });
  });

  test('rejects malformed idempotency keys before writing', async () => {
    dbMocks.getFormById.mockResolvedValue(form);

    const response = await setupApp().request('/api/forms/form-1/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'bad key',
      },
      body: JSON.stringify({ data: {} }),
    });

    expect(response.status).toBe(400);
    expect(dbMocks.createFormSubmission).not.toHaveBeenCalled();
  });

  test('returns 503 on confirmation failure and resumes with the same LINE retry key', async () => {
    const friendForm = {
      ...form,
      on_submit_message_type: 'text',
      on_submit_message_content: '回答ありがとうございます',
    };
    const pendingSubmission = {
      ...submission,
      friend_id: 'friend-1',
      data: JSON.stringify({ guardian: 'first' }),
      tracked_link_id: 'tracked-first',
      delivery_status: 'pending',
      delivery_retry_key: '018f7b5a-3d2c-7e91-8a44-123456789abc',
    };
    const failedSubmission = { ...pendingSubmission, delivery_status: 'failed' };
    const friend = {
      id: 'friend-1',
      line_user_id: 'U123',
      line_account_id: null,
      display_name: '保護者A',
      user_id: null,
      ref_code: null,
      metadata: '{}',
    };
    dbMocks.getFormById.mockResolvedValue(friendForm);
    dbMocks.getFriendById.mockResolvedValue(friend);
    dbMocks.getFormSubmissionByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(failedSubmission);
    dbMocks.createFormSubmission.mockResolvedValueOnce({ submission: pendingSubmission, created: true });
    deliveryMocks.pushMessageWithRetry
      .mockRejectedValueOnce(new Error('LINE API error: 503'))
      .mockResolvedValueOnce(undefined);

    const app = setupApp();
    const request = (requestBody: Record<string, unknown>) => app.request('/api/forms/form-1/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'request-12345678',
      },
      body: JSON.stringify(requestBody),
    });

    const first = await request({
      friendId: 'friend-1',
      trackedLinkId: 'tracked-first',
      data: { guardian: 'first' },
    });
    const replay = await request({
      friendId: 'friend-other',
      trackedLinkId: 'tracked-other',
      data: { guardian: 'changed replay body' },
    });

    expect(first.status).toBe(503);
    expect(replay.status).toBe(200);
    expect(deliveryMocks.pushMessageWithRetry).toHaveBeenCalledTimes(2);
    expect(deliveryMocks.pushMessageWithRetry.mock.calls.map((call) => call[3])).toEqual([
      pendingSubmission.delivery_retry_key,
      pendingSubmission.delivery_retry_key,
    ]);
    expect(dbMocks.createFormSubmission).toHaveBeenCalledTimes(1);
    expect(deliveryMocks.resolveRewardTemplate.mock.calls.map((call) => call[1])).toEqual([
      { friendId: 'friend-1', requestedTrackedLinkId: 'tracked-first' },
      { friendId: 'friend-1', requestedTrackedLinkId: 'tracked-first' },
    ]);
    expect(dbMocks.markFormSubmissionDelivery).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      pendingSubmission.id,
      'failed',
      'LINE API error: 503',
    );
    expect(dbMocks.markFormSubmissionDelivery).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      pendingSubmission.id,
      'sent',
    );
  });

  test('reuses a persisted webhook rejection without invoking the webhook again', async () => {
    const rejectedSubmission = {
      ...submission,
      data: JSON.stringify({ answer: 'first', _webhookResult: { eligible: false } }),
    };
    dbMocks.getFormById.mockResolvedValue({
      ...form,
      on_submit_webhook_url: 'https://gate.example/check',
      on_submit_webhook_fail_message: '今回は対象外です',
    });
    dbMocks.getFormSubmissionByIdempotencyKey.mockResolvedValue(rejectedSubmission);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await setupApp().request('/api/forms/form-1/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'request-12345678',
        },
        body: JSON.stringify({ data: { answer: 'changed' } }),
      });

      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({
        id: rejectedSubmission.id,
        webhookPassed: false,
        webhookData: { eligible: false },
        idempotentReplay: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dbMocks.createFormSubmission).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
