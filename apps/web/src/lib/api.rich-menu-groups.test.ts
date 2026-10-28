import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

describe('rich menu group API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://worker.example.com')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              chunks: 1,
              total: 4,
              futureApplied: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test('requests current bulk linking and future tag auto-apply together', async () => {
    const { api } = await import('./api')

    const response = await api.richMenuGroups.applyToTag('group-1', {
      mode: 'bulk-link',
      tagId: 'tag-1',
      applyToFuture: true,
    })

    const fetchMock = vi.mocked(fetch)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://worker.example.com/api/rich-menu-groups/group-1/apply-to-tag',
    )
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      mode: 'bulk-link',
      tagId: 'tag-1',
      applyToFuture: true,
    })
    expect(response.data?.futureApplied).toBe(true)
  })
})
