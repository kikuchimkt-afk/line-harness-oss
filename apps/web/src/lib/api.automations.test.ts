import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('automations API', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://worker.example.com');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        id: 'automation-1',
        name: '5歳 reply',
        description: null,
        eventType: 'message_received',
        conditions: { keyword_exact: '5歳' },
        actions: [],
        lineAccountId: 'acc-aikotoba',
        isActive: true,
        priority: 100,
        createdAt: '2026-09-11T00:00:00.000',
        updatedAt: '2026-09-11T00:00:00.000',
      },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('create serializes the selected lineAccountId', async () => {
    const { api } = await import('./api');

    await api.automations.create({
      name: '5歳 reply',
      eventType: 'message_received',
      conditions: { keyword_exact: '5歳' },
      actions: [],
      lineAccountId: 'acc-aikotoba',
      priority: 100,
    });

    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      lineAccountId: 'acc-aikotoba',
    });
  });

  test('loads account-scoped rich-menu assignment status', async () => {
    const { api } = await import('./api');
    await api.automations.richMenuAssignments('acc aikotoba', 50);
    const fetchMock = vi.mocked(fetch);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/automations/rich-menu-assignments?');
    expect(String(url)).toContain('lineAccountId=acc+aikotoba');
    expect(String(url)).toContain('limit=50');
  });

  test('queues bulk retry without replaying the automation', async () => {
    const { api } = await import('./api');
    await api.automations.retryFailedRichMenuAssignments('acc-aikotoba');
    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/automations/rich-menu-assignments/retry-failed');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ lineAccountId: 'acc-aikotoba' });
  });
});
