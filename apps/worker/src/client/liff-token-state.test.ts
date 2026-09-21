import { describe, expect, it } from 'vitest';
import { isExpiredLiffIdToken } from './liff-token-state.js';

describe('isExpiredLiffIdToken', () => {
  const now = Date.parse('2026-09-22T00:00:00.000Z');

  it('treats an expired or nearly expired token as expired', () => {
    expect(isExpiredLiffIdToken({ exp: now / 1000 - 1 }, now)).toBe(true);
    expect(isExpiredLiffIdToken({ exp: now / 1000 + 20 }, now)).toBe(true);
  });

  it('keeps a token with useful remaining lifetime', () => {
    expect(isExpiredLiffIdToken({ exp: now / 1000 + 31 }, now)).toBe(false);
  });

  it('does not invent expiry when LINE omits exp', () => {
    expect(isExpiredLiffIdToken(null, now)).toBe(false);
    expect(isExpiredLiffIdToken({}, now)).toBe(false);
  });
});
