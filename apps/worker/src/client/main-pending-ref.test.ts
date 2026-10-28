import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./booking.js', () => ({ initBooking: vi.fn() }));
vi.mock('./form.js', () => ({ initForm: vi.fn() }));

let app: { innerHTML: string };
let retryClick: (() => void) | undefined;
let linkResponse: Promise<Response>;
let resolveLink: (response: Response) => void;
let rejectLink: (error: Error) => void;
let fetchMock: ReturnType<typeof vi.fn>;
let decodedToken: { sub: string; exp?: number } | null;
let session: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;

async function flushFlow() {
  // Drain the async init/config/profile/link JSON pipeline without real time.
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  app = { innerHTML: '' };
  retryClick = undefined;
  decodedToken = { sub: 'U_synthetic', exp: Math.floor(Date.now() / 1000) + 3600 };
  session = new Map();
  reload = vi.fn();
  linkResponse = new Promise<Response>((resolve, reject) => { resolveLink = resolve; rejectLink = reject; });
  vi.stubGlobal('window', { location: { search: '?liffId=synthetic-liff&ref=synthetic-flyer-ref',
    href: 'https://worker.example.com/?liffId=synthetic-liff&ref=synthetic-flyer-ref', pathname: '/', reload },
    sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v) } });
  vi.stubGlobal('document', {
    getElementById: (id: string) => id === 'app' ? app : {
      addEventListener: (_event: string, callback: () => void) => { if (id === 'retryEntryRefBtn') retryClick = callback; },
    },
    createElement: () => {
      const element = { textContent: '', get innerHTML() { return this.textContent; } };
      return element;
    },
    addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible',
  });
  vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() });
  vi.stubGlobal('liff', {
    init: vi.fn().mockResolvedValue(undefined), isLoggedIn: () => true,
    getProfile: vi.fn().mockResolvedValue({ userId: 'U_synthetic', displayName: '架空の保護者' }),
    getFriendship: vi.fn().mockResolvedValue({ friendFlag: false }),
    getIDToken: () => 'synthetic-id-token',
    getDecodedIDToken: () => decodedToken,
    isInClient: () => true,
    logout: vi.fn(),
  });
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/liff/config')) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { botBasicId: '@synthetic' } })));
    if (url === '/api/liff/link') return linkResponse;
    return Promise.resolve(new Response('{}'));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('campaign LIFF pre-follow UI', () => {
  it('waits for saved 202 pending attribution before showing the friend-add button', async () => {
    await import('./main.js');
    await flushFlow();
    expect(fetchMock).toHaveBeenCalledWith('/api/liff/link', expect.objectContaining({ method: 'POST' }));
    expect(app.innerHTML).not.toContain('友だち追加して始める');
    resolveLink(new Response(JSON.stringify({ success: true, data: { pendingAttribution: true, awaitingFriendship: true } }), { status: 202 }));
    await flushFlow();
    expect(app.innerHTML).toContain('友だち追加して始める');
    expect(app.innerHTML).not.toContain('登録完了');
  });

  it.each([400, 401, 500])('offers retry instead of friend-add or false completion after %s', async (status) => {
    await import('./main.js');
    resolveLink(new Response(JSON.stringify({ success: false }), { status }));
    await flushFlow();
    expect(app.innerHTML).toContain('もう一度確認する');
    expect(app.innerHTML).not.toContain('友だち追加して始める');
    expect(app.innerHTML).not.toContain('登録完了');
    expect(retryClick).toBeTypeOf('function');
  });

  it('offers retry after a network failure and can resume after successful save', async () => {
    await import('./main.js');
    rejectLink(new Error('synthetic network failure'));
    await flushFlow();
    expect(app.innerHTML).toContain('もう一度確認する');
    linkResponse = Promise.resolve(new Response(JSON.stringify({ success: true, data: { pendingAttribution: true } }), { status: 202 }));
    retryClick!();
    await flushFlow();
    expect(app.innerHTML).toContain('友だち追加して始める');
    expect(app.innerHTML).not.toContain('登録完了');
  });

  it('keeps a verified non-entry tracked-ref 404 friend-add flow working without inventing source attribution', async () => {
    await import('./main.js');
    resolveLink(new Response(JSON.stringify({ success: false, data: { entryRefRequired: false } }), { status: 404 }));
    await flushFlow();
    expect(app.innerHTML).toContain('友だち追加して始める');
    expect(app.innerHTML).not.toContain('登録完了');
  });

  it('does not interpret a false success payload with HTTP 200 as registration success', async () => {
    await import('./main.js');
    resolveLink(new Response(JSON.stringify({ success: false }), { status: 200 }));
    await flushFlow();
    expect(app.innerHTML).toContain('もう一度確認する');
    expect(app.innerHTML).not.toContain('登録完了');
    expect(app.innerHTML).not.toContain('友だち追加して始める');
  });

  it.each([true, false])('stops on server-authoritative blocking rather than showing completion/retry/add-friend (ref=%s)', async (withRef) => {
    if (!withRef) {
      window.location.search = '?liffId=synthetic-liff';
      window.location.href = 'https://worker.example.com/?liffId=synthetic-liff';
    }
    await import('./main.js');
    resolveLink(new Response(JSON.stringify({ success: false, code: 'FRIEND_BLOCKED' }), { status: 403 }));
    await flushFlow();
    expect(app.innerHTML).toContain('現在、この機能はご利用いただけません。');
    expect(app.innerHTML).not.toContain('登録完了');
    expect(app.innerHTML).not.toContain('もう一度確認する');
    expect(app.innerHTML).not.toContain('友だち追加して始める');
  });
});

describe('expired LIFF login', () => {
  it('re-logs in once by reloading, without calling the API with the expired token', async () => {
    decodedToken = { sub: 'U_synthetic', exp: Math.floor(Date.now() / 1000) - 60 };
    await import('./main.js');
    await flushFlow();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/liff/link', expect.anything());
  });

  it('does not reload again right after a re-login (no reload loop) and continues normally', async () => {
    decodedToken = { sub: 'U_synthetic', exp: Math.floor(Date.now() / 1000) - 60 };
    session.set('lh_liff_reauth_at', String(Date.now() - 10_000));
    await import('./main.js');
    await flushFlow();
    expect(reload).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/liff/link', expect.objectContaining({ method: 'POST' }));
  });
});
