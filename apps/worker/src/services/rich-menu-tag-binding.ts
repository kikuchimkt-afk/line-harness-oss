import {
  getActiveTagRichMenuBinding,
  getFriendById,
  getLineAccountById,
  getRichMenuGroupWithPages,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';

export type TagRichMenuApplyResult =
  | { applied: true; groupId: string; richMenuId: string }
  | {
      applied: false;
      reason:
        | 'friend_not_found'
        | 'not_following'
        | 'account_not_linked'
        | 'binding_not_found'
        | 'group_not_published'
        | 'published_page_not_found'
        | 'line_account_not_found';
    };

/**
 * Applies the currently published rich menu bound to a tag.
 *
 * The binding stores a group id rather than a LINE richMenuId. Resolving the
 * default page at execution time keeps future tag assignments working after a
 * group is republished and LINE issues a new richMenuId.
 */
export async function applyTagRichMenuBinding(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<TagRichMenuApplyResult> {
  const friend = await getFriendById(db, friendId);
  if (!friend) return { applied: false, reason: 'friend_not_found' };
  if (friend.is_following !== 1) return { applied: false, reason: 'not_following' };
  if (!friend.line_account_id) {
    return { applied: false, reason: 'account_not_linked' };
  }

  const binding = await getActiveTagRichMenuBinding(
    db,
    friend.line_account_id,
    tagId,
  );
  if (!binding) return { applied: false, reason: 'binding_not_found' };

  const group = await getRichMenuGroupWithPages(
    db,
    binding.rich_menu_group_id,
  );
  if (
    !group ||
    group.account_id !== friend.line_account_id ||
    group.status !== 'published'
  ) {
    return { applied: false, reason: 'group_not_published' };
  }

  const page =
    group.pages.find((candidate) => candidate.id === group.default_page_id) ??
    [...group.pages].sort((a, b) => a.order_index - b.order_index)[0];
  if (!page?.line_richmenu_id) {
    return { applied: false, reason: 'published_page_not_found' };
  }

  const account = await getLineAccountById(db, friend.line_account_id);
  if (!account) return { applied: false, reason: 'line_account_not_found' };

  const line = new LineClient(account.channel_access_token);
  await line.linkRichMenuToUser(friend.line_user_id, page.line_richmenu_id);
  return {
    applied: true,
    groupId: group.id,
    richMenuId: page.line_richmenu_id,
  };
}

/**
 * Re-evaluates a friend's existing tags, primarily after a re-follow event.
 * When more than one bound tag exists, the most recently assigned tag wins,
 * matching the fact that LINE can show only one per-user rich menu at a time.
 */
export async function applyPreferredTagRichMenuBinding(
  db: D1Database,
  friendId: string,
): Promise<TagRichMenuApplyResult> {
  const friend = await getFriendById(db, friendId);
  if (!friend) return { applied: false, reason: 'friend_not_found' };
  if (friend.is_following !== 1) return { applied: false, reason: 'not_following' };
  if (!friend.line_account_id) {
    return { applied: false, reason: 'account_not_linked' };
  }

  const preferred = await db
    .prepare(
      `SELECT b.tag_id
         FROM tag_rich_menu_bindings b
         INNER JOIN friend_tags ft ON ft.tag_id = b.tag_id
        WHERE b.account_id = ?
          AND b.is_active = 1
          AND ft.friend_id = ?
        ORDER BY ft.assigned_at DESC, b.updated_at DESC
        LIMIT 1`,
    )
    .bind(friend.line_account_id, friendId)
    .first<{ tag_id: string }>();

  if (!preferred) return { applied: false, reason: 'binding_not_found' };
  return applyTagRichMenuBinding(db, friendId, preferred.tag_id);
}

export type TagRichMenuRemovalResult =
  | { changed: false; reason: string }
  | { changed: true; action: 'switched' | 'unlinked' };

/**
 * Reconciles a per-user LINE rich menu after a tag is removed.
 *
 * It only changes LINE state when the user's current rich menu is exactly the
 * menu owned by the removed tag binding. This protects a newer tag binding or
 * a menu that an operator linked manually.
 */
export async function reconcileTagRichMenuAfterRemoval(
  db: D1Database,
  friendId: string,
  removedTagId: string,
): Promise<TagRichMenuRemovalResult> {
  const friend = await getFriendById(db, friendId);
  if (!friend?.line_account_id || friend.is_following !== 1) {
    return { changed: false, reason: 'friend_not_available' };
  }

  const removedBinding = await getActiveTagRichMenuBinding(
    db,
    friend.line_account_id,
    removedTagId,
  );
  if (!removedBinding) return { changed: false, reason: 'binding_not_found' };

  const removedGroup = await getRichMenuGroupWithPages(
    db,
    removedBinding.rich_menu_group_id,
  );
  const removedPage =
    removedGroup?.pages.find((page) => page.id === removedGroup.default_page_id) ??
    (removedGroup
      ? [...removedGroup.pages].sort((a, b) => a.order_index - b.order_index)[0]
      : undefined);
  if (!removedPage?.line_richmenu_id) {
    return { changed: false, reason: 'bound_menu_not_published' };
  }

  const account = await getLineAccountById(db, friend.line_account_id);
  if (!account) return { changed: false, reason: 'line_account_not_found' };
  const line = new LineClient(account.channel_access_token);

  let currentRichMenuId: string | null = null;
  try {
    currentRichMenuId = (
      await line.getRichMenuIdOfUser(friend.line_user_id)
    ).richMenuId;
  } catch (error) {
    if (!String(error).includes('404')) throw error;
  }
  if (currentRichMenuId !== removedPage.line_richmenu_id) {
    return { changed: false, reason: 'current_menu_changed' };
  }

  const preferred = await applyPreferredTagRichMenuBinding(db, friendId);
  if (preferred.applied) return { changed: true, action: 'switched' };

  await line.unlinkRichMenuFromUser(friend.line_user_id);
  return { changed: true, action: 'unlinked' };
}
