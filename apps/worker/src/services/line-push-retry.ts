import type { LineClient, Message } from '@line-crm/line-sdk';

// Keep the server-side retry budget below the browser's 12s request timeout so
// a slow LINE API does not create overlapping replay storms at an event.
const DEFAULT_DELAYS_MS = [250, 750] as const;
const DEFAULT_TIMEOUT_MS = 2_500;

type RetryOptions = {
  delaysMs?: readonly number[];
  timeoutMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isRetryableLinePushError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /LINE API error:\s*(?:408|425|429|500|502|503|504)\b|abort|network|fetch failed|timed?\s*out|connection reset/i.test(message);
}

/**
 * Retry transient LINE push failures with the same X-Line-Retry-Key.
 * LINE treats a 409 for an already accepted retry key as success, so an
 * uncertain timeout cannot result in a duplicate coupon/confirmation message.
 */
export async function pushMessageWithRetry(
  client: LineClient,
  to: string,
  messages: Message[],
  retryKey: string,
  options: RetryOptions = {},
): Promise<void> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await client.pushMessage(to, messages, {
        retryKey,
        signal: controller.signal,
      });
      return;
    } catch (error) {
      if (!isRetryableLinePushError(error) || attempt >= delays.length) throw error;
      await sleep(delays[attempt]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
