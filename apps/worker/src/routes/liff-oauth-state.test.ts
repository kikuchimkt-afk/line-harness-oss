import { describe, expect, it, vi } from 'vitest';

vi.mock('@line-crm/db', () => ({
  getEntryRouteByRefCode: vi.fn().mockResolvedValue(null),
  getLineAccountByChannelId: vi.fn().mockResolvedValue(null),
  getTrafficPoolBySlug: vi.fn().mockResolvedValue(null),
  getTrafficPoolById: vi.fn().mockResolvedValue(null),
  getRandomPoolAccount: vi.fn().mockResolvedValue(null),
  getPoolAccounts: vi.fn().mockResolvedValue([]),
  jstNow: vi.fn(() => '2026-10-28T12:00:00.000+09:00'),
}));
const { liffRoutes } = await import('./liff.js');

const db = { prepare() {
  const s = { bind: () => s, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) };
  return s;
} } as unknown as D1Database;

describe('LINE login state with multibyte campaign parameters', () => {
  it('redirects to LINE Login instead of failing when utm_campaign is Japanese', async () => {
    const res = await liffRoutes.request(
      'https://worker.example.com/auth/line?ref=winter-flyer&account=login-a&utm_campaign=' + encodeURIComponent('冬期講習2026'),
      { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' } },
      { DB: db, LINE_LOGIN_CHANNEL_ID: 'login-a', LIFF_URL: 'https://liff.line.me/1-abc', WORKER_URL: 'https://worker.example.com' },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.host).toBe('access.line.me');
    const state = location.searchParams.get('state')!;
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(state), (ch) => ch.charCodeAt(0)));
    expect(JSON.parse(decoded)).toMatchObject({ ref: 'winter-flyer', utmCampaign: '冬期講習2026' });
  });
});
