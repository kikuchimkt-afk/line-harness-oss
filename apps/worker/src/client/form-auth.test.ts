import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let app: { innerHTML: string; querySelector: () => null };
let fetchMock: ReturnType<typeof vi.fn>;
let liffMock: { isLoggedIn: ReturnType<typeof vi.fn>; login: ReturnType<typeof vi.fn>; getIDToken: ReturnType<typeof vi.fn>; getProfile: ReturnType<typeof vi.fn>; isInClient: () => boolean };
let listeners: Map<string, (event: { preventDefault(): void }) => unknown>;
let formDefinition: Record<string, unknown>;
let linkStatus: number;

beforeEach(() => {
  vi.resetModules();
  app = { innerHTML: '', querySelector: () => null };
  listeners = new Map();
  const elements = new Map<string, Record<string, unknown>>();
  for (const id of ['liff-form', 'survey-form', 'nextBtn', 'submitBtn', 'form-page-1', 'form-page-2', 'closeBtn']) {
    elements.set(id, { hidden: false, disabled: false, textContent: '', addEventListener: (event: string, callback: (event: { preventDefault(): void }) => unknown) => listeners.set(`${id}:${event}`, callback) });
  }
  vi.stubGlobal('document', {
    getElementById: (id: string) => id === 'app' ? app : elements.get(id) ?? null,
    createElement: () => ({ textContent: '', style: {}, get innerHTML() { return this.textContent; } }),
    head: { appendChild: vi.fn() }, querySelector: () => null, querySelectorAll: () => [],
  });
  vi.stubGlobal('window', { location: { href: 'https://worker.example/?page=form&id=form-a', search: '?page=form&id=form-a' }, scrollTo: vi.fn() });
  vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() });
  liffMock = {
    isLoggedIn: vi.fn().mockReturnValue(true), login: vi.fn(), getIDToken: vi.fn().mockReturnValue('synthetic-id-token'),
    getProfile: vi.fn().mockResolvedValue({ userId: 'U_synthetic', displayName: '架空の保護者' }), isInClient: () => false,
  };
  vi.stubGlobal('liff', liffMock);
  formDefinition = { id: 'form-a', name: 'Synthetic', isActive: true, fields: [] };
  linkStatus = 200;
  fetchMock = vi.fn(async (path: string) => {
    if (path === '/api/forms/form-a') return new Response(JSON.stringify({ success: true, data: formDefinition }));
    if (path === '/api/liff/link') return new Response(JSON.stringify({ success: linkStatus === 200, data: { friendId: 'verified-friend' } }), { status: linkStatus });
    return new Response(JSON.stringify({ success: true }));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function flushFlow() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function headersFor(path: string) {
  const call = fetchMock.mock.calls.find((call) => call[0] === path);
  return new Headers(call?.[1]?.headers);
}

describe('LIFF form verified request headers', () => {
  it('requests LINE login before fetching or recording an unauthenticated form', async () => {
    liffMock.isLoggedIn.mockReturnValue(false);
    const { initForm } = await import('./form.js');
    await initForm('form-a');
    expect(liffMock.login).toHaveBeenCalledWith({ redirectUri: 'https://worker.example/?page=form&id=form-a' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('shows a login-specific message when the token is absent', async () => {
    liffMock.getIDToken.mockReturnValue(null);
    const { initForm } = await import('./form.js');
    await initForm('form-a');
    expect(app.innerHTML).toContain('ログイン情報を確認できません');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('stops rendering and open recording when the verified link returns block 403', async () => {
    linkStatus = 403;
    const { initForm } = await import('./form.js');
    await initForm('form-a');
    expect(app.innerHTML).toContain('現在、この機能はご利用いただけません');
    expect(fetchMock.mock.calls.some((call) => call[0].endsWith('/opened'))).toBe(false);
  });
  it('sends the token on open and submit but not the public definition GET', async () => {
    const { initForm } = await import('./form.js');
    await initForm('form-a');
    expect(headersFor('/api/forms/form-a/opened').get('Authorization')).toBe('Bearer synthetic-id-token');
    expect(headersFor('/api/forms/form-a').has('Authorization')).toBe(false);
    listeners.get('liff-form:submit')!({ preventDefault() {} });
    await flushFlow();
    expect(headersFor('/api/forms/form-a/submit').get('Authorization')).toBe('Bearer synthetic-id-token');
    expect(app.innerHTML).toContain('送信完了');
  });
  it('keeps the XHarness two-page partial-save path authenticated', async () => {
    formDefinition = { ...formDefinition, fields: [{ name: 'x_username', label: 'X ID', type: 'text' }], onSubmitWebhookUrl: 'https://synthetic-x.example/gate' };
    const { initForm } = await import('./form.js');
    await initForm('form-a');
    await listeners.get('survey-form:submit')!({ preventDefault() {} });
    expect(headersFor('/api/forms/form-a/partial').get('Authorization')).toBe('Bearer synthetic-id-token');
  });
});
