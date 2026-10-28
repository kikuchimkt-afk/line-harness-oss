import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./booking.js', () => ({ initBooking: vi.fn() }));
vi.mock('./form.js', () => ({ initForm: vi.fn() }));

let app: { innerHTML: string };
let retryClick: (() => void) | undefined;
let linkResponse: Promise<Response>;
let resolveLink: (response: Response) => void;
let rejectLink: (error: Error) => void;
let fetchMock: ReturnType<typeof vi.fn>;

async function flushFlow() {
  // Drain the async init/config/profile/link JSON pipeline without real time.
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  app = { innerHTML: '' };
  retryClick = undefined;
  linkResponse = new Promise<Response>((resolve, reject) => { resolveLink = resolve; rejectLink = reject; });
  vi.stubGlobal('window', { location: { search: '?liffId=synthetic-liff&ref=synthetic-flyer-ref',
    href: 'https://worker.example.com/?liffId=synthetic-liff&ref=synthetic-flyer-ref', pathname: '/' } });
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
});
