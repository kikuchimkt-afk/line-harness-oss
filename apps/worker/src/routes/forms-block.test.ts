import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveFormCallerFriend: vi.fn(), isFriendBlocked: vi.fn(), addTagWithBlockEnforcement: vi.fn(),
  getForms: vi.fn(), getFormsWithStats: vi.fn(), getFormById: vi.fn(), createForm: vi.fn(),
  updateForm: vi.fn(), deleteForm: vi.fn(), getFormSubmissions: vi.fn(), createFormSubmission: vi.fn(),
  deleteFormSubmission: vi.fn(), getFriendById: vi.fn(), getLineAccountById: vi.fn(), getTrackedLinkById: vi.fn(), getMessageTemplateById: vi.fn(), addTagToFriend: vi.fn(), enrollFriendInScenario: vi.fn(),
  pushMessage: vi.fn(), pushTextMessage: vi.fn(),
  jstNow: vi.fn(() => '2026-10-15T00:00:00.000+09:00'),
}));
vi.mock('@line-crm/db', () => mocks);
vi.mock('../services/form-caller-auth.js', () => mocks);
vi.mock('../services/block-tag-attach.js', () => ({ addTagWithBlockEnforcement: mocks.addTagWithBlockEnforcement }));
vi.mock('../services/friend-block-policy.js', () => ({
  isFriendBlocked: mocks.isFriendBlocked, BLOCKED_FRIEND_MESSAGE: '現在、この機能はご利用いただけません。',
}));
vi.mock('@line-crm/line-sdk', () => ({ LineClient: class {
  pushMessage = mocks.pushMessage;
  pushTextMessage = mocks.pushTextMessage;
} }));
vi.mock('../services/step-delivery.js', () => ({
  buildMessage: (type: string, content: string) => ({ type, text: content }),
  expandVariables: (content: string) => content,
  resolveMetadata: async () => ({}),
  messageToLogPayload: () => ({ messageType: 'text', content: 'synthetic-message' }),
}));
import { forms } from './forms.js';

const verifiedFriend = { id: 'verified-friend', line_account_id: 'account-a', display_name: '架空の保護者', metadata: '{}' };
let run: ReturnType<typeof vi.fn>;
let bind: ReturnType<typeof vi.fn>;
let db: D1Database;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.addTagWithBlockEnforcement.mockReset();
  mocks.resolveFormCallerFriend.mockResolvedValue({ friend: verifiedFriend, authenticated: true });
  mocks.isFriendBlocked.mockResolvedValue(true);
  run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  bind = vi.fn(() => ({ run, first: vi.fn().mockResolvedValue(null), all: vi.fn().mockResolvedValue({ results: [] }) }));
  db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;
});
afterEach(() => vi.unstubAllGlobals());

function post(action: string, body: Record<string, unknown> = {}) {
  return forms.request(`/api/forms/form-a/${action}`, {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: 'forged-unblocked-friend', lineUserId: 'U_forged', ...body }),
  }, { DB: db, LINE_LOGIN_CHANNEL_ID: 'login-a' });
}

describe('form customer block gates', () => {
  it.each(['opened', 'partial', 'submit'])('rejects blocked %s before all writes despite forged body identity', async (action) => {
    const response = await post(action, { data: { name: 'synthetic' } });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FRIEND_BLOCKED');
    expect(mocks.isFriendBlocked).toHaveBeenCalledTimes(1);
    expect(mocks.isFriendBlocked).toHaveBeenCalledWith(db, 'verified-friend', 'account-a');
    expect(run).not.toHaveBeenCalled();
    expect(mocks.getFormById).not.toHaveBeenCalled();
    expect(mocks.createFormSubmission).not.toHaveBeenCalled();
    expect(mocks.addTagToFriend).not.toHaveBeenCalled();
    expect(mocks.enrollFriendInScenario).not.toHaveBeenCalled();
  });

  it.each(['opened', 'partial', 'submit'])('requires verified LINE authentication for %s', async (action) => {
    mocks.resolveFormCallerFriend.mockResolvedValue({ friend: null, authenticated: false });
    expect((await post(action)).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(mocks.isFriendBlocked).not.toHaveBeenCalled();
  });

  it('does not select a forged friend when the caller has no linked row', async () => {
    mocks.resolveFormCallerFriend.mockResolvedValue({ friend: null, authenticated: true });
    expect((await post('submit')).status).toBe(404);
    expect(mocks.createFormSubmission).not.toHaveBeenCalled();
  });

  it('records an unblocked form open against the verified friend only', async () => {
    mocks.isFriendBlocked.mockResolvedValue(false);
    expect((await post('opened')).status).toBe(200);
    expect(bind).toHaveBeenCalledWith(expect.any(String), 'form-a', 'verified-friend', '架空の保護者', expect.any(String));
  });

  it('updates only the verified caller metadata, not body friendId', async () => {
    mocks.isFriendBlocked.mockResolvedValue(false);
    expect((await post('partial', { data: { grade: '中2' } })).status).toBe(200);
    expect(bind).toHaveBeenCalledWith(JSON.stringify({ grade: '中2' }), expect.any(String), 'verified-friend');
  });

  it('stores allowed submissions against the verified friend', async () => {
    mocks.isFriendBlocked.mockResolvedValue(false);
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1 });
    mocks.createFormSubmission.mockResolvedValue({ id: 'submission-a', form_id: 'form-a', friend_id: 'verified-friend', data: '{}' });
    mocks.getFriendById.mockResolvedValue(null);
    expect((await post('submit', { data: {} })).status).toBe(201);
    expect(mocks.createFormSubmission).toHaveBeenCalledWith(db, { formId: 'form-a', friendId: 'verified-friend', data: '{}' });
  });

  it('rechecks after an external form gate before storing or sending', async () => {
    mocks.isFriendBlocked.mockResolvedValueOnce(false).mockResolvedValue(true);
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1, on_submit_webhook_url: 'https://synthetic.example/gate' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ eligible: true })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await post('submit', { data: {} })).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.createFormSubmission).not.toHaveBeenCalled();
    expect(mocks.addTagToFriend).not.toHaveBeenCalled();
    expect(mocks.enrollFriendInScenario).not.toHaveBeenCalled();
  });

  it('enforces its on-submit block tag before scenario enrollment, metadata or confirmation', async () => {
    let blocked = false;
    mocks.isFriendBlocked.mockImplementation(async () => blocked);
    mocks.addTagWithBlockEnforcement.mockImplementation(async () => { blocked = true; return true; });
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1,
      on_submit_tag_id: 'block-tag', on_submit_scenario_id: 'scenario-a', save_to_metadata: 1 });
    mocks.createFormSubmission.mockResolvedValue({ id: 'submission-a', form_id: 'form-a', friend_id: 'verified-friend', data: '{}' });
    expect((await post('submit', { data: {} })).status).toBe(201);
    expect(mocks.addTagWithBlockEnforcement).toHaveBeenCalledWith(db, 'verified-friend', 'block-tag');
    expect(mocks.createFormSubmission).toHaveBeenCalledTimes(1);
    expect(mocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(mocks.pushMessage).not.toHaveBeenCalled();
    expect(mocks.pushTextMessage).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('waits for ordinary tag attachment before starting the configured scenario', async () => {
    const order: string[] = [];
    mocks.isFriendBlocked.mockResolvedValue(false);
    mocks.addTagWithBlockEnforcement.mockImplementation(async () => { await Promise.resolve(); order.push('tag'); return false; });
    mocks.enrollFriendInScenario.mockImplementation(async () => { order.push('enroll'); });
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1,
      on_submit_tag_id: 'ordinary-tag', on_submit_scenario_id: 'scenario-a' });
    mocks.createFormSubmission.mockResolvedValue({ id: 'submission-a', form_id: 'form-a', friend_id: 'verified-friend', data: '{}' });
    mocks.getFriendById.mockResolvedValue(null);
    expect((await post('submit', { data: {} })).status).toBe(201);
    expect(order).toEqual(['tag', 'enroll']);
    expect(mocks.enrollFriendInScenario).toHaveBeenCalledWith(db, 'verified-friend', 'scenario-a');
  });

  it('does not launch confirmations or enrollments when tag enforcement fails', async () => {
    mocks.isFriendBlocked.mockResolvedValue(false);
    mocks.addTagWithBlockEnforcement.mockRejectedValue(new Error('synthetic cancellation failure'));
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1,
      on_submit_tag_id: 'block-tag', on_submit_scenario_id: 'scenario-a' });
    mocks.createFormSubmission.mockResolvedValue({ id: 'submission-a', form_id: 'form-a', friend_id: 'verified-friend', data: '{}' });
    expect((await post('submit', { data: {} })).status).toBe(500);
    expect(mocks.enrollFriendInScenario).not.toHaveBeenCalled();
    expect(mocks.pushMessage).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('skips a late-blocked confirmation without push or sent-message history', async () => {
    mocks.isFriendBlocked.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1 });
    mocks.createFormSubmission.mockResolvedValue({ id: 'submission-a', form_id: 'form-a', friend_id: 'verified-friend', data: '{}' });
    mocks.getFriendById.mockResolvedValue({ ...verifiedFriend, line_user_id: 'U_verified' });
    mocks.getLineAccountById.mockResolvedValue({ channel_access_token: 'synthetic-token' });
    expect((await post('submit', { data: {} })).status).toBe(201);
    expect(mocks.createFormSubmission).toHaveBeenCalledTimes(1);
    expect(mocks.pushMessage).not.toHaveBeenCalled();
    expect(mocks.pushTextMessage).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('stops the external-gate failure reply immediately before push without records', async () => {
    mocks.isFriendBlocked.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1,
      on_submit_webhook_url: 'https://synthetic.example/gate', on_submit_webhook_fail_message: 'Synthetic failure' });
    mocks.getFriendById.mockResolvedValue({ ...verifiedFriend, line_user_id: 'U_verified' });
    mocks.getLineAccountById.mockResolvedValue({ channel_access_token: 'synthetic-token' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ eligible: false }))));
    expect((await post('submit', { data: {} })).status).toBe(403);
    expect(mocks.createFormSubmission).not.toHaveBeenCalled();
    expect(mocks.pushMessage).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps anonymous public form-definition reads outside this stop policy', async () => {
    mocks.getFormById.mockResolvedValue({ id: 'form-a', name: 'Synthetic', fields: '[]', is_active: 1 });
    expect((await forms.request('/api/forms/form-a', undefined, { DB: db })).status).toBe(200);
    expect(mocks.resolveFormCallerFriend).not.toHaveBeenCalled();
    expect(mocks.isFriendBlocked).not.toHaveBeenCalled();
  });

  it.each(['opened', 'partial', 'submit'])('fails closed when the %s block lookup fails', async (action) => {
    mocks.isFriendBlocked.mockRejectedValue(new Error('synthetic policy lookup failure'));
    expect((await post(action)).status).toBe(500);
    expect(run).not.toHaveBeenCalled();
    expect(mocks.createFormSubmission).not.toHaveBeenCalled();
  });
});
