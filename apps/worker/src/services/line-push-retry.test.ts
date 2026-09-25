import { describe, expect, test, vi } from 'vitest';
import type { LineClient } from '@line-crm/line-sdk';
import { pushMessageWithRetry } from './line-push-retry.js';

describe('pushMessageWithRetry', () => {
  test('retries transient failures with one stable LINE retry key', async () => {
    const pushMessage = vi.fn()
      .mockRejectedValueOnce(new Error('LINE API error: 503 Service Unavailable'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = { pushMessage } as unknown as LineClient;

    await pushMessageWithRetry(
      client,
      'U-test',
      [{ type: 'text', text: 'coupon' }],
      '123e4567-e89b-12d3-a456-426614174000',
      { delaysMs: [10, 20], timeoutMs: 1_000, sleep },
    );

    expect(pushMessage).toHaveBeenCalledTimes(3);
    expect(pushMessage.mock.calls.map((call) => call[2]?.retryKey)).toEqual([
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174000',
    ]);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  test('does not retry a permanent LINE 4xx response', async () => {
    const pushMessage = vi.fn().mockRejectedValue(new Error('LINE API error: 400 Bad Request'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = { pushMessage } as unknown as LineClient;

    await expect(pushMessageWithRetry(
      client,
      'U-test',
      [{ type: 'text', text: 'coupon' }],
      '123e4567-e89b-12d3-a456-426614174000',
      { delaysMs: [10, 20], timeoutMs: 1_000, sleep },
    )).rejects.toThrow('400');

    expect(pushMessage).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
