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
