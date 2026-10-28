/** Internal blank menus must never enter ordinary rich-menu management. */
export async function isProtectedBlockMenu(db: D1Database, richMenuId: string): Promise<boolean> {
  if (!richMenuId) return false;
  return Boolean(await db.prepare(`SELECT 1 FROM account_settings
    WHERE key = 'blocked_dedicated_rich_menu_id' AND value = ? LIMIT 1`)
    .bind(richMenuId).first());
}

export async function containsProtectedBlockMenu(
  db: D1Database,
  richMenuIds: readonly (string | null | undefined)[],
): Promise<boolean> {
  for (const richMenuId of new Set(richMenuIds.filter((id): id is string => Boolean(id)))) {
    if (await isProtectedBlockMenu(db, richMenuId)) return true;
  }
  return false;
}
