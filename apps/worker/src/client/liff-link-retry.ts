export type LiffLinkAttemptResult = {
  ok: boolean;
  status: number;
};

type RetryOptions = {
  delaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
};

// The follow webhook creates the friends row asynchronously after the user
// returns from LINE's friend-add screen. Retry only the expected 404 race;
// other statuses can represent permanent auth errors or a partially applied
// attribution flow and must not be replayed automatically.
export const FRIEND_LINK_RETRY_DELAYS_MS = [0, 250, 500, 1_000, 2_000, 3_000] as const;

export async function retryLiffLinkAfterFriendAdd(
  attempt: () => Promise<LiffLinkAttemptResult>,
  options: RetryOptions = {},
): Promise<LiffLinkAttemptResult | null> {
  const delaysMs = options.delaysMs ?? FRIEND_LINK_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  }));

  let lastResult: LiffLinkAttemptResult | null = null;

  for (const delayMs of delaysMs) {
    if (delayMs > 0) await sleep(delayMs);

    try {
      lastResult = await attempt();
    } catch {
      // A lost response may still mean that attribution and an immediate
      // scenario push were applied. Avoid replaying an ambiguous request.
      return null;
    }

    if (lastResult.ok || lastResult.status !== 404) {
      return lastResult;
    }
  }

  return lastResult;
}
