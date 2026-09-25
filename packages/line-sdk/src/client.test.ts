import { afterEach, describe, expect, test, vi } from 'vitest';
import { LineClient } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LineClient push retry key', () => {
  test('sends X-Line-Retry-Key on the first push attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new LineClient('token').pushMessage(
      'U-test',
      [{ type: 'text', text: 'coupon' }],
      { retryKey: '123e4567-e89b-12d3-a456-426614174000' },
    );

    const request = fetchMock.mock.calls[0];
    expect(request[1]?.headers).toMatchObject({
      Authorization: 'Bearer token',
      'X-Line-Retry-Key': '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  test('treats LINE 409 for an accepted retry key as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'The retry key is already accepted' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(new LineClient('token').pushMessage(
      'U-test',
      [{ type: 'text', text: 'coupon' }],
      { retryKey: '123e4567-e89b-12d3-a456-426614174000' },
    )).resolves.toEqual({ message: 'The retry key is already accepted' });
  });
});
