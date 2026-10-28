import { toJstString } from '@line-crm/db';
import { cancelBlockedFriendOutboundWork } from './blocked-outbound.js';
import { processDueBlockedMenuSetups } from './blocked-menu-setup.js';
import { isBlockTagName, isFriendBlocked, stopBlockedFriendWork } from './friend-block-policy.js';
import { applyBlockedRichMenuForFriend, restoreRichMenuAfterUnblock } from './rich-menu-assignment.js';

const DEDICATED_MENU_KEY = 'blocked_dedicated_rich_menu_id';
const REPAIR_ATTEMPT_KEY_PREFIX = 'blocked_menu_repair_attempt:';
const RESTORE_ATTEMPT_KEY_PREFIX = 'blocked_menu_restore_attempt:';
const PREVIOUS_MENU_KEY_PREFIX = 'blocked_previous_rich_menu_id:';
const MAX_FRIEND_REPAIRS_PER_TICK = 2;
const REPAIR_COOLDOWN_MS = 5 * 60_000;
const PERMANENT_RETRY_COOLDOWN_MS = 6 * 60 * 60_000;

interface RepairTarget { friend_id: string; line_account_id: string }
interface RepairResult { attempted: number; repaired: number; failed: number; skipped: number }

/**
 * Recover tags saved before an account's blank menu was ready. Selection is
 * restricted to real block-tag links on active accounts; ordinary customers,
 * public pages and LINE's real follow/unfollow state are never modified.
 */
export async function processBlockedFriendMenuRepairs(
  db: D1Database,
  params: { now?: Date; limit?: number } = {},
): Promise<{ attempted: number; repaired: number; failed: number; skipped: number }> {
  const now = params.now ?? new Date();
  const nowIso = toJstString(now);
  const cooldown = toJstString(new Date(now.getTime() - REPAIR_COOLDOWN_MS));
  const permanentCooldown = toJstString(new Date(now.getTime() - PERMANENT_RETRY_COOLDOWN_MS));
  const limit = Math.max(0, Math.min(MAX_FRIEND_REPAIRS_PER_TICK, Math.floor(params.limit ?? MAX_FRIEND_REPAIRS_PER_TICK)));
  const result = { attempted: 0, repaired: 0, failed: 0, skipped: 0 };
  if (limit === 0) return result;

  // Resolve normalization in JS, exactly as the enforcement policy does. SQL
  // name equality alone would miss half-width or padded variants of the tag.
  const tags = await db.prepare('SELECT id, name FROM tags').all<{ id: string; name: string }>();
  const tagIds = tags.results.filter(t => isBlockTagName(t.name)).map(t => t.id);
  const targets = new Map<string, RepairTarget>();
  for (let offset = 0; offset < tagIds.length && targets.size < limit; offset += 80) {
    const chunk = tagIds.slice(offset, offset + 80);
    const rows = await db.prepare(`
      SELECT DISTINCT f.id AS friend_id, f.line_account_id
        FROM friends f
        JOIN friend_tags ft ON ft.friend_id = f.id
        JOIN line_accounts la ON la.id = f.line_account_id AND la.is_active = 1
        JOIN account_settings config ON config.line_account_id = f.line_account_id
          AND config.key = ? AND length(config.value) > 0
        LEFT JOIN rich_menu_assignments r ON r.friend_id = f.id
        LEFT JOIN account_settings attempt ON attempt.line_account_id = f.line_account_id
          AND attempt.key = ? || f.id
       WHERE ft.tag_id IN (${chunk.map(() => '?').join(',')})
         AND (attempt.value IS NULL OR attempt.value <= ?)
         AND (r.friend_id IS NULL OR r.desired_rich_menu_id <> config.value
           OR r.line_account_id IS NOT f.line_account_id
           OR (r.status = 'failed_permanent' AND r.updated_at <= ?))
       ORDER BY COALESCE(attempt.value, ''), COALESCE(r.updated_at, ''), f.id
       LIMIT ?
    `).bind(DEDICATED_MENU_KEY, REPAIR_ATTEMPT_KEY_PREFIX, ...chunk, cooldown, permanentCooldown, limit)
      .all<RepairTarget>();
    for (const row of rows.results) {
      if (targets.size < limit) targets.set(row.friend_id, row);
    }
  }

  for (const target of targets.values()) {
    try {
      if (!(await isFriendBlocked(db, target.friend_id, target.line_account_id))) {
        result.skipped += 1;
        continue;
      }
      // Record attempts before external work so an unavailable customer cannot
      // indefinitely starve later repairs. No raw API error or token is stored.
      await db.prepare(`INSERT INTO account_settings (id, line_account_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(line_account_id, key)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(crypto.randomUUID(), target.line_account_id, REPAIR_ATTEMPT_KEY_PREFIX + target.friend_id,
          nowIso, nowIso, nowIso).run();
      result.attempted += 1;
      await stopBlockedFriendWork(db, target.friend_id, target.line_account_id);
      if (!(await isFriendBlocked(db, target.friend_id, target.line_account_id))) {
        result.skipped += 1;
        continue;
      }
      await cancelBlockedFriendOutboundWork(db, target.friend_id, target.line_account_id);
      await applyBlockedRichMenuForFriend(db, target.friend_id, undefined, target.line_account_id);
      result.repaired += 1;
    } catch {
      // Durable retry state and the still-present tag keep all send gates closed.
      result.failed += 1;
    }
  }
  return result;
}

/** Recover an unblock committed before its menu call completed. This never
 * resumes scenarios, reminders or scheduled messages. Existing ordinary menu
 * retry queues retain their backoff; only orphaned/terminal intents are repaired. */
export async function processUnblockedFriendMenuRepairs(
  db: D1Database,
  params: { now?: Date; limit?: number } = {},
): Promise<RepairResult> {
  const now = params.now ?? new Date();
  const nowIso = toJstString(now);
  const limit = Math.max(0, Math.min(MAX_FRIEND_REPAIRS_PER_TICK, Math.floor(params.limit ?? MAX_FRIEND_REPAIRS_PER_TICK)));
  const result: RepairResult = { attempted: 0, repaired: 0, failed: 0, skipped: 0 };
  if (!limit) return result;
  const tags = await db.prepare('SELECT id, name FROM tags').all<{ id: string; name: string }>();
  const blockTagIds = tags.results.filter(t => isBlockTagName(t.name)).map(t => t.id);
  const rows = await db.prepare(`
    SELECT f.id AS friend_id, f.line_account_id
      FROM friends f
      JOIN line_accounts la ON la.id = f.line_account_id AND la.is_active = 1
      JOIN account_settings previous ON previous.line_account_id = f.line_account_id
        AND previous.key = ? || f.id
      LEFT JOIN account_settings config ON config.line_account_id = f.line_account_id AND config.key = ?
      LEFT JOIN account_settings attempt ON attempt.line_account_id = f.line_account_id AND attempt.key = ? || f.id
      LEFT JOIN rich_menu_assignments r ON r.friend_id = f.id
     WHERE NOT EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = f.id
       AND ft.tag_id IN (SELECT value FROM json_each(?)))
       AND (attempt.value IS NULL OR attempt.value <= ?)
       AND (r.friend_id IS NULL OR r.desired_rich_menu_id = config.value OR r.status = 'applied'
         OR (r.status = 'failed_permanent' AND r.updated_at <= ?))
     ORDER BY COALESCE(attempt.value, ''), previous.updated_at, f.id LIMIT ?
  `).bind(PREVIOUS_MENU_KEY_PREFIX, DEDICATED_MENU_KEY, RESTORE_ATTEMPT_KEY_PREFIX,
    JSON.stringify(blockTagIds), toJstString(new Date(now.getTime() - REPAIR_COOLDOWN_MS)),
    toJstString(new Date(now.getTime() - PERMANENT_RETRY_COOLDOWN_MS)), limit).all<RepairTarget>();
  for (const target of rows.results) {
    try {
      if (await isFriendBlocked(db, target.friend_id, target.line_account_id)) {
        result.skipped += 1;
        continue;
      }
      await db.prepare(`INSERT INTO account_settings (id, line_account_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(line_account_id,key)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(crypto.randomUUID(), target.line_account_id, RESTORE_ATTEMPT_KEY_PREFIX + target.friend_id,
          nowIso, nowIso, nowIso).run();
      result.attempted += 1;
      await restoreRichMenuAfterUnblock(db, target.friend_id, undefined, target.line_account_id);
      result.repaired += 1;
    } catch {
      // Only safe counters are returned. A saved backup plus the desired-state
      // retry queue survives process termination and transient LINE failures.
      result.failed += 1;
    }
  }
  return result;
}

/** Provision at most one account and repair at most two customers per tick. */
export async function processBlockedMenuMaintenance(
  db: D1Database,
  params: { now?: Date } = {},
) {
  const now = params.now ?? new Date();
  let setup = { readyAccountIds: [] as string[], attempted: 0, ready: 0, deferred: 0, failed: 0 };
  try {
    setup = await processDueBlockedMenuSetups(db, { now, limit: 1 });
  } catch {
    setup.failed = 1;
  }
  // A setup failure must not prevent recovery on previously configured accounts.
  // Keep the existing total two-friend external-work budget. Blocking gets the
  // first slot; one unblock can still progress under a continuous block backlog.
  const repair = await processBlockedFriendMenuRepairs(db, { now, limit: 1 });
  const restore = await processUnblockedFriendMenuRepairs(db, { now, limit: MAX_FRIEND_REPAIRS_PER_TICK - repair.attempted });
  const remaining = MAX_FRIEND_REPAIRS_PER_TICK - repair.attempted - restore.attempted;
  if (remaining > 0 && repair.attempted > 0) {
    const extra = await processBlockedFriendMenuRepairs(db, { now, limit: remaining });
    for (const key of ['attempted', 'repaired', 'failed', 'skipped'] as const) repair[key] += extra[key];
  }
  return { setup, repair, restore };
}
