import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Real SQLite with the production bootstrap schema; only the queue call that
// reaches LINE (applyDesiredRichMenu) is stubbed.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const bootstrap = readFileSync(fileURLToPath(new URL('../../../../packages/db/bootstrap.sql', import.meta.url)), 'utf8');

const applyDesiredRichMenu = vi.hoisted(() => vi.fn());
vi.mock('./rich-menu-assignment.js', () => ({
  applyDesiredRichMenu,
  DEFAULT_RICH_MENU_ID: '__lineharness_account_default__',
}));

const svc = await import('./rich-menu-tag-binding.js');

type Params = import('node:sqlite').SQLInputValue[];
function d1(sqlite: InstanceType<typeof DatabaseSync>): D1Database {
  const statement = (sql: string, params: Params = []) => ({
    bind: (...next: unknown[]) => statement(sql, next as Params),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ success: true, meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1Database;
const run = (sql: string, ...p: Params) => sqlite.prepare(sql).run(...p);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(bootstrap);
  db = d1(sqlite);
  run(`INSERT INTO line_accounts (id, channel_id, name, channel_access_token, channel_secret) VALUES ('acc', 'ch', 'A', 'acc-token', 's')`);
  run(`INSERT INTO friends (id, line_user_id, display_name, is_following, line_account_id) VALUES ('f1', 'U1', 'P', 1, 'acc')`);
  for (const [id, name] of [['contest', '大会申込'], ['lp', '大会LP経由'], ['block', 'ブロック']]) run(`INSERT INTO tags (id, name) VALUES (?, ?)`, id, name);
  for (const [g, page, menu] of [['g-contest', 'p1', 'rm-contest'], ['g-lp', 'p2', 'rm-lp']]) {
    run(`INSERT INTO rich_menu_groups (id, account_id, name, chat_bar_text, size, status, default_page_id) VALUES (?, 'acc', ?, 'menu', 'large', 'published', ?)`, g, g, page);
    run(`INSERT INTO rich_menu_pages (id, group_id, order_index, name, alias_id, line_richmenu_id) VALUES (?, ?, 0, 'main', ?, ?)`, page, g, `${page}-alias`, menu);
  }
  run(`INSERT INTO tag_rich_menu_bindings (account_id, tag_id, rich_menu_group_id) VALUES ('acc', 'contest', 'g-contest'), ('acc', 'lp', 'g-lp')`);
});

const tag = (tagId: string, at: string) => run(`INSERT INTO friend_tags (friend_id, tag_id, assigned_at) VALUES ('f1', ?, ?)`, tagId, at);
const desired = (menu: string) => run(`INSERT INTO rich_menu_assignments (friend_id, line_account_id, desired_rich_menu_id, status) VALUES ('f1', 'acc', ?, 'applied')`, menu);
const appliedMenu = () => applyDesiredRichMenu.mock.calls.map((c) => c[1].richMenuId);

describe('applyTagRichMenuForFriend', () => {
  it('queues the published default page of the bound group through the durable queue', async () => {
    tag('contest', '2026-10-20T10:00:00.000+09:00');
    await expect(svc.applyTagRichMenuForFriend(db, 'f1', 'contest')).resolves.toEqual({ applied: true, richMenuId: 'rm-contest' });
    expect(applyDesiredRichMenu).toHaveBeenCalledWith(db, expect.objectContaining({
      friendId: 'f1', richMenuId: 'rm-contest', lineAccessToken: 'acc-token', lineAccountId: 'acc', source: 'automation',
    }));
  });

  it('does nothing for a blocked or unfollowed friend', async () => {
    tag('block', '2026-10-20T09:00:00.000+09:00');
    expect((await svc.applyTagRichMenuForFriend(db, 'f1', 'contest')).applied).toBe(false);
    run(`DELETE FROM friend_tags`);
    run(`UPDATE friends SET is_following = 0`);
    expect((await svc.applyTagRichMenuForFriend(db, 'f1', 'contest')).applied).toBe(false);
    expect(applyDesiredRichMenu).not.toHaveBeenCalled();
  });

  it('ignores unbound tags, inactive bindings and unpublished groups', async () => {
    expect((await svc.applyTagRichMenuForFriend(db, 'f1', 'block')).applied).toBe(false);
    run(`UPDATE tag_rich_menu_bindings SET is_active = 0 WHERE tag_id = 'lp'`);
    expect((await svc.applyTagRichMenuForFriend(db, 'f1', 'lp')).applied).toBe(false);
    run(`UPDATE rich_menu_groups SET status = 'draft' WHERE id = 'g-contest'`);
    expect((await svc.applyTagRichMenuForFriend(db, 'f1', 'contest')).applied).toBe(false);
    expect(applyDesiredRichMenu).not.toHaveBeenCalled();
  });

  it('never hands out the dedicated blocked-friend menu', async () => {
    run(`INSERT INTO account_settings (line_account_id, key, value) VALUES ('acc', 'blocked_dedicated_rich_menu_id', 'rm-contest')`);
    expect((await svc.applyTagRichMenuForFriend(db, 'f1', 'contest')).applied).toBe(false);
    expect(applyDesiredRichMenu).not.toHaveBeenCalled();
  });
});

describe('preferred binding and removal', () => {
  it('re-follow applies the most recently assigned bound tag', async () => {
    tag('contest', '2026-10-20T10:00:00.000+09:00');
    tag('lp', '2026-10-21T10:00:00.000+09:00');
    await svc.applyPreferredTagRichMenu(db, 'f1');
    expect(appliedMenu()).toEqual(['rm-lp']);
  });

  it('removing the tag that owns the current menu falls back to the next bound tag, then the default', async () => {
    tag('contest', '2026-10-20T10:00:00.000+09:00');
    desired('rm-lp');
    // the 'lp' tag itself was already removed from friend_tags by the caller
    await expect(svc.reconcileTagRichMenuAfterRemoval(db, 'f1', 'lp')).resolves.toEqual({ changed: true });
    expect(appliedMenu()).toEqual(['rm-contest']);

    run(`DELETE FROM friend_tags`);
    run(`UPDATE rich_menu_assignments SET desired_rich_menu_id = 'rm-contest'`);
    applyDesiredRichMenu.mockClear();
    await svc.reconcileTagRichMenuAfterRemoval(db, 'f1', 'contest');
    expect(appliedMenu()).toEqual(['__lineharness_account_default__']);
  });

  it('keeps a menu the removed tag does not own (newer rule or manual choice)', async () => {
    desired('rm-manual');
    await expect(svc.reconcileTagRichMenuAfterRemoval(db, 'f1', 'contest')).resolves.toMatchObject({ changed: false });
    expect(applyDesiredRichMenu).not.toHaveBeenCalled();
  });
});

describe('queue bookkeeping for bulk links', () => {
  it('points existing rows at the bulk-linked menu, but never a blocked friend', async () => {
    desired('rm-old');
    run(`INSERT INTO friends (id, line_user_id, display_name, is_following, line_account_id) VALUES ('f2', 'U2', 'Q', 1, 'acc')`);
    run(`INSERT INTO friend_tags (friend_id, tag_id, assigned_at) VALUES ('f2', 'block', '2026-10-01')`);
    run(`INSERT INTO rich_menu_assignments (friend_id, line_account_id, desired_rich_menu_id, status) VALUES ('f2', 'acc', 'rm-blank', 'applied')`);
    await svc.recordBulkLinkedMenu(db, 'acc', ['U1', 'U2', 'U-none'], 'rm-contest', '2026-10-28T12:00:00.000+09:00');
    const rows = sqlite.prepare(`SELECT friend_id, desired_rich_menu_id, generation FROM rich_menu_assignments ORDER BY friend_id`).all();
    expect(rows).toEqual([
      { friend_id: 'f1', desired_rich_menu_id: 'rm-contest', generation: 2 },
      { friend_id: 'f2', desired_rich_menu_id: 'rm-blank', generation: 1 },
    ]);
  });

  it('carries queued desired menus over to republished menu IDs', async () => {
    desired('rm-contest');
    await svc.remapDesiredMenusAfterPublish(db, [{ oldRichMenuId: 'rm-contest', newRichMenuId: 'rm-contest-v2' }], 'now');
    expect(sqlite.prepare(`SELECT desired_rich_menu_id d FROM rich_menu_assignments`).get()).toEqual({ d: 'rm-contest-v2' });
  });
});

describe('safely', () => {
  it('never lets a LINE failure break the tag change', async () => {
    await expect(svc.safely('x', async () => { throw new Error('LINE 500'); })).resolves.toBeUndefined();
  });
});
