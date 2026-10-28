import {
  getActiveTagRichMenuBinding,
  getLineAccountById,
  getRichMenuGroupWithPages,
} from '@line-crm/db';
import { containsProtectedBlockMenu } from './blocked-menu-protection.js';
import { isFriendBlocked } from './friend-block-policy.js';
import { applyDesiredRichMenu, DEFAULT_RICH_MENU_ID } from './rich-menu-assignment.js';

// Persistent "show this rich-menu group to friends with this tag" rules
// (tag_rich_menu_bindings). Ported from the 2026-10-02 branch (bfdfe25), but
// every change goes through the durable rich_menu_assignments queue so it gets
// retries, never overrides the blocked-friend menu, and is not reverted by the
// periodic verification.

export type TagRichMenuResult =
  | { applied: true; richMenuId: string }
  | { applied: false; reason: string };

interface FriendRow {
  id: string;
  line_account_id: string | null;
  is_following: number;
}

/** The LINE rich menu currently published for a bound group's default page. */
export async function resolveBoundRichMenuId(
  db: D1Database,
  accountId: string,
  tagId: string,
): Promise<string | null> {
  const binding = await getActiveTagRichMenuBinding(db, accountId, tagId);
  if (!binding) return null;
  const group = await getRichMenuGroupWithPages(db, binding.rich_menu_group_id);
  if (!group || group.account_id !== accountId || group.status !== 'published') return null;
  const page =
    group.pages.find((p) => p.id === group.default_page_id) ??
    [...group.pages].sort((a, b) => a.order_index - b.order_index)[0];
  if (!page?.line_richmenu_id) return null;
  // A binding must never hand out the dedicated blocked-friend menu.
  if (await containsProtectedBlockMenu(db, [page.line_richmenu_id])) return null;
  return page.line_richmenu_id;
}

async function eligibleFriend(db: D1Database, friendId: string): Promise<FriendRow | null> {
  const friend = await db
    .prepare('SELECT id, line_account_id, is_following FROM friends WHERE id = ?')
    .bind(friendId)
    .first<FriendRow>();
  if (!friend?.line_account_id || friend.is_following !== 1) return null;
  // Blocked friends keep the dedicated menu; unblock restoration handles them.
  if (await isFriendBlocked(db, friendId)) return null;
  return friend;
}

async function applyMenu(db: D1Database, friend: FriendRow, richMenuId: string): Promise<void> {
  const account = await getLineAccountById(db, friend.line_account_id!);
  await applyDesiredRichMenu(db, {
    friendId: friend.id,
    richMenuId,
    lineAccessToken: account?.channel_access_token,
    lineAccountId: friend.line_account_id,
    source: 'automation',
  });
}

/** Most recently assigned bound tag wins: LINE shows one per-user menu. */
async function preferredBoundTag(db: D1Database, friend: FriendRow): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT b.tag_id
         FROM tag_rich_menu_bindings b
         INNER JOIN friend_tags ft ON ft.tag_id = b.tag_id
        WHERE b.account_id = ? AND b.is_active = 1 AND ft.friend_id = ?
        ORDER BY ft.assigned_at DESC, b.updated_at DESC
        LIMIT 1`,
    )
    .bind(friend.line_account_id, friend.id)
    .first<{ tag_id: string }>();
  return row?.tag_id ?? null;
}

/** Call after a tag was newly attached. */
export async function applyTagRichMenuForFriend(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<TagRichMenuResult> {
  const friend = await eligibleFriend(db, friendId);
  if (!friend) return { applied: false, reason: 'friend_not_eligible' };
  const richMenuId = await resolveBoundRichMenuId(db, friend.line_account_id!, tagId);
  if (!richMenuId) return { applied: false, reason: 'no_published_binding' };
  await applyMenu(db, friend, richMenuId);
  return { applied: true, richMenuId };
}

/** Re-evaluate all of a friend's bound tags (e.g. after re-follow). */
export async function applyPreferredTagRichMenu(
  db: D1Database,
  friendId: string,
): Promise<TagRichMenuResult> {
  const friend = await eligibleFriend(db, friendId);
  if (!friend) return { applied: false, reason: 'friend_not_eligible' };
  const tagId = await preferredBoundTag(db, friend);
  if (!tagId) return { applied: false, reason: 'no_bound_tag' };
  return applyTagRichMenuForFriend(db, friendId, tagId);
}

/**
 * Call after a tag was removed. Only acts when the friend's desired menu is the
 * one owned by the removed tag, so a newer rule or a manual choice is kept.
 */
export async function reconcileTagRichMenuAfterRemoval(
  db: D1Database,
  friendId: string,
  removedTagId: string,
): Promise<{ changed: boolean; reason?: string }> {
  const friend = await eligibleFriend(db, friendId);
  if (!friend) return { changed: false, reason: 'friend_not_eligible' };
  const removedMenu = await resolveBoundRichMenuId(db, friend.line_account_id!, removedTagId);
  if (!removedMenu) return { changed: false, reason: 'no_published_binding' };
  const desired = await db
    .prepare('SELECT desired_rich_menu_id FROM rich_menu_assignments WHERE friend_id = ?')
    .bind(friendId)
    .first<{ desired_rich_menu_id: string }>();
  if (desired?.desired_rich_menu_id !== removedMenu) return { changed: false, reason: 'menu_not_owned_by_tag' };

  const next = await applyPreferredTagRichMenu(db, friendId);
  if (next.applied) return { changed: true };
  await applyMenu(db, friend, DEFAULT_RICH_MENU_ID);
  return { changed: true };
}

/**
 * After a bulk LINE link (which bypasses the queue), point existing queue rows
 * at the linked menu so the periodic verification does not restore an older
 * desired menu. Friends without a row are left alone (nothing to revert them).
 * Blocked friends were already excluded from the link and are excluded here.
 */
export async function recordBulkLinkedMenu(
  db: D1Database,
  accountId: string,
  lineUserIds: string[],
  richMenuId: string,
  nowIso: string,
): Promise<void> {
  for (let i = 0; i < lineUserIds.length; i += 80) {
    const slice = lineUserIds.slice(i, i + 80);
    await db
      .prepare(
        `UPDATE rich_menu_assignments
            SET desired_rich_menu_id = ?, status = 'applied', applied_at = ?, verified_at = ?,
                last_error = NULL, next_attempt_at = NULL, generation = generation + 1, updated_at = ?
          WHERE friend_id IN (
                  SELECT f.id FROM friends f
                   WHERE f.line_account_id = ? AND f.line_user_id IN (${slice.map(() => '?').join(',')})
                     AND NOT EXISTS (
                       SELECT 1 FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id
                        WHERE ft.friend_id = f.id AND trim(t.name) = 'ブロック'))
            AND desired_rich_menu_id <> COALESCE(
                  (SELECT value FROM account_settings
                    WHERE line_account_id = ? AND key = 'blocked_dedicated_rich_menu_id'), '')`,
      )
      .bind(richMenuId, nowIso, nowIso, nowIso, accountId, ...slice, accountId)
      .run();
  }
}

/** Republishing issues new LINE richMenuIds; carry queued desired menus over. */
export async function remapDesiredMenusAfterPublish(
  db: D1Database,
  mapping: Array<{ oldRichMenuId: string | null; newRichMenuId: string }>,
  nowIso: string,
): Promise<void> {
  for (const { oldRichMenuId, newRichMenuId } of mapping) {
    if (!oldRichMenuId || oldRichMenuId === newRichMenuId) continue;
    await db
      .prepare(
        `UPDATE rich_menu_assignments SET desired_rich_menu_id = ?, updated_at = ?
          WHERE desired_rich_menu_id = ?`,
      )
      .bind(newRichMenuId, nowIso, oldRichMenuId)
      .run();
  }
}

/** Tag changes must never fail because LINE is unavailable; the queue retries. */
export async function safely(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`[tag-rich-menu] ${label} deferred:`, error instanceof Error ? error.message : error);
  }
}
