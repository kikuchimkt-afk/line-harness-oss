import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

describe('scenario API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://worker.example.com')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        generatedAt: '2026-09-29T09:00:00.000Z',
        sentMessageTotal: 0,
        sentDeliveryTotal: 0,
        sentRecipientTotal: 0,
        upcomingRecipientTotal: 0,
        sentHasMore: false,
        upcomingHasMore: false,
        sent: [],
        upcoming: [],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test('loads detailed delivery status with the default safe limit', async () => {
    const { api } = await import('./api')

    await api.scenarios.deliveryStatus('scenario / one')

    const fetchMock = vi.mocked(fetch)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      'https://worker.example.com/api/scenarios/scenario%20%2F%20one/delivery-status?limit=200',
    )
    expect(init?.credentials).toBe('include')
  })

  test.each([
    [0, 1],
    [999, 500],
    [12.8, 12],
    [Number.NaN, 200],
  ])('normalizes requested limit %s to %s', async (requested, expected) => {
    const { api } = await import('./api')

    await api.scenarios.deliveryStatus('scenario-1', requested)

    const fetchMock = vi.mocked(fetch)
    const [url] = fetchMock.mock.calls.at(-1) ?? []
    expect(String(url)).toContain(`/delivery-status?limit=${expected}`)
  })

  test('loads a friend state with encoded ids and no mutation', async () => {
    const { api } = await import('./api')

    await api.scenarios.manualStartState('scenario / one', 'friend / one')

    const fetchMock = vi.mocked(fetch)
    const [url, init] = fetchMock.mock.calls.at(-1) ?? []
    expect(String(url)).toBe(
      'https://worker.example.com/api/scenarios/scenario%20%2F%20one/manual-start-state/friend%20%2F%20one',
    )
    expect(init?.method).toBeUndefined()
  })

  test('posts the selected friend, step, timing and optimistic state version', async () => {
    const { api } = await import('./api')

    await api.scenarios.startFromStep('scenario / one', {
      friendId: 'friend-1',
      stepId: 'step-2',
      deliveryTiming: 'next_cron',
      expectedStateVersion: 'enrollment-1:1:2026-09-29',
    })

    const fetchMock = vi.mocked(fetch)
    const [url, init] = fetchMock.mock.calls.at(-1) ?? []
    expect(String(url)).toBe(
      'https://worker.example.com/api/scenarios/scenario%20%2F%20one/start-from-step',
    )
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      friendId: 'friend-1',
      stepId: 'step-2',
      deliveryTiming: 'next_cron',
      expectedStateVersion: 'enrollment-1:1:2026-09-29',
    })
  })

  test('patches one enrollment schedule with encoded ids and optimistic state', async () => {
    const { api } = await import('./api')

    await api.scenarios.updateDeliverySchedule('scenario / one', 'run / one', {
      friendId: 'friend-1',
      stepId: 'step-2',
      nextDeliveryAt: '2026-10-01T18:32:00.000+09:00',
      expectedStateVersion: 'run-1.active.1.snapshot',
      confirmPreviouslySent: true,
    })

    const fetchMock = vi.mocked(fetch)
    const [url, init] = fetchMock.mock.calls.at(-1) ?? []
    expect(String(url)).toBe(
      'https://worker.example.com/api/scenarios/scenario%20%2F%20one/enrollments/run%20%2F%20one/schedule',
    )
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({
      friendId: 'friend-1',
      stepId: 'step-2',
      nextDeliveryAt: '2026-10-01T18:32:00.000+09:00',
      expectedStateVersion: 'run-1.active.1.snapshot',
      confirmPreviouslySent: true,
    })
  })
})
