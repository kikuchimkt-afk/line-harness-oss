import { describe, expect, it, vi } from 'vitest';
import { retryLiffLinkAfterFriendAdd } from './liff-link-retry.js';

describe('retryLiffLinkAfterFriendAdd', () => {
  it('retries a webhook race until the friend row exists', async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await retryLiffLinkAfterFriendAdd(attempt, {
      delaysMs: [0, 250, 500],
      sleep,
    });

    expect(result).toEqual({ ok: true, status: 200 });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it('does not replay non-404 failures', async () => {
    const attempt = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await retryLiffLinkAfterFriendAdd(attempt, {
      delaysMs: [0, 250, 500],
      sleep,
    });

    expect(result).toEqual({ ok: false, status: 401 });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('returns the final 404 after exhausting the retry window', async () => {
    const attempt = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await retryLiffLinkAfterFriendAdd(attempt, {
      delaysMs: [0, 100, 200],
      sleep,
    });

    expect(result).toEqual({ ok: false, status: 404 });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it('does not replay an ambiguous network failure', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('offline'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await retryLiffLinkAfterFriendAdd(attempt, {
      delaysMs: [0, 250],
      sleep,
    });

    expect(result).toBeNull();
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
