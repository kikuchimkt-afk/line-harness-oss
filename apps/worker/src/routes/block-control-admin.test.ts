import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const mocks = vi.hoisted(() => ({
  updateTag: vi.fn(), deleteTag: vi.fn(), getLineAccountById: vi.fn(),
  getFriendById: vi.fn(), getRichMenuGroupWithPages: vi.fn(),
  createRichMenuGroup: vi.fn(), acquirePublishLock: vi.fn(),
  unlinkRichMenuFromUser: vi.fn(), deleteRichMenu: vi.fn(),
  setDefaultRichMenu: vi.fn(), uploadRichMenuImage: vi.fn(),
}));
vi.mock('@line-crm/db', async (importOriginal) => ({
  ...await importOriginal<object>(),
  updateTag: mocks.updateTag, deleteTag: mocks.deleteTag,
  getLineAccountById: mocks.getLineAccountById,
  getFriendById: mocks.getFriendById,
  getRichMenuGroupWithPages: mocks.getRichMenuGroupWithPages,
  createRichMenuGroup: mocks.createRichMenuGroup,
  acquirePublishLock: mocks.acquirePublishLock,
}));
vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => ({
    unlinkRichMenuFromUser: mocks.unlinkRichMenuFromUser,
    deleteRichMenu: mocks.deleteRichMenu,
    setDefaultRichMenu: mocks.setDefaultRichMenu,
    uploadRichMenuImage: mocks.uploadRichMenuImage,
  })),
}));
const { tags } = await import('./tags.js');
const { profileRefresh } = await import('./profile-refresh.js');
const { richMenuGroups } = await import('./rich-menu-groups.js');
const { richMenus } = await import('./rich-menus.js');

let currentTag: string | null;
let blocked: boolean;
let writes: string[];
let queries: string[];
let fetchSpy: ReturnType<typeof vi.fn>;
const blank = 'richmenu-synthetic-blank';
const ordinary = 'richmenu-synthetic-ordinary';
const friend = { id: 'synthetic-friend', line_user_id: 'U_synthetic', line_account_id: 'synthetic-account' };
function database(): D1Database {
  return { prepare(query: string) {
    queries.push(query);
    let values: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) { values = args; return statement; },
      async first() {
        if (query.includes('SELECT name FROM tags')) return currentTag === null ? null : { name: currentTag };
        if (query.includes('blocked_dedicated_rich_menu_id')) return values[0] === blank ? { present: 1 } : null;
        return null;
      },
      async all() { return { results: query.includes('JOIN friend_tags') && blocked ? [{ name: 'ブロック' }] : [] }; },
      async run() { writes.push(query); return { meta: { changes: 1 } }; },
    };
    return statement;
  }, batch: async () => [] } as unknown as D1Database;
}
function appFor(route: Hono<any>): Hono<any> {
  const app = new Hono<any>();
  app.route('/', route);
  return app;
}
function request(route: Hono<any>, path: string, method: string, body?: unknown) {
  return appFor(route).request(path, {
    method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  }, { DB: database(), LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-token' });
}
function group(menu = blank) {
  return { id: 'synthetic-group', account_id: friend.line_account_id, name: 'test',
    status: 'published', publishing_at: null, default_page_id: 'page', is_default_for_all: 0,
    pages: [{ id: 'page', line_richmenu_id: menu, order_index: 0, areas: [] }] };
}
beforeEach(() => {
  vi.clearAllMocks();
  currentTag = 'ブロック'; blocked = true; writes = []; queries = [];
  mocks.getLineAccountById.mockResolvedValue({ id: friend.line_account_id, channel_access_token: 'synthetic-token' });
  mocks.getFriendById.mockResolvedValue(friend);
  mocks.getRichMenuGroupWithPages.mockResolvedValue(group());
  mocks.updateTag.mockImplementation(async (_db, id, input) => ({ id, name: input.name ?? currentTag, color: input.color ?? '#64748B' }));
  fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe('reserved block tag administration', () => {
  it.each(['別の名前', 'ﾌﾞﾛｯｸ'])('refuses renaming the control tag to %s', async name => {
    const res = await request(tags, '/api/tags/control-tag', 'PUT', { name });
    expect(res.status).toBe(403);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
  it('refuses turning an ordinary tag into the control tag', async () => {
    currentTag = '普通のタグ';
    const res = await request(tags, '/api/tags/ordinary-tag', 'PUT', { name: ' ﾌﾞﾛｯｸ ' });
    expect(res.status).toBe(403);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
  it.each(['ブロック', ' ﾌﾞﾛｯｸ '])('refuses deleting the %s control tag', async name => {
    currentTag = name;
    const res = await request(tags, '/api/tags/control-tag', 'DELETE');
    expect(res.status).toBe(403);
    expect(mocks.deleteTag).not.toHaveBeenCalled();
  });
  it.each([{ color: '#112233' }, { name: 'ブロック', color: '#112233' }])('keeps control-tag color updates available', async body => {
    const res = await request(tags, '/api/tags/control-tag', 'PUT', body);
    expect(res.status).toBe(200);
    expect(mocks.updateTag).toHaveBeenCalledOnce();
  });
  it('keeps ordinary tag rename/delete available', async () => {
    currentTag = '普通のタグ';
    expect((await request(tags, '/api/tags/ordinary-tag', 'PUT', { name: '別の通常タグ' })).status).toBe(200);
    expect((await request(tags, '/api/tags/ordinary-tag', 'DELETE')).status).toBe(200);
    expect(mocks.updateTag).toHaveBeenCalledOnce();
    expect(mocks.deleteTag).toHaveBeenCalledOnce();
  });
  it('returns 404 instead of mutating a missing tag', async () => {
    currentTag = null;
    expect((await request(tags, '/api/tags/missing', 'PUT', { name: '通常' })).status).toBe(404);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
  it.each(['ブロック', ' ﾌﾞﾛｯｸ '])('refuses the content-dedup bulk cleanup of %s', async tagName => {
    const res = await request(profileRefresh, '/api/admin/tag-remove-content-dups', 'POST', { tagName, contentSubstring: '' });
    expect(res.status).toBe(403);
    expect(queries).toEqual([]);
    expect(writes).toEqual([]);
  });
  it('keeps ordinary content-dedup tag cleanup available', async () => {
    const res = await request(profileRefresh, '/api/admin/tag-remove-content-dups', 'POST', { tagName: '通常', contentSubstring: '案内' });
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
  });
});

describe('dedicated blank menu administration', () => {
  it.each([
    ['DELETE', `/api/rich-menu-groups/external/${blank}?accountId=synthetic-account`],
    ['POST', `/api/rich-menu-groups/import?accountId=synthetic-account&richMenuId=${blank}`],
    ['DELETE', `/api/rich-menus/${blank}`],
    ['POST', `/api/rich-menus/${blank}/default`],
    ['POST', `/api/rich-menus/${blank}/image`],
  ])('refuses %s %s before contacting LINE', async (method, path) => {
    const route = path.startsWith('/api/rich-menu-groups') ? richMenuGroups : richMenus;
    const res = await request(route, path, method, { imageData: 'aGVsbG8=' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('BLOCK_MENU_PROTECTED');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.createRichMenuGroup).not.toHaveBeenCalled();
    expect(mocks.deleteRichMenu).not.toHaveBeenCalled();
    expect(mocks.setDefaultRichMenu).not.toHaveBeenCalled();
    expect(mocks.uploadRichMenuImage).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it.each(['publish', 'unpublish'])('refuses %s for a legacy group referencing the blank menu', async action => {
    const res = await request(richMenuGroups, `/api/rich-menu-groups/synthetic-group/${action}`, 'POST');
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.acquirePublishLock).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it.each(['bulk-link', 'set-default'])('refuses applying blank-menu group using %s', async mode => {
    const res = await request(richMenuGroups, '/api/rich-menu-groups/synthetic-group/apply-to-tag', 'POST', { mode });
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it('keeps external ordinary menu deletion available', async () => {
    const res = await request(richMenuGroups, `/api/rich-menu-groups/external/${ordinary}?accountId=synthetic-account`, 'DELETE');
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][1].method).toBe('DELETE');
  });
  it('keeps setting an ordinary group as default available', async () => {
    mocks.getRichMenuGroupWithPages.mockResolvedValue(group(ordinary));
    const res = await request(richMenuGroups, '/api/rich-menu-groups/synthetic-group/apply-to-tag', 'POST', { mode: 'set-default' });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
  it('blocked individual unlink leaves desired state and LINE unchanged', async () => {
    const res = await request(richMenus, `/api/friends/${friend.id}/rich-menu`, 'DELETE');
    expect(res.status).toBe(403);
    expect(mocks.unlinkRichMenuFromUser).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it('ordinary individual unlink still clears desired assignment and unlinks LINE', async () => {
    blocked = false;
    const res = await request(richMenus, `/api/friends/${friend.id}/rich-menu`, 'DELETE');
    expect(res.status).toBe(200);
    expect(mocks.unlinkRichMenuFromUser).toHaveBeenCalledWith(friend.line_user_id);
    expect(writes).toEqual(['DELETE FROM rich_menu_assignments WHERE friend_id = ?']);
  });
});
