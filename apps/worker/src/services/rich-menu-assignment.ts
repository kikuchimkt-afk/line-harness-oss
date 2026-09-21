import { toJstString } from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';

export type RichMenuAssignmentSource = 'automation' | 'manual' | 'backfill';
export type RichMenuAssignmentStatus =
  | 'pending'
  | 'retry_wait'
  | 'processing'
  | 'applied'
  | 'failed_permanent';

type RichMenuClient = Pick<LineClient, 'linkRichMenuToUser' | 'getRichMenuIdOfUser'>;

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
    await clientFor(input.lineAccessToken, input.clientFactory).linkRichMenuToUser(
      friend.line_user_id,
      input.richMenuId,
    );
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
    }
  } catch (error) {
    const retryable = isRetryableRichMenuError(error);
    await updateCurrentGeneration(
      db,
      `UPDATE rich_menu_assignments
          SET status = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
        WHERE friend_id = ? AND generation = ?`,
      [
        retryable ? 'retry_wait' : 'failed_permanent',
        retryable ? retryAt(now, 1) : null,
        errorMessage(error).slice(0, 1000),
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
      await clientFor(row.channel_access_token, params.clientFactory).linkRichMenuToUser(
        row.line_user_id,
        row.desired_rich_menu_id,
      );
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
        applied += 1;
      }
    } catch (error) {
      const retryable = isRetryableRichMenuError(error);
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
          errorMessage(error).slice(0, 1000),
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
      if (!row.channel_access_token) {
        throw new Error('LINE account token is unavailable for switch_rich_menu');
      }
      const current = await clientFor(
        row.channel_access_token,
        params.clientFactory,
      ).getRichMenuIdOfUser(row.line_user_id);
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
