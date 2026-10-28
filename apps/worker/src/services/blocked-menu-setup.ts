/** Account-scoped, idempotent neutral-menu provisioning. No messages, default-menu or user-link writes. */
export const BLOCKED_MENU_SETTING = 'blocked_dedicated_rich_menu_id';
export const BLOCKED_MENU_SETUP_STATE = 'blocked_menu_setup_state';
export const BLOCKED_MENU_SPEC = {
  size: { width: 800, height: 250 }, selected: false,
  name: 'LINEHarness | blocked neutral v1', chatBarText: 'メニュー', areas: [],
};
const WHITE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAyAAAAD6CAIAAADWX7TrAAAEgUlEQVR4nO3WQQkAMAzAwPo3vZoIDMqdgjwzDwCA1PwOAAC4xmABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAzGABAMQMFgBAbAHgWCEST7ECYgAAAABJRU5ErkJggg==';
export function blockedMenuImage(): Uint8Array {
  return Uint8Array.from(atob(WHITE_PNG_BASE64), (value) => value.charCodeAt(0));
}
export interface BlockedMenuSetupResult {
  status: 'ready' | 'pending' | 'retry_wait' | 'inactive';
  richMenuId?: string;
  code?: string;
}
interface Account { id: string; is_active: number; channel_access_token: string }
interface SetupState {
  status: 'processing' | 'ready' | 'retry_wait'; attempts: number; tokenFingerprint: string;
  leaseId?: string; leaseUntil?: number; nextAttemptAt?: number; lastAttemptAt?: number;
  verifiedAt?: number; candidateMenuId?: string; code?: string;
}
interface Menu {
  richMenuId: string; name: string; selected: boolean; chatBarText: string;
  size: { width: number; height: number }; areas: unknown[];
}
const LEASE_MS = 180_000;
const RECHECK_MS = 24 * 60 * 60_000;
const RETRY_MINUTES = [5, 15, 60, 360];
const menuIdValid = (id: unknown): id is string => typeof id === 'string' && /^richmenu-[a-f0-9]{32}$/.test(id);
function parseState(raw: string | null | undefined): SetupState | null {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as SetupState;
    return ['processing', 'ready', 'retry_wait'].includes(state.status) && Number.isSafeInteger(state.attempts) && state.attempts >= 0
      && typeof state.tokenFingerprint === 'string' ? state : null;
  } catch { return null; }
}
async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
const tokenFingerprint = (token: string) => digest(new TextEncoder().encode(token));
const iso = (now: number) => new Date(now).toISOString();
function ownedMenu(menu: Menu | undefined): menu is Menu {
  return Boolean(menu && menuIdValid(menu.richMenuId) && menu.name === BLOCKED_MENU_SPEC.name
    && menu.size?.width === 800 && menu.size?.height === 250 && menu.selected === false
    && menu.chatBarText === BLOCKED_MENU_SPEC.chatBarText && Array.isArray(menu.areas) && menu.areas.length === 0);
}
class SetupFailure extends Error {
  constructor(readonly code: string) { super(code); }
}
async function getSetting(db: D1Database, accountId: string, key: string): Promise<string | null> {
  return (await db.prepare('SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?')
    .bind(accountId, key).first<{ value: string }>())?.value ?? null;
}
function isDue(state: SetupState | null, fingerprint: string, menu: string | null, now: number): boolean {
  if (state?.status === 'processing' && (state.leaseUntil ?? 0) > now) return false;
  if (!state || state.tokenFingerprint !== fingerprint) return true;
  if (state.status === 'ready') return !menuIdValid(menu) || menu !== state.candidateMenuId || (state.verifiedAt ?? 0) + RECHECK_MS <= now;
  return (state.nextAttemptAt ?? 0) <= now;
}

export async function ensureBlockedMenuForAccount(
  db: D1Database, accountId: string, options: { now?: Date; force?: boolean } = {},
): Promise<BlockedMenuSetupResult> {
  const now = (options.now ?? new Date()).getTime();
  const account = await db.prepare('SELECT id, is_active, channel_access_token FROM line_accounts WHERE id = ?')
    .bind(accountId).first<Account>();
  if (!account || account.is_active !== 1) return { status: 'inactive' };
  const token = account.channel_access_token || '';
  const fingerprint = await tokenFingerprint(token);
  const existingMenu = await getSetting(db, accountId, BLOCKED_MENU_SETTING);
  let previousRaw = await getSetting(db, accountId, BLOCKED_MENU_SETUP_STATE);
  let previous = parseState(previousRaw);
  // A new token cannot steal an in-flight lease; the next request or Cron retries it.
  if (previous?.status === 'processing' && (previous.leaseUntil ?? 0) > now) return { status: 'pending', code: 'SETUP_IN_PROGRESS' };
  if (!options.force && !isDue(previous, fingerprint, existingMenu, now)) {
    return previous?.status === 'ready'
      ? { status: 'ready', richMenuId: existingMenu! }
      : { status: 'retry_wait', code: previous?.code };
  }
  let state: SetupState = {
    status: 'processing', tokenFingerprint: fingerprint,
    attempts: previous?.tokenFingerprint === fingerprint ? Math.max(0, previous.attempts) + 1 : 1,
    leaseId: crypto.randomUUID(), leaseUntil: now + LEASE_MS, lastAttemptAt: now,
    candidateMenuId: previous?.tokenFingerprint === fingerprint ? previous.candidateMenuId : undefined,
  };
  let leaseRaw = JSON.stringify(state);
  if (previousRaw === null) {
    const inserted = await db.prepare(`INSERT INTO account_settings (id,line_account_id,key,value,created_at,updated_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(line_account_id,key) DO NOTHING`)
      .bind(crypto.randomUUID(), accountId, BLOCKED_MENU_SETUP_STATE, leaseRaw, iso(now), iso(now)).run();
    if (!inserted.meta?.changes) return { status: 'pending', code: 'SETUP_IN_PROGRESS' };
  } else {
    const claimed = await db.prepare(`UPDATE account_settings SET value = ?, updated_at = ?
      WHERE line_account_id = ? AND key = ? AND value = ?`)
      .bind(leaseRaw, iso(now), accountId, BLOCKED_MENU_SETUP_STATE, previousRaw).run();
    if (!claimed.meta?.changes) return { status: 'pending', code: 'SETUP_IN_PROGRESS' };
  }
  async function checkpoint(candidateMenuId: string) {
    const updated = { ...state, candidateMenuId };
    const nextRaw = JSON.stringify(updated);
    const result = await db.prepare(`UPDATE account_settings SET value = ?, updated_at = ?
      WHERE line_account_id = ? AND key = ? AND value = ?`)
      .bind(nextRaw, iso(now), accountId, BLOCKED_MENU_SETUP_STATE, leaseRaw).run();
    if (!result.meta?.changes) throw new SetupFailure('SETUP_LEASE_LOST');
    state = updated; leaseRaw = nextRaw;
  }
  async function request(method: 'GET' | 'POST', pathname: string, body?: unknown): Promise<Response> {
    // Fixed LINE API destinations. A menu ID from a response cannot become an arbitrary URL.
    if (!/^\/v2\/bot\/(?:user\/all\/richmenu|richmenu(?:\/list|\/validate|\/richmenu-[a-f0-9]{32}(?:\/content)?)?)$/.test(pathname)) {
      throw new SetupFailure('INVALID_RESOURCE_PATH');
    }
    if (method === 'POST' && ![ '/v2/bot/richmenu', '/v2/bot/richmenu/validate' ].includes(pathname)
      && !/^\/v2\/bot\/richmenu\/richmenu-[a-f0-9]{32}\/content$/.test(pathname)) throw new SetupFailure('UNSAFE_RESOURCE_WRITE');
    if (!token) throw new SetupFailure('TOKEN_MISSING');
    const content = pathname.endsWith('/content');
    try {
      const response = await fetch((content ? 'https://api-data.line.me' : 'https://api.line.me') + pathname, {
        method, redirect: 'error', signal: AbortSignal.timeout(8_000),
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': content ? 'image/png' : 'application/json' }) },
        body: body === undefined ? undefined : content ? body as BodyInit : JSON.stringify(body),
      });
      if (!response.ok && response.status !== 404) throw new SetupFailure(`LINE_HTTP_${response.status}`);
      return response;
    } catch (error) {
      if (error instanceof SetupFailure) throw error;
      throw new SetupFailure('LINE_NETWORK_ERROR');
    }
  }
  async function readJson<T>(response: Response): Promise<T> {
    try { return await response.json() as T; }
    catch { throw new SetupFailure('INVALID_LINE_RESPONSE'); }
  }
  async function currentDefault(): Promise<string | null> {
    const response = await request('GET', '/v2/bot/user/all/richmenu');
    if (response.status === 404) return null;
    const id = (await readJson<{ richMenuId: string }>(response)).richMenuId;
    if (!menuIdValid(id)) throw new SetupFailure('INVALID_LINE_RESPONSE');
    return id;
  }
  try {
    const defaultBefore = await currentDefault();
    let menu: Menu | undefined;
    const possible = existingMenu || state.candidateMenuId;
    if (menuIdValid(possible)) {
      const response = await request('GET', '/v2/bot/richmenu/' + possible);
      if (response.ok) {
        const found = await readJson<Menu>(response);
        if (ownedMenu(found) && found.richMenuId !== defaultBefore) menu = found;
      }
    }
    if (!menu) {
      const response = await request('GET', '/v2/bot/richmenu/list');
      if (!response.ok) throw new SetupFailure('INVALID_LINE_RESPONSE');
      const listing = await readJson<{ richmenus?: Menu[] }>(response);
      if (!Array.isArray(listing.richmenus)) throw new SetupFailure('INVALID_LINE_RESPONSE');
      menu = listing.richmenus.filter(ownedMenu).filter(m => m.richMenuId !== defaultBefore)
        .sort((a,b) => a.richMenuId.localeCompare(b.richMenuId))[0];
    }
    if (!menu) {
      const validation = await request('POST', '/v2/bot/richmenu/validate', BLOCKED_MENU_SPEC);
      if (!validation.ok) throw new SetupFailure('MENU_VALIDATION_FAILED');
      const response = await request('POST', '/v2/bot/richmenu', BLOCKED_MENU_SPEC);
      if (!response.ok) throw new SetupFailure('MENU_CREATE_FAILED');
      const created = await readJson<{ richMenuId: string }>(response);
      if (!menuIdValid(created.richMenuId)) throw new SetupFailure('INVALID_LINE_RESPONSE');
      menu = { ...BLOCKED_MENU_SPEC, richMenuId: created.richMenuId };
    }
    await checkpoint(menu.richMenuId);
    const expectedImage = blockedMenuImage();
    const expectedImageDigest = await digest(expectedImage);
    const image = await request('GET', '/v2/bot/richmenu/' + menu.richMenuId + '/content');
    if (!image.ok || await digest(new Uint8Array(await image.arrayBuffer())) !== expectedImageDigest) {
      const immediatelyBeforeUpload = await currentDefault();
      if (immediatelyBeforeUpload !== defaultBefore || immediatelyBeforeUpload === menu.richMenuId) throw new SetupFailure('DEFAULT_MENU_CHANGED');
      const upload = await request('POST', '/v2/bot/richmenu/' + menu.richMenuId + '/content', expectedImage);
      if (!upload.ok) throw new SetupFailure('IMAGE_UPLOAD_FAILED');
      // A successful upload response is not our ready-state proof: read back
      // the saved bytes from the same account/resource before publishing it.
      const savedImage = await request('GET', '/v2/bot/richmenu/' + menu.richMenuId + '/content');
      if (!savedImage.ok || await digest(new Uint8Array(await savedImage.arrayBuffer())) !== expectedImageDigest) {
        throw new SetupFailure('IMAGE_VERIFICATION_FAILED');
      }
    }
    const detail = await request('GET', '/v2/bot/richmenu/' + menu.richMenuId);
    const checkedMenu = detail.ok ? await readJson<Menu>(detail) : undefined;
    if (!ownedMenu(checkedMenu) || checkedMenu.richMenuId !== menu.richMenuId) throw new SetupFailure('MENU_VERIFICATION_FAILED');
    if (await currentDefault() !== defaultBefore) throw new SetupFailure('DEFAULT_MENU_CHANGED');
    const ready: SetupState = { status: 'ready', attempts: state.attempts, tokenFingerprint: fingerprint,
      candidateMenuId: menu.richMenuId, lastAttemptAt: now, verifiedAt: now };
    // Both writes require the lease and the same active account/token snapshot.
    // A concurrent token update or expired-lease owner cannot commit a menu for another bot.
    const result = await db.batch([
      db.prepare(`INSERT INTO account_settings (id,line_account_id,key,value,created_at,updated_at)
        SELECT ?,a.id,?,?,?,? FROM line_accounts a WHERE a.id = ? AND a.is_active = 1 AND a.channel_access_token = ?
        AND EXISTS (SELECT 1 FROM account_settings s WHERE s.line_account_id = a.id AND s.key = ? AND s.value = ?)
        ON CONFLICT(line_account_id,key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(crypto.randomUUID(), BLOCKED_MENU_SETTING, menu.richMenuId, iso(now), iso(now), accountId, token, BLOCKED_MENU_SETUP_STATE, leaseRaw),
      db.prepare(`UPDATE account_settings SET value = ?, updated_at = ? WHERE line_account_id = ? AND key = ? AND value = ?
        AND EXISTS (SELECT 1 FROM line_accounts a WHERE a.id = ? AND a.is_active = 1 AND a.channel_access_token = ?)`)
        .bind(JSON.stringify(ready), iso(now), accountId, BLOCKED_MENU_SETUP_STATE, leaseRaw, accountId, token),
    ]);
    if (!result.every(row => (row.meta?.changes ?? 0) > 0)) throw new SetupFailure('SETUP_ACCOUNT_CHANGED');
    return { status: 'ready', richMenuId: menu.richMenuId };
  } catch (error) {
    const code = error instanceof SetupFailure ? error.code : 'SETUP_FAILED';
    const failed: SetupState = { status: 'retry_wait', attempts: state.attempts, tokenFingerprint: fingerprint,
      lastAttemptAt: now, nextAttemptAt: now + RETRY_MINUTES[Math.min(state.attempts - 1, RETRY_MINUTES.length - 1)] * 60_000,
      candidateMenuId: state.candidateMenuId, code };
    await db.prepare(`UPDATE account_settings SET value = ?, updated_at = ? WHERE line_account_id = ? AND key = ? AND value = ?`)
      .bind(JSON.stringify(failed), iso(now), accountId, BLOCKED_MENU_SETUP_STATE, leaseRaw).run();
    return { status: code === 'SETUP_LEASE_LOST' ? 'pending' : 'retry_wait', code };
  }
}

/** One new/retry account per tick by default; ready accounts incur no LINE calls until their daily recheck. */
export async function processDueBlockedMenuSetups(
  db: D1Database, options: { now?: Date; limit?: number } = {},
): Promise<{ readyAccountIds: string[]; attempted: number; ready: number; deferred: number; failed: number }> {
  const now = options.now ?? new Date();
  const limit = Math.min(3, Math.max(1, options.limit ?? 1));
  const rows = await db.prepare(`SELECT a.id,a.channel_access_token,s.value AS setup_state,m.value AS menu_id FROM line_accounts a
    LEFT JOIN account_settings s ON s.line_account_id = a.id AND s.key = ?
    LEFT JOIN account_settings m ON m.line_account_id = a.id AND m.key = ? WHERE a.is_active = 1 ORDER BY a.id`)
    .bind(BLOCKED_MENU_SETUP_STATE, BLOCKED_MENU_SETTING).all<{ id: string; channel_access_token: string; setup_state: string | null; menu_id: string | null }>();
  const candidates: Array<{ id: string; previous: number }> = [];
  const result = { readyAccountIds: [] as string[], attempted: 0, ready: 0, deferred: 0, failed: 0 };
  for (const row of rows.results) {
    const state = parseState(row.setup_state), fingerprint = await tokenFingerprint(row.channel_access_token || '');
    if (isDue(state, fingerprint, row.menu_id, now.getTime())) candidates.push({ id: row.id, previous: state?.lastAttemptAt ?? 0 });
    else if (state?.status === 'ready') result.readyAccountIds.push(row.id);
  }
  candidates.sort((a,b) => a.previous - b.previous || a.id.localeCompare(b.id));
  for (const candidate of candidates.slice(0, limit)) {
    result.attempted += 1;
    try {
      const item = await ensureBlockedMenuForAccount(db, candidate.id, { now });
      if (item.status === 'ready') { result.ready += 1; result.readyAccountIds.push(candidate.id); }
      else if (item.status === 'retry_wait') result.failed += 1;
      else result.deferred += 1;
    } catch { result.failed += 1; }
  }
  return result;
}
