export interface DecodedLiffIdToken {
  exp?: number;
}

export function isExpiredLiffIdToken(
  token: DecodedLiffIdToken | null,
  nowMs = Date.now(),
  clockSkewSeconds = 30,
): boolean {
  if (typeof token?.exp !== 'number' || !Number.isFinite(token.exp)) return false;
  return token.exp <= Math.floor(nowMs / 1000) + clockSkewSeconds;
}

const REAUTH_KEY = 'lh_liff_reauth_at';
const REAUTH_COOLDOWN_MS = 2 * 60_000;

/**
 * Allow one automatic re-login per tab every couple of minutes. A reload
 * resets in-memory flags, so without this a token that stays expired (e.g. a
 * phone clock running fast) or a 401 for another reason would reload forever.
 * Without usable storage we cannot tell, so we do not reload at all.
 */
export function shouldStartReauthentication(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  nowMs = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(REAUTH_KEY) ?? 0);
    if (Number.isFinite(last) && nowMs - last < REAUTH_COOLDOWN_MS) return false;
    storage.setItem(REAUTH_KEY, String(nowMs));
    return true;
  } catch {
    return false;
  }
}
