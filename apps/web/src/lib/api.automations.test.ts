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
});
