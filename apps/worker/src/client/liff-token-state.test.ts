import { describe, expect, it } from 'vitest';
import { isExpiredLiffIdToken, shouldStartReauthentication } from './liff-token-state.js';

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

describe('shouldStartReauthentication', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('allows one re-login, then refuses another within two minutes (no reload loop)', () => {
    const s = memory();
    const t = Date.parse('2026-10-28T12:00:00Z');
    expect(shouldStartReauthentication(s, t)).toBe(true);
    expect(shouldStartReauthentication(s, t + 5_000)).toBe(false);
    expect(shouldStartReauthentication(s, t + 119_000)).toBe(false);
    expect(shouldStartReauthentication(s, t + 121_000)).toBe(true);
  });

  it('never reloads when storage is missing or throws', () => {
    expect(shouldStartReauthentication(null)).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(shouldStartReauthentication(broken)).toBe(false);
  });
});
