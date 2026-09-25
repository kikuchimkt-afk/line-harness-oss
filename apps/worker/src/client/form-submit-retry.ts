const DEFAULT_RETRY_DELAYS_MS = [300, 900, 2_000] as const;
const DEFAULT_TIMEOUT_MS = 12_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

type SubmitRetryOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
};

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function parseRetryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 10_000);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(Math.max(0, timestamp - now), 10_000);
}

/**
 * Submit a form with a stable idempotency key. Only transient failures retry;
 * validation/auth/not-found responses are returned immediately.
 */
export async function submitWithRetry(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
  options: SubmitRetryOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!RETRYABLE_STATUS.has(response.status) || attempt >= retryDelays.length) {
        return response;
      }

      const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'), now());
      const jitteredBackoff = Math.round(retryDelays[attempt] * (0.75 + random() * 0.5));
      await sleep(retryAfter ?? jitteredBackoff);
    } catch (error) {
      if (attempt >= retryDelays.length) {
        throw new Error('通信が安定しません。入力内容は保持されています。少し待ってからもう一度送信してください。', {
          cause: error,
        });
      }
      const jitteredBackoff = Math.round(retryDelays[attempt] * (0.75 + random() * 0.5));
      await sleep(jitteredBackoff);
    } finally {
      clearTimeout(timeout);
    }
  }
}
