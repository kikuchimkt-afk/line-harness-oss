import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getTrackedLinks: vi.fn(),
  getTrackedLinkById: vi.fn(),
  createTrackedLink: vi.fn(),
  updateTrackedLink: vi.fn(),
  deleteTrackedLink: vi.fn(),
  recordLinkClick: vi.fn().mockResolvedValue(undefined),
  getLinkClicks: vi.fn(),
  getFriendByLineUserId: vi.fn(),
  enrollFriendInScenario: vi.fn().mockResolvedValue(undefined),
}));

const attachTagAndFireSideEffects = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ added: true }),
);

vi.mock('@line-crm/db', () => dbMocks);
vi.mock('../services/friend-tag-attach.js', () => ({ attachTagAndFireSideEffects }));

const { trackedLinks } = await import('./tracked-links.js');

describe('GET /t/:linkId tag attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.recordLinkClick.mockResolvedValue(undefined);
    attachTagAndFireSideEffects.mockResolvedValue({ added: true });
  });

  it('uses the idempotent tag helper for an identified friend', async () => {
    const db = {} as D1Database;
    dbMocks.getTrackedLinkById.mockResolvedValue({
      id: 'link-1',
      name: 'LP',
      original_url: 'https://example.com/lp',
      tag_id: 'tag-1',
      scenario_id: null,
      intro_template_id: null,
      reward_template_id: null,
      is_active: 1,
      click_count: 0,
      created_at: '2026-09-22T12:00:00.000+09:00',
      updated_at: '2026-09-22T12:00:00.000+09:00',
    });
    const waits: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    const response = await trackedLinks.request(
      'https://worker.example.com/t/link-1?f=friend-1',
      { headers: { 'user-agent': 'Mozilla/5.0 Safari/605.1.15' }, redirect: 'manual' },
      { DB: db, WORKER_URL: 'https://worker.example.com' },
      executionCtx,
    );
    await Promise.all(waits);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/lp');
    expect(dbMocks.recordLinkClick).toHaveBeenCalledWith(db, 'link-1', 'friend-1');
    expect(attachTagAndFireSideEffects).toHaveBeenCalledWith(db, 'friend-1', 'tag-1');
  });
});
