import { describe, expect, test, vi } from 'vitest';
import { parseRetryAfterMs, submitWithRetry } from './form-submit-retry.js';

describe('form submit retry', () => {
  test('retries 503 and reuses one idempotency key', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"success":true}', { status: 201 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await submitWithRetry(
      '/api/forms/form-1/submit',
      { data: { guardian: 'A' } },
      'request-12345678',
      { fetchImpl, sleep, retryDelaysMs: [100], timeoutMs: 1_000, random: () => 0.5 },
    );

    expect(response.status).toBe(201);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map((call) => call[1]?.headers)).toEqual([
      expect.objectContaining({ 'Idempotency-Key': 'request-12345678' }),
      expect.objectContaining({ 'Idempotency-Key': 'request-12345678' }),
    ]);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  test('honors Retry-After for 429', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await submitWithRetry('/submit', {}, 'request-12345678', {
      fetchImpl,
      sleep,
      retryDelaysMs: [100],
      timeoutMs: 1_000,
    });

    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  test('does not retry a validation response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await submitWithRetry('/submit', {}, 'request-12345678', {
      fetchImpl,
      sleep,
      retryDelaysMs: [100],
      timeoutMs: 1_000,
    });

    expect(response.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('parses both seconds and HTTP-date Retry-After values', () => {
    expect(parseRetryAfterMs('3', 0)).toBe(3_000);
    expect(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:04 GMT', 1_000)).toBe(3_000);
  });
});
