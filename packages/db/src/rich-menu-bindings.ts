import { jstNow } from './utils.js';

export interface TagRichMenuBinding {
  account_id: string;
  tag_id: string;
  rich_menu_group_id: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertTagRichMenuBindingInput {
  accountId: string;
  tagId: string;
  richMenuGroupId: string;
}

/**
 * Creates or replaces the rich-menu binding for one tag in one LINE account.
 *
 * The group/account check prevents a valid group from another account being
 * stored accidentally. The database foreign keys separately validate the
 * account, tag, and group references.
 */
export async function upsertTagRichMenuBinding(
  db: D1Database,
  input: UpsertTagRichMenuBindingInput,
): Promise<TagRichMenuBinding> {
  const group = await db
    .prepare(
      `SELECT id
         FROM rich_menu_groups
        WHERE id = ? AND account_id = ?`,
    )
    .bind(input.richMenuGroupId, input.accountId)
    .first<{ id: string }>();

  if (!group) {
    throw new Error('rich menu group does not belong to the LINE account');
  }

  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO tag_rich_menu_bindings
         (account_id, tag_id, rich_menu_group_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(account_id, tag_id) DO UPDATE SET
         rich_menu_group_id = excluded.rich_menu_group_id,
         is_active = 1,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.accountId,
      input.tagId,
      input.richMenuGroupId,
      now,
      now,
    )
    .run();

  const binding = await getTagRichMenuBinding(db, input.accountId, input.tagId);
  if (!binding) {
    throw new Error('failed to read back tag rich-menu binding');
  }
  return binding;
}

export async function getTagRichMenuBinding(
  db: D1Database,
  accountId: string,
  tagId: string,
): Promise<TagRichMenuBinding | null> {
  return (
    (await db
      .prepare(
        `SELECT *
           FROM tag_rich_menu_bindings
          WHERE account_id = ? AND tag_id = ?`,
      )
      .bind(accountId, tagId)
      .first<TagRichMenuBinding>()) ?? null
  );
}

export async function getActiveTagRichMenuBinding(
  db: D1Database,
  accountId: string,
  tagId: string,
): Promise<TagRichMenuBinding | null> {
  return (
    (await db
      .prepare(
        `SELECT *
           FROM tag_rich_menu_bindings
          WHERE account_id = ? AND tag_id = ? AND is_active = 1`,
      )
      .bind(accountId, tagId)
      .first<TagRichMenuBinding>()) ?? null
  );
}

export async function listTagRichMenuBindingsByAccount(
  db: D1Database,
  accountId: string,
): Promise<TagRichMenuBinding[]> {
  const result = await db
    .prepare(
      `SELECT *
         FROM tag_rich_menu_bindings
        WHERE account_id = ?
        ORDER BY updated_at DESC, tag_id ASC`,
    )
    .bind(accountId)
    .all<TagRichMenuBinding>();
  return result.results ?? [];
}

export async function deleteTagRichMenuBinding(
  db: D1Database,
  accountId: string,
  tagId: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM tag_rich_menu_bindings
        WHERE account_id = ? AND tag_id = ?`,
    )
    .bind(accountId, tagId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Returns only followers for whom this group is the preferred active binding.
 * If a friend has multiple bound tags, the most recently assigned tag wins.
 */
export async function getFollowingLineUserIdsByPreferredRichMenuGroup(
  db: D1Database,
  accountId: string,
  richMenuGroupId: string,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT f.line_user_id
         FROM friends f
        WHERE f.line_account_id = ?
          AND f.is_following = 1
          AND (
            SELECT b.rich_menu_group_id
              FROM friend_tags ft
              INNER JOIN tag_rich_menu_bindings b
                ON b.tag_id = ft.tag_id
               AND b.account_id = f.line_account_id
               AND b.is_active = 1
             WHERE ft.friend_id = f.id
             ORDER BY ft.assigned_at DESC, b.updated_at DESC
             LIMIT 1
          ) = ?
        ORDER BY f.id`,
    )
    .bind(accountId, richMenuGroupId)
    .all<{ line_user_id: string }>();
  return (result.results ?? []).map((row) => row.line_user_id);
}
