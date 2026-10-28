/** Application block policy, independent of LINE's real follow/unfollow state. */
export const BLOCKED_FRIEND_MESSAGE = '現在、この機能はご利用いただけません。';
export const BLOCK_TAG_NAME = 'ブロック';

export class BlockedFriendError extends Error {
  readonly code = 'FRIEND_BLOCKED';
  readonly status = 403;
  constructor() {
    super(BLOCKED_FRIEND_MESSAGE);
    this.name = 'BlockedFriendError';
  }
}

export function isBlockTagName(name: unknown): boolean {
  return typeof name === 'string' && name.normalize('NFKC').trim() === BLOCK_TAG_NAME;
}

/**
 * Couple destructive work cancellation to the real tag relation at mutation
 * time, not only an earlier asynchronous policy read. SQLite cannot perform
 * NFKC normalization, so remember the normalized candidates in JS, then match
 * their exact IDs/names and the same account inside each UPDATE. JSON keeps the
 * bind count fixed even when a customer has many equivalent control tags.
 */
export async function getFriendBlockMutationGuard(
  db: D1Database,
  friendId: string,
  accountId?: string | null,
): Promise<{ sql: string; bindings: [string, string, string | null] } | null> {
  if (!friendId) return null;
  const scoped = accountId !== undefined;
  const result = await db.prepare(`
    SELECT f.line_account_id, t.id, t.name FROM friends f
    JOIN friend_tags ft ON ft.friend_id = f.id
    JOIN tags t ON t.id = ft.tag_id
    WHERE f.id = ? ${scoped ? 'AND f.line_account_id IS ?' : ''}
  `).bind(...(scoped ? [friendId, accountId] : [friendId]))
    .all<{ line_account_id: string | null; id: string; name: string }>();
  const tags = result.results.filter(row => isBlockTagName(row.name));
  if (tags.length === 0) return null;
  return {
    sql: `EXISTS (
      SELECT 1 FROM friends block_friend
      JOIN friend_tags block_link ON block_link.friend_id = block_friend.id
      JOIN tags block_tag ON block_tag.id = block_link.tag_id
      JOIN json_each(?) block_snapshot
        ON block_tag.id = json_extract(block_snapshot.value, '$.id') COLLATE BINARY
        AND block_tag.name = json_extract(block_snapshot.value, '$.name') COLLATE BINARY
      WHERE block_friend.id = ? AND block_friend.line_account_id IS ?
    )`,
    bindings: [JSON.stringify(tags.map(({ id, name }) => ({ id, name }))), friendId, tags[0].line_account_id],
  };
}

// Only an actual friends -> friend_tags -> tags link is authoritative. No
// caller-supplied metadata, following flag, display name, tagId or cached state.
export async function isFriendBlocked(
  db: D1Database,
  friendId: string,
  accountId?: string | null,
): Promise<boolean> {
  if (!friendId) return false;
  const scoped = accountId !== undefined;
  const result = await db.prepare(`
    SELECT t.name FROM friends f
    JOIN friend_tags ft ON ft.friend_id = f.id
    JOIN tags t ON t.id = ft.tag_id
    WHERE f.id = ? ${scoped ? 'AND f.line_account_id IS ?' : ''}
  `).bind(...(scoped ? [friendId, accountId] : [friendId])).all<{ name: string }>();
  return result.results.some((row) => isBlockTagName(row.name));
}

export async function isLineUserBlocked(
  db: D1Database,
  lineUserId: string,
  accountId: string | null,
): Promise<boolean> {
  if (!lineUserId) return false;
  const result = await db.prepare(`
    SELECT t.name FROM friends f
    JOIN friend_tags ft ON ft.friend_id = f.id
    JOIN tags t ON t.id = ft.tag_id
    WHERE f.line_user_id = ? AND f.line_account_id IS ?
  `).bind(lineUserId, accountId).all<{ name: string }>();
  return result.results.some((row) => isBlockTagName(row.name));
}

export async function assertFriendNotBlocked(
  db: D1Database,
  friendId: string,
  accountId?: string | null,
): Promise<void> {
  if (await isFriendBlocked(db, friendId, accountId)) throw new BlockedFriendError();
}

export async function assertLineUserNotBlocked(
  db: D1Database,
  lineUserId: string,
  accountId: string | null,
): Promise<void> {
  if (await isLineUserBlocked(db, lineUserId, accountId)) throw new BlockedFriendError();
}

/** D1's bind-variable limit is bounded; do not turn a multicast into N+1. */
async function filterUnblockedIds(
  db: D1Database,
  ids: readonly string[],
  column: 'id' | 'line_user_id',
  accountId?: string | null,
): Promise<string[]> {
  const blocked = new Set<string>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let offset = 0; offset < unique.length; offset += 90) {
    const chunk = unique.slice(offset, offset + 90);
    const scoped = accountId !== undefined;
    const result = await db.prepare(`
      SELECT f.${column} AS identity, t.name FROM friends f
      JOIN friend_tags ft ON ft.friend_id = f.id
      JOIN tags t ON t.id = ft.tag_id
      WHERE f.${column} IN (${chunk.map(() => '?').join(',')})
        ${scoped ? 'AND f.line_account_id IS ?' : ''}
    `).bind(...(scoped ? [...chunk, accountId] : chunk)).all<{ identity: string; name: string }>();
    for (const row of result.results) if (isBlockTagName(row.name)) blocked.add(row.identity);
  }
  return ids.filter((id) => !blocked.has(id));
}

export function filterUnblockedLineUserIds(
  db: D1Database,
  ids: readonly string[],
  accountId: string | null,
): Promise<string[]> {
  return filterUnblockedIds(db, ids, 'line_user_id', accountId);
}

export function filterUnblockedFriendIds(
  db: D1Database,
  ids: readonly string[],
  accountId?: string | null,
): Promise<string[]> {
  return filterUnblockedIds(db, ids, 'id', accountId);
}

/** Preserve history; removing the block tag never resumes these paused rows. */
export async function stopBlockedFriendWork(
  db: D1Database,
  friendId: string,
  accountId?: string | null,
): Promise<void> {
  const guard = await getFriendBlockMutationGuard(db, friendId, accountId);
  if (!guard) return;
  const now = new Date(Date.now() + 9 * 60 * 60_000).toISOString().slice(0, -1) + '+09:00';
  await db.prepare(`
    UPDATE friend_scenarios SET status = 'paused', next_delivery_at = NULL, updated_at = ?
    WHERE friend_id = ? AND status IN ('active', 'delivering')
      AND ${guard.sql}
  `).bind(now, friendId, ...guard.bindings).run();
}
