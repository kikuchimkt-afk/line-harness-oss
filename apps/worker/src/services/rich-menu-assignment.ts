import { toJstString } from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import { BlockedFriendError, isBlockTagName, isFriendBlocked } from './friend-block-policy.js';
import { ensureBlockedMenuForAccount } from './blocked-menu-setup.js';

const BLOCK_MENU_KEY = 'blocked_dedicated_rich_menu_id';
// A durable desired *operation*, not a LINE rich-menu ID. Keeping the default
// restoration in the same generation queue prevents stale blank calls from
// winning after an unlink and makes transient unlink errors retryable.
export const DEFAULT_RICH_MENU_ID = '__lineharness_account_default__';
const previousMenuKey = (friendId: string) => `blocked_previous_rich_menu_id:${friendId}`;

async function blockedMenuId(db: D1Database, accountId: string | null): Promise<string | null> {
  if (!accountId) return null;
  const row = await db.prepare(`SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?`)
    .bind(accountId, BLOCK_MENU_KEY).first<{ value: string }>();
  return row?.value || null;
}

async function assertAllowedRichMenu(db: D1Database, friendId: string, richMenuId: string): Promise<void> {
  const friend = await db.prepare(`SELECT line_account_id FROM friends WHERE id = ?`).bind(friendId).first<{ line_account_id: string | null }>();
  const blank = await blockedMenuId(db, friend?.line_account_id ?? null);
  const blocked = await isFriendBlocked(db, friendId);
  if ((blocked && richMenuId !== blank) || (!blocked && richMenuId === blank)) throw new BlockedFriendError();
}

async function repairLateNormalMenu(db: D1Database, friendId: string, richMenuId: string, token: string, accountId?: string | null): Promise<boolean> {
  const friend = await db.prepare(`SELECT line_account_id FROM friends WHERE id = ?`).bind(friendId).first<{ line_account_id: string | null }>();
  const blank = await blockedMenuId(db, friend?.line_account_id ?? null);
  if (!(await isFriendBlocked(db, friendId))) {
    if (richMenuId !== blank) return false;
    // A blocked-only link can finish after a successful unblock, including
    // after its backup was consumed. Prefer the newest normal/default intent.
    const desired = await db.prepare('SELECT desired_rich_menu_id FROM rich_menu_assignments WHERE friend_id = ?')
      .bind(friendId).first<{ desired_rich_menu_id: string }>();
    if (desired && desired.desired_rich_menu_id !== blank) {
      await applyDesiredRichMenu(db, { friendId, richMenuId: desired.desired_rich_menu_id,
        lineAccessToken: token, lineAccountId: friend?.line_account_id, source: 'manual' });
    } else {
      await restoreRichMenuAfterUnblock(db, friendId, token, accountId);
      const latest = await db.prepare('SELECT desired_rich_menu_id FROM rich_menu_assignments WHERE friend_id = ?')
        .bind(friendId).first<{ desired_rich_menu_id: string }>();
      // Legacy/orphaned blank assignments have no backup to consume. Falling
      // back to the account default is safer than leaving an unblocked blank.
      if ((!latest || latest.desired_rich_menu_id === blank) && !(await isFriendBlocked(db, friendId))) {
        await applyDesiredRichMenu(db, { friendId, richMenuId: DEFAULT_RICH_MENU_ID,
          lineAccessToken: token, lineAccountId: friend?.line_account_id, source: 'manual' });
      }
    }
    return true;
  }
  if (richMenuId === blank) return false;
  // A pre-block LINE request may complete after the blank menu. Repair now,
  // not only at the next Cron. Generation guards preserve the newest state.
  await applyBlockedRichMenuForFriend(db, friendId, token, accountId);
  return true;
}

/** Persist the old individual menu before the block-only blank menu replaces it. */
export async function applyBlockedRichMenuForFriend(db: D1Database, friendId: string, token?: string, accountId?: string | null): Promise<void> {
  const friend = await db.prepare(`SELECT line_user_id, line_account_id FROM friends WHERE id = ?`).bind(friendId).first<FriendTarget>();
  if (!friend || !(await isFriendBlocked(db, friendId))) return;
  if (accountId !== undefined && accountId !== friend.line_account_id) throw new BlockedFriendError();
  const actualAccount = friend.line_account_id;
  if (!actualAccount) throw new Error('Blocked-only rich menu account is unavailable');
  let menu = await blockedMenuId(db, actualAccount);
  if (!menu) {
    // Ordinary accounts with an existing configuration do not make extra LINE
    // calls. A newly-added account may be provisioned on the first block action;
    // transient failures leave the saved tag intact for the bounded Cron repair.
    try {
      const setup = await ensureBlockedMenuForAccount(db, actualAccount);
      if (setup.status === 'ready' && setup.richMenuId) menu = setup.richMenuId;
    } catch {
      // Credentials or raw LINE response bodies must never escape this boundary.
    }
    if (!menu) throw new Error('Blocked-only rich menu setup is pending');
  }
  if (!(await isFriendBlocked(db, friendId, actualAccount))) return;
  if (!token) token = (await db.prepare(`SELECT channel_access_token FROM line_accounts WHERE id = ?`).bind(actualAccount).first<{ channel_access_token: string }>())?.channel_access_token;
  if (!token) throw new Error('LINE account token is unavailable for switch_rich_menu');
  const key = previousMenuKey(friendId);
  const saved = await db.prepare(`SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?`).bind(actualAccount, key).first();
  if (!saved) {
    const desired = await db.prepare(`SELECT desired_rich_menu_id FROM rich_menu_assignments WHERE friend_id = ?`).bind(friendId).first<{ desired_rich_menu_id: string }>();
    let previous = desired?.desired_rich_menu_id === DEFAULT_RICH_MENU_ID ? null : desired?.desired_rich_menu_id ?? null;
    if (!previous || previous === menu) {
      try { previous = (await new LineClient(token).getRichMenuIdOfUser(friend.line_user_id)).richMenuId; }
      catch (error) { if (lineStatus(error) !== 404) throw error; previous = null; }
    }
    if (previous === menu) previous = null;
    await db.prepare(`INSERT INTO account_settings (id, line_account_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(line_account_id,key) DO NOTHING`)
      .bind(crypto.randomUUID(), actualAccount, key, JSON.stringify({ richMenuId: previous }), toJstString(new Date()), toJstString(new Date())).run();
  }
  if (!(await isFriendBlocked(db, friendId, actualAccount))) return;
  await applyDesiredRichMenu(db, { friendId, richMenuId: menu, lineAccessToken: token, lineAccountId: actualAccount, source: 'manual' });
}

/** Tag removal restores only the menu, never previously cancelled jobs. */
export async function restoreRichMenuAfterUnblock(db: D1Database, friendId: string, token?: string, accountId?: string | null): Promise<void> {
  if (await isFriendBlocked(db, friendId)) throw new BlockedFriendError();
  const friend = await db.prepare(`SELECT line_user_id, line_account_id FROM friends WHERE id = ?`).bind(friendId).first<FriendTarget>();
  if (!friend?.line_account_id) return;
  if (accountId !== undefined && accountId !== friend.line_account_id) throw new BlockedFriendError();
  const key = previousMenuKey(friendId);
  const saved = await db.prepare(`SELECT id, value FROM account_settings WHERE line_account_id = ? AND key = ?`).bind(friend.line_account_id, key).first<{ id: string; value: string }>();
  if (!saved) return;
  if (!token) token = (await db.prepare(`SELECT channel_access_token FROM line_accounts WHERE id = ?`).bind(friend.line_account_id).first<{ channel_access_token: string }>())?.channel_access_token;
  if (!token) throw new Error('LINE account token is unavailable for switch_rich_menu');
  const previous = JSON.parse(saved.value) as { richMenuId: string | null };
  const desired = await db.prepare('SELECT desired_rich_menu_id, status, generation FROM rich_menu_assignments WHERE friend_id = ?')
    .bind(friendId).first<{ desired_rich_menu_id: string; status: string; generation: number }>();
  const blank = await blockedMenuId(db, friend.line_account_id);
  if (desired && desired.desired_rich_menu_id !== blank) {
    // A previous restoration or a newer manual/menu selection already owns the
    // queue. Never reset its backoff or resurrect an older campaign menu.
    if (desired.status === 'applied') {
      await cleanupRestoredMenuBackup(db, friendId, friend.line_account_id, desired.desired_rich_menu_id, desired.generation);
      return;
    }
    if (['pending', 'retry_wait', 'processing'].includes(desired.status)) return;
  }
  let target = desired && desired.desired_rich_menu_id !== blank ? desired.desired_rich_menu_id : previous.richMenuId || DEFAULT_RICH_MENU_ID;
  if (target !== DEFAULT_RICH_MENU_ID && target === previous.richMenuId) {
    const client = new LineClient(token);
    if (typeof client.request === 'function') {
      try { await client.request('GET', `/v2/bot/richmenu/${encodeURIComponent(target)}`); }
      catch (error) {
        // This endpoint identifies the MENU resource, unlike the user-link
        // endpoint's ambiguous 404. Only confirmed deleted resources fall back.
        if (lineStatus(error) !== 404) throw error;
        target = DEFAULT_RICH_MENU_ID;
      }
    }
  }
  await applyDesiredRichMenu(db, { friendId, richMenuId: target,
    lineAccountId: friend.line_account_id, lineAccessToken: token, source: 'manual' });
}

/** Consume a backup only after the latest successful operation and while the
 * authoritative tag is still absent at the database mutation itself. */
async function cleanupRestoredMenuBackup(db: D1Database, friendId: string, accountId: string | null,
  richMenuId: string, generation: number): Promise<void> {
  if (!accountId || richMenuId === await blockedMenuId(db, accountId)) return;
  const saved = await db.prepare('SELECT id, value FROM account_settings WHERE line_account_id = ? AND key = ?')
    .bind(accountId, previousMenuKey(friendId)).first<{ id: string; value: string }>();
  if (!saved?.id) return;
  const tags = await db.prepare('SELECT id, name FROM tags').all<{ id: string; name: string }>();
  const blockTagIds = tags.results.filter(t => isBlockTagName(t.name)).map(t => t.id);
  await db.prepare(`DELETE FROM account_settings WHERE id = ? AND line_account_id = ? AND key = ? AND value = ?
      AND EXISTS (SELECT 1 FROM rich_menu_assignments r WHERE r.friend_id = ? AND r.line_account_id IS ?
        AND r.generation = ? AND r.desired_rich_menu_id = ? AND r.status = 'applied')
      AND NOT EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = ?
        AND ft.tag_id IN (SELECT value FROM json_each(?)))`)
    .bind(saved.id, accountId, previousMenuKey(friendId), saved.value, friendId, accountId,
      generation, richMenuId, friendId, JSON.stringify(blockTagIds)).run();
}

export type RichMenuAssignmentSource = 'automation' | 'manual' | 'backfill';
export type RichMenuAssignmentStatus =
  | 'pending'
  | 'retry_wait'
  | 'processing'
  | 'applied'
  | 'failed_permanent';

type RichMenuClient = Pick<LineClient, 'linkRichMenuToUser' | 'getRichMenuIdOfUser'> &
  Partial<Pick<LineClient, 'unlinkRichMenuFromUser' | 'request'>>;

interface FriendTarget {
  line_user_id: string;
  line_account_id: string | null;
}

interface DueAssignmentRow {
  friend_id: string;
  line_account_id: string | null;
  desired_rich_menu_id: string;
  retry_count: number;
  max_retries: number;
  generation: number;
  line_user_id: string;
  channel_access_token: string | null;
}

interface VerifyAssignmentRow {
  friend_id: string;
  desired_rich_menu_id: string;
  generation: number;
  line_user_id: string;
  channel_access_token: string | null;
}

export interface ApplyDesiredRichMenuInput {
  friendId: string;
  richMenuId: string;
  lineAccessToken?: string;
  lineAccountId?: string | null;
  automationId?: string | null;
  source?: RichMenuAssignmentSource;
  now?: Date;
  clientFactory?: (token: string) => RichMenuClient;
}

const MAX_RETRIES = 5;
const RETRY_LIMIT_PER_CRON = 20;
const VERIFY_LIMIT_PER_MAINTENANCE = 25;
const STALE_PROCESSING_MINUTES = 15;
const VERIFY_AFTER_DAYS = 5;
const BACKOFF_MINUTES = [5, 15, 60, 360] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lineStatus(error: unknown): number | null {
  const match = errorMessage(error).match(/LINE API error:\s*(\d{3})/i);
  return match ? Number(match[1]) : null;
}

/** Network errors, rate limits and LINE 5xx are safe to retry. */
export function isRetryableRichMenuError(error: unknown): boolean {
  if (error instanceof BlockedFriendError) return false;
  const status = lineStatus(error);
  if (status === null) {
    const message = errorMessage(error);
    if (
      message.includes('is required for switch_rich_menu') ||
      message.includes('LINE user not found') ||
      message.includes('LINE account token is unavailable')
    ) {
      return false;
    }
    return true;
  }
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryAt(now: Date, completedAttempt: number): string {
  const index = Math.max(0, Math.min(BACKOFF_MINUTES.length - 1, completedAttempt - 1));
  return toJstString(new Date(now.getTime() + BACKOFF_MINUTES[index] * 60_000));
}

function clientFor(
  token: string,
  factory?: (token: string) => RichMenuClient,
): RichMenuClient {
  return factory ? factory(token) : new LineClient(token);
}

async function applyMenuOperation(client: RichMenuClient, lineUserId: string, richMenuId: string): Promise<void> {
  if (richMenuId === DEFAULT_RICH_MENU_ID) {
    if (!client.unlinkRichMenuFromUser) throw new Error('LINE client cannot restore the account default');
    await client.unlinkRichMenuFromUser(lineUserId);
  } else {
    await client.linkRichMenuToUser(lineUserId, richMenuId);
  }
}

/** A menu may be deleted after the preflight, or during a queued retry. Replace
 * only this exact restore generation; a newer operator choice or a reblock wins. */
async function recoverDeletedRestoreMenu(db: D1Database, friendId: string, accountId: string | null,
  richMenuId: string, generation: number, client: RichMenuClient, error: unknown,
  now: Date): Promise<{ queued: boolean; error: unknown }> {
  if (![400, 404].includes(lineStatus(error) ?? 0) || richMenuId === DEFAULT_RICH_MENU_ID || !accountId || !client.request) {
    return { queued: false, error };
  }
  const saved = await db.prepare('SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?')
    .bind(accountId, previousMenuKey(friendId)).first<{ value: string }>();
  if (!saved || (JSON.parse(saved.value) as { richMenuId: string | null }).richMenuId !== richMenuId) return { queued: false, error };
  try {
    await client.request('GET', `/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`);
    return { queued: false, error }; // Resource exists: never confuse a user 404.
  } catch (resourceError) {
    if (lineStatus(resourceError) !== 404) return { queued: false, error: resourceError };
  }
  const tags = await db.prepare('SELECT id, name FROM tags').all<{ id: string; name: string }>();
  const blockTagIds = tags.results.filter(t => isBlockTagName(t.name)).map(t => t.id);
  const nowIso = toJstString(now);
  await db.prepare(`UPDATE rich_menu_assignments
      SET desired_rich_menu_id = ?, generation = generation + 1, status = 'retry_wait',
        retry_count = 0, next_attempt_at = ?, verified_at = NULL,
        last_error = '元の個別メニューが削除されたため既定メニューへ戻します', updated_at = ?
    WHERE friend_id = ? AND line_account_id IS ? AND generation = ? AND desired_rich_menu_id = ?
      AND NOT EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = ?
        AND ft.tag_id IN (SELECT value FROM json_each(?)))`)
    .bind(DEFAULT_RICH_MENU_ID, nowIso, nowIso, friendId, accountId, generation, richMenuId,
      friendId, JSON.stringify(blockTagIds)).run();
  return { queued: true, error };
}

async function updateCurrentGeneration(
  db: D1Database,
  sql: string,
  binds: unknown[],
): Promise<number> {
  const result = await db.prepare(sql).bind(...binds).run();
  return result.meta?.changes ?? 0;
}

async function markStaleCompletionForRetry(
  db: D1Database,
  friendId: string,
  staleGeneration: number,
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE rich_menu_assignments
          SET status = 'pending', next_attempt_at = ?, updated_at = ?,
              last_error = '新しい表示指定を再適用します'
        WHERE friend_id = ? AND generation <> ?`,
    )
    .bind(nowIso, nowIso, friendId, staleGeneration)
    .run();
}

/**
 * Persist the desired menu first, then attempt the LINE call immediately.
 * The generation guard prevents an older request from committing over a newer
 * campaign tag. If the external calls finish out of order, the newest desired
 * state is put back on the retry queue.
 */
export async function applyDesiredRichMenu(
  db: D1Database,
  input: ApplyDesiredRichMenuInput,
): Promise<void> {
  if (!input.richMenuId) throw new Error('richMenuId is required for switch_rich_menu');

  const friend = await db
    .prepare('SELECT line_user_id, line_account_id FROM friends WHERE id = ?')
    .bind(input.friendId)
    .first<FriendTarget>();
  if (!friend?.line_user_id) throw new Error('LINE user not found for switch_rich_menu');
  if (input.lineAccountId !== undefined && input.lineAccountId !== friend.line_account_id) throw new BlockedFriendError();
  await assertAllowedRichMenu(db, input.friendId, input.richMenuId);

  const now = input.now ?? new Date();
  const nowIso = toJstString(now);
  const lineAccountId = input.lineAccountId ?? friend.line_account_id ?? null;
  const returned = await db
    .prepare(
      `INSERT INTO rich_menu_assignments
         (friend_id, line_account_id, automation_id, desired_rich_menu_id,
          source, status, retry_count, max_retries, next_attempt_at,
          last_attempt_at, verified_at, last_error, generation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'processing', 1, ?, NULL, ?, NULL, NULL, 1, ?, ?)
       ON CONFLICT(friend_id) DO UPDATE SET
         line_account_id = excluded.line_account_id,
         automation_id = excluded.automation_id,
         desired_rich_menu_id = excluded.desired_rich_menu_id,
         source = excluded.source,
         status = 'processing', retry_count = 1, max_retries = excluded.max_retries,
         next_attempt_at = NULL, last_attempt_at = excluded.last_attempt_at,
         verified_at = NULL, last_error = NULL,
         generation = rich_menu_assignments.generation + 1,
         updated_at = excluded.updated_at
       RETURNING generation`,
    )
    .bind(
      input.friendId,
      lineAccountId,
      input.automationId ?? null,
      input.richMenuId,
      input.source ?? 'automation',
      MAX_RETRIES,
      nowIso,
      nowIso,
      nowIso,
    )
    .first<{ generation: number }>();
  const generation = returned?.generation ?? 1;

  try {
    if (!input.lineAccessToken) {
      throw new Error('LINE account token is unavailable for switch_rich_menu');
    }
    await assertAllowedRichMenu(db, input.friendId, input.richMenuId);
    await applyMenuOperation(clientFor(input.lineAccessToken, input.clientFactory), friend.line_user_id, input.richMenuId);
    if (await repairLateNormalMenu(db, input.friendId, input.richMenuId, input.lineAccessToken, lineAccountId)) return;
    const changed = await updateCurrentGeneration(
      db,
      `UPDATE rich_menu_assignments
          SET status = 'applied', next_attempt_at = NULL, applied_at = ?,
              verified_at = ?, last_error = NULL, updated_at = ?
        WHERE friend_id = ? AND generation = ?`,
      [nowIso, nowIso, nowIso, input.friendId, generation],
    );
    if (changed === 0) {
      await markStaleCompletionForRetry(db, input.friendId, generation, nowIso);
    } else {
      await cleanupRestoredMenuBackup(db, input.friendId, lineAccountId, input.richMenuId, generation);
      await repairLateNormalMenu(db, input.friendId, input.richMenuId, input.lineAccessToken, lineAccountId);
    }
  } catch (error) {
    const recovery = input.lineAccessToken ? await recoverDeletedRestoreMenu(db, input.friendId, lineAccountId,
      input.richMenuId, generation, clientFor(input.lineAccessToken, input.clientFactory), error, now) : { queued: false, error };
    if (recovery.queued) throw error;
    const retryable = isRetryableRichMenuError(recovery.error);
    await updateCurrentGeneration(
      db,
      `UPDATE rich_menu_assignments
          SET status = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
        WHERE friend_id = ? AND generation = ?`,
      [
        retryable ? 'retry_wait' : 'failed_permanent',
        retryable ? retryAt(now, 1) : null,
        errorMessage(recovery.error).slice(0, 1000),
        nowIso,
        input.friendId,
        generation,
      ],
    );
    throw error;
  }
}

export async function processDueRichMenuAssignments(
  db: D1Database,
  params: {
    now: Date;
    limit?: number;
    clientFactory?: (token: string) => RichMenuClient;
  },
): Promise<{ applied: number; deferred: number; failedPermanent: number }> {
  const nowIso = toJstString(params.now);
  const staleBefore = toJstString(
    new Date(params.now.getTime() - STALE_PROCESSING_MINUTES * 60_000),
  );
  await db
    .prepare(
      `UPDATE rich_menu_assignments
          SET status = 'retry_wait', next_attempt_at = ?, updated_at = ?,
              last_error = '処理中断を検出したため再試行します'
        WHERE status = 'processing' AND last_attempt_at <= ?`,
    )
    .bind(nowIso, nowIso, staleBefore)
    .run();

  const limit = Math.max(1, Math.min(RETRY_LIMIT_PER_CRON, params.limit ?? RETRY_LIMIT_PER_CRON));
  const due = await db
    .prepare(
      `SELECT r.friend_id, r.line_account_id, r.desired_rich_menu_id,
              r.retry_count, r.max_retries, r.generation,
              f.line_user_id, la.channel_access_token
         FROM rich_menu_assignments r
         INNER JOIN friends f ON f.id = r.friend_id
         LEFT JOIN line_accounts la
           ON la.id = COALESCE(r.line_account_id, f.line_account_id)
        WHERE r.status IN ('pending', 'retry_wait')
          AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= ?)
        ORDER BY COALESCE(r.next_attempt_at, r.updated_at) ASC
        LIMIT ?`,
    )
    .bind(nowIso, limit)
    .all<DueAssignmentRow>();

  let applied = 0;
  let deferred = 0;
  let failedPermanent = 0;

  for (const row of due.results ?? []) {
    const nextAttempt = row.retry_count + 1;
    const claim = await db
      .prepare(
        `UPDATE rich_menu_assignments
            SET status = 'processing', retry_count = retry_count + 1,
                last_attempt_at = ?, updated_at = ?
          WHERE friend_id = ? AND generation = ? AND retry_count = ?
            AND status IN ('pending', 'retry_wait')`,
      )
      .bind(nowIso, nowIso, row.friend_id, row.generation, row.retry_count)
      .run();
    if ((claim.meta?.changes ?? 0) === 0) continue;

    try {
      if (!row.channel_access_token) {
        throw new Error('LINE account token is unavailable for switch_rich_menu');
      }
      await assertAllowedRichMenu(db, row.friend_id, row.desired_rich_menu_id);
      await applyMenuOperation(clientFor(row.channel_access_token, params.clientFactory), row.line_user_id, row.desired_rich_menu_id);
      if (await repairLateNormalMenu(db, row.friend_id, row.desired_rich_menu_id, row.channel_access_token, row.line_account_id)) { deferred += 1; continue; }
      const changed = await updateCurrentGeneration(
        db,
        `UPDATE rich_menu_assignments
            SET status = 'applied', next_attempt_at = NULL, applied_at = ?,
                verified_at = ?, last_error = NULL, updated_at = ?
          WHERE friend_id = ? AND generation = ?`,
        [nowIso, nowIso, nowIso, row.friend_id, row.generation],
      );
      if (changed === 0) {
        await markStaleCompletionForRetry(db, row.friend_id, row.generation, nowIso);
      } else {
        await cleanupRestoredMenuBackup(db, row.friend_id, row.line_account_id, row.desired_rich_menu_id, row.generation);
        if (await repairLateNormalMenu(db, row.friend_id, row.desired_rich_menu_id, row.channel_access_token, row.line_account_id)) { deferred += 1; continue; }
        applied += 1;
      }
    } catch (error) {
      const recovery = row.channel_access_token ? await recoverDeletedRestoreMenu(db, row.friend_id, row.line_account_id,
        row.desired_rich_menu_id, row.generation, clientFor(row.channel_access_token, params.clientFactory), error, params.now) : { queued: false, error };
      if (recovery.queued) { deferred += 1; continue; }
      const retryable = isRetryableRichMenuError(recovery.error);
      const exhausted = nextAttempt >= row.max_retries;
      const terminal = !retryable || exhausted;
      await updateCurrentGeneration(
        db,
        `UPDATE rich_menu_assignments
            SET status = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
          WHERE friend_id = ? AND generation = ?`,
        [
          terminal ? 'failed_permanent' : 'retry_wait',
          terminal ? null : retryAt(params.now, nextAttempt),
          errorMessage(recovery.error).slice(0, 1000),
          nowIso,
          row.friend_id,
          row.generation,
        ],
      );
      if (terminal) failedPermanent += 1;
      else deferred += 1;
    }
  }

  return { applied, deferred, failedPermanent };
}

/** Verify a rotating slice so 500 users are checked in roughly five days. */
export async function reconcileRichMenuAssignments(
  db: D1Database,
  params: {
    now: Date;
    limit?: number;
    clientFactory?: (token: string) => RichMenuClient;
  },
): Promise<{ verified: number; requeued: number; unavailable: number }> {
  const nowIso = toJstString(params.now);
  const cutoff = toJstString(new Date(params.now.getTime() - VERIFY_AFTER_DAYS * 86_400_000));
  const limit = Math.max(
    1,
    Math.min(VERIFY_LIMIT_PER_MAINTENANCE, params.limit ?? VERIFY_LIMIT_PER_MAINTENANCE),
  );
  const rows = await db
    .prepare(
      `SELECT r.friend_id, r.desired_rich_menu_id, r.generation,
              f.line_user_id, la.channel_access_token
         FROM rich_menu_assignments r
         INNER JOIN friends f ON f.id = r.friend_id
         LEFT JOIN line_accounts la
           ON la.id = COALESCE(r.line_account_id, f.line_account_id)
        WHERE r.status = 'applied'
          AND (r.verified_at IS NULL OR r.verified_at <= ?)
        ORDER BY COALESCE(r.verified_at, r.applied_at, r.created_at) ASC
        LIMIT ?`,
    )
    .bind(cutoff, limit)
    .all<VerifyAssignmentRow>();

  let verified = 0;
  let requeued = 0;
  let unavailable = 0;
  for (const row of rows.results ?? []) {
    try {
      await assertAllowedRichMenu(db, row.friend_id, row.desired_rich_menu_id);
      if (!row.channel_access_token) {
        throw new Error('LINE account token is unavailable for switch_rich_menu');
      }
      let current: { richMenuId: string };
      try {
        current = await clientFor(row.channel_access_token, params.clientFactory).getRichMenuIdOfUser(row.line_user_id);
      } catch (error) {
        // For a desired unlink, a missing *individual* assignment is success.
        // For normal menu IDs the existing 404 repair path is preserved.
        if (row.desired_rich_menu_id !== DEFAULT_RICH_MENU_ID || lineStatus(error) !== 404) throw error;
        current = { richMenuId: DEFAULT_RICH_MENU_ID };
      }
      if (current.richMenuId === row.desired_rich_menu_id) {
        await updateCurrentGeneration(
          db,
          `UPDATE rich_menu_assignments
              SET verified_at = ?, last_error = NULL, updated_at = ?
            WHERE friend_id = ? AND generation = ?`,
          [nowIso, nowIso, row.friend_id, row.generation],
        );
        verified += 1;
      } else {
        await updateCurrentGeneration(
          db,
          `UPDATE rich_menu_assignments
              SET status = 'pending', retry_count = 0, next_attempt_at = ?,
                  verified_at = ?, last_error = 'LINE上の表示との差異を検出しました',
                  updated_at = ?
            WHERE friend_id = ? AND generation = ?`,
          [nowIso, nowIso, nowIso, row.friend_id, row.generation],
        );
        requeued += 1;
      }
    } catch (error) {
      if (error instanceof BlockedFriendError) {
        await updateCurrentGeneration(db,
          `UPDATE rich_menu_assignments SET status = 'failed_permanent', next_attempt_at = NULL, last_error = 'FRIEND_BLOCKED', updated_at = ? WHERE friend_id = ? AND generation = ?`,
          [nowIso, row.friend_id, row.generation]);
        unavailable += 1;
        continue;
      }
      const status = lineStatus(error);
      if (status === 404) {
        await updateCurrentGeneration(
          db,
          `UPDATE rich_menu_assignments
              SET status = 'pending', retry_count = 0, next_attempt_at = ?,
                  verified_at = ?, last_error = '個別メニューが外れているため再適用します',
                  updated_at = ?
            WHERE friend_id = ? AND generation = ?`,
          [nowIso, nowIso, nowIso, row.friend_id, row.generation],
        );
        requeued += 1;
      } else {
        // Rotate to the next user even when LINE's read API is temporarily unavailable.
        await updateCurrentGeneration(
          db,
          `UPDATE rich_menu_assignments
              SET verified_at = ?, last_error = '定期照合を完了できませんでした', updated_at = ?
            WHERE friend_id = ? AND generation = ?`,
          [nowIso, nowIso, row.friend_id, row.generation],
        );
        unavailable += 1;
      }
    }
  }
  return { verified, requeued, unavailable };
}

export async function retryRichMenuAssignment(
  db: D1Database,
  friendId: string,
  now = new Date(),
): Promise<boolean> {
  const nowIso = toJstString(now);
  const result = await db
    .prepare(
      `UPDATE rich_menu_assignments
          SET status = 'pending', retry_count = 0, next_attempt_at = ?,
              last_error = NULL, updated_at = ?
        WHERE friend_id = ?`,
    )
    .bind(nowIso, nowIso, friendId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function retryFailedRichMenuAssignments(
  db: D1Database,
  lineAccountId: string,
  now = new Date(),
): Promise<number> {
  const nowIso = toJstString(now);
  const result = await db
    .prepare(
      `UPDATE rich_menu_assignments
          SET status = 'pending', retry_count = 0, next_attempt_at = ?,
              last_error = NULL, updated_at = ?
        WHERE friend_id IN (
          SELECT friend_id FROM rich_menu_assignments
           WHERE line_account_id = ? AND status = 'failed_permanent'
           ORDER BY updated_at ASC LIMIT 500
        )`,
    )
    .bind(nowIso, nowIso, lineAccountId)
    .run();
  return result.meta?.changes ?? 0;
}

export async function clearDesiredRichMenuAssignment(
  db: D1Database,
  friendId: string,
): Promise<void> {
  if (await isFriendBlocked(db, friendId)) throw new BlockedFriendError();
  await db.prepare('DELETE FROM rich_menu_assignments WHERE friend_id = ?').bind(friendId).run();
}

export const _internals = {
  MAX_RETRIES,
  RETRY_LIMIT_PER_CRON,
  VERIFY_LIMIT_PER_MAINTENANCE,
  BACKOFF_MINUTES,
  lineStatus,
  retryAt,
};
