import { computeNextDeliveryAt, getScenarioById, jstNow, type EntryRoute } from '@line-crm/db';

export const PENDING_REF_TTL_MS = 24 * 60 * 60_000;

type PendingRef = {
  line_account_id: string;
  line_user_id: string;
  entry_route_id: string;
  ref_code: string;
  created_at: number;
  expires_at: number;
};

/**
 * A verified Login channel is not enough to trust a client-supplied ref.
 * The active route must actually lead to that Official Account. A configured
 * pool takes precedence; its legacy active_account_id fallback is allowed only
 * when it has no pool_accounts rows (matching /auth/line).
 * Unscoped legacy routes cannot be saved before follow.
 */
export async function getAccountScopedEntryRoute(
  db: D1Database,
  ref: string,
  lineAccountId: string | null,
): Promise<EntryRoute | null> {
  if (!lineAccountId || !ref || ref.startsWith('xh:') || ref.length > 200) return null;
  return db.prepare(`
    SELECT er.* FROM entry_routes er
    WHERE er.ref_code = ? AND er.is_active = 1
      AND EXISTS (SELECT 1 FROM line_accounts la WHERE la.id = ? AND la.is_active = 1)
      AND (
        (er.pool_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM traffic_pools tp WHERE tp.id = er.pool_id AND tp.is_active = 1
            AND (
              EXISTS (SELECT 1 FROM pool_accounts pa
                WHERE pa.pool_id = tp.id AND pa.line_account_id = ? AND pa.is_active = 1)
              OR (tp.active_account_id = ? AND NOT EXISTS (
                SELECT 1 FROM pool_accounts pa WHERE pa.pool_id = tp.id))
            )
        ))
        OR (er.pool_id IS NULL AND EXISTS (
          SELECT 1 FROM scenarios s WHERE s.id = er.scenario_id AND s.line_account_id = ?
        ))
      )
      AND (er.scenario_id IS NULL OR EXISTS (
        SELECT 1 FROM scenarios s WHERE s.id = er.scenario_id AND s.is_active = 1
          AND (s.line_account_id IS NULL OR s.line_account_id = ?)
      ))
  `).bind(ref, lineAccountId, lineAccountId, lineAccountId, lineAccountId, lineAccountId)
    .first<EntryRoute>();
}

export async function cleanupExpiredPendingRefs(
  db: D1Database,
  now = Date.now(),
): Promise<void> {
  await db.prepare('DELETE FROM liff_pending_ref_attributions WHERE expires_at <= ?')
    .bind(now).run();
}

/** Durable server-side proof of this route's pre-follow first touch. */
export async function hasPendingRefTracking(
  db: D1Database,
  friendId: string,
  lineAccountId: string | null | undefined,
  ref: string,
): Promise<boolean> {
  if (!lineAccountId || !ref || ref.startsWith('xh:')) return false;
  const row = await db.prepare(`
    SELECT 1 FROM ref_tracking rt
    JOIN friends f ON f.id = rt.friend_id
    JOIN entry_routes er ON er.id = rt.entry_route_id AND er.ref_code = rt.ref_code
    WHERE f.id = ? AND f.line_account_id = ? AND f.ref_code = rt.ref_code
      AND rt.ref_code = ? AND rt.id LIKE 'liff-pending:%'
    LIMIT 1
  `).bind(friendId, lineAccountId, ref).first();
  return Boolean(row);
}

/**
 * The follow/cron pipeline owns pending-route delivery. Enrollment is atomic
 * even against a concurrent Cron completion: any existing active, paused or
 * completed history prevents silently restarting the same first-touch run.
 */
export async function enrollPendingEntryScenarioOnce(
  db: D1Database,
  friendId: string,
  scenarioId: string,
  lineAccountId: string | null | undefined,
): Promise<boolean> {
  if (!lineAccountId) return false;
  const scenario = await getScenarioById(db, scenarioId);
  if (!scenario?.is_active || (scenario.line_account_id && scenario.line_account_id !== lineAccountId)) return false;
  const firstStep = scenario.steps[0];
  const now = jstNow();
  const clock = new Date(Date.now() + 9 * 60 * 60_000);
  const next = firstStep ? computeNextDeliveryAt(
    { delivery_mode: scenario.delivery_mode ?? 'relative' }, firstStep,
    { enrolledAt: clock, previousDeliveredAt: clock, now: clock },
  ).toISOString().slice(0, -1) + '+09:00' : null;
  const result = await db.prepare(`
    INSERT OR IGNORE INTO friend_scenarios
      (id, friend_id, scenario_id, current_step_order, status, started_at, next_delivery_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM friends f WHERE f.id = ? AND f.line_account_id = ? AND f.is_following = 1)
      AND NOT EXISTS (SELECT 1 FROM friend_scenarios fs WHERE fs.friend_id = ? AND fs.scenario_id = ?)
  `).bind(crypto.randomUUID(), friendId, scenarioId, firstStep ? -1 : 0,
    firstStep ? 'active' : 'completed', now, next, now,
    friendId, lineAccountId, friendId, scenarioId).run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Save before showing the friend-add button. No friends/user row or message. */
export async function savePendingRefAttribution(
  db: D1Database,
  lineAccountId: string | null,
  lineUserId: string,
  ref: string,
  now = Date.now(),
): Promise<boolean> {
  const route = await getAccountScopedEntryRoute(db, ref, lineAccountId);
  if (!route || !lineAccountId || !lineUserId) return false;

  await cleanupExpiredPendingRefs(db, now);
  // A live pending row wins first touch. Repeated page loads neither replace
  // it with a different ref nor extend its 24-hour lifetime.
  await db.prepare(`
    INSERT INTO liff_pending_ref_attributions
      (line_account_id, line_user_id, entry_route_id, ref_code, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (line_account_id, line_user_id) DO NOTHING
  `).bind(lineAccountId, lineUserId, route.id, route.ref_code, now, now + PENDING_REF_TTL_MS).run();
  return true;
}

/**
 * Claim the saved ref only after follow upsert. The conditional UPDATE is the
 * arbitration point for concurrent follow/link requests: only one changes a
 * NULL first-touch ref. A later LIFF visit cannot overwrite an existing ref.
 * If processing fails after the UPDATE, the ref survives on friends and the
 * normal webhook replay still enrolls/tags idempotently.
 */
export async function recoverPendingRefAttribution(
  db: D1Database,
  friend: { id: string; line_account_id?: string | null },
  lineAccountId: string | null,
  lineUserId: string,
  now = Date.now(),
): Promise<string | null> {
  if (!lineAccountId || friend.line_account_id !== lineAccountId) return null;
  const pending = await db.prepare(`
    SELECT * FROM liff_pending_ref_attributions
    WHERE line_account_id = ? AND line_user_id = ?
  `).bind(lineAccountId, lineUserId).first<PendingRef>();
  if (!pending) return null;

  const discard = () => db.prepare(`
    DELETE FROM liff_pending_ref_attributions
    WHERE line_account_id = ? AND line_user_id = ? AND entry_route_id = ? AND created_at = ?
  `).bind(lineAccountId, lineUserId, pending.entry_route_id, pending.created_at).run();
  if (pending.expires_at <= now) {
    await discard();
    return null;
  }
  // Operators may pause/move a route after the LIFF request. Revalidate on
  // follow rather than trusting yesterday's pool/scenario membership.
  const route = await getAccountScopedEntryRoute(db, pending.ref_code, lineAccountId);
  if (!route || route.id !== pending.entry_route_id) {
    await discard();
    return null;
  }

  const claimStatement = db.prepare(`
    UPDATE friends SET ref_code = ?
    WHERE id = ? AND line_account_id = ? AND line_user_id = ?
      AND is_following = 1 AND ref_code IS NULL
      AND EXISTS (SELECT 1 FROM liff_pending_ref_attributions p
        WHERE p.line_account_id = ? AND p.line_user_id = ?
          AND p.entry_route_id = ? AND p.created_at = ? AND p.expires_at > ?)
    RETURNING ref_code
  `).bind(pending.ref_code, friend.id, lineAccountId, lineUserId,
    lineAccountId, lineUserId, pending.entry_route_id, pending.created_at, now);
  // D1 batch is transactional. First touch and its tracking record either
  // both commit or both roll back. A deterministic ID deduplicates retries.
  const trackingKey = new TextEncoder().encode(JSON.stringify([lineAccountId, lineUserId, pending.created_at]));
  const trackingDigest = await crypto.subtle.digest('SHA-256', trackingKey);
  const trackingId = 'liff-pending:' + Array.from(new Uint8Array(trackingDigest),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
  const claimResults = await db.batch([
    claimStatement,
    db.prepare(`
      INSERT OR IGNORE INTO ref_tracking
        (id, ref_code, friend_id, entry_route_id, source_url, created_at)
      SELECT ?, p.ref_code, f.id, p.entry_route_id, NULL, ?
      FROM liff_pending_ref_attributions p JOIN friends f
        ON f.line_account_id = p.line_account_id AND f.line_user_id = p.line_user_id
      WHERE f.id = ? AND f.is_following = 1 AND f.ref_code = p.ref_code
        AND p.line_account_id = ? AND p.line_user_id = ?
        AND p.entry_route_id = ? AND p.created_at = ? AND p.expires_at > ?
    `).bind(trackingId,
      new Date(now + 9 * 60 * 60_000).toISOString().slice(0, -1) + '+09:00',
      friend.id, lineAccountId, lineUserId, pending.entry_route_id, pending.created_at, now),
  ]);
  const claimed = claimResults[0]?.results?.[0] as { ref_code: string } | undefined;
  // Do not discard a row if called on a not-yet-following friend. A follow
  // arriving immediately afterwards still needs to be able to recover it.
  const following = await db.prepare(`
    SELECT ref_code FROM friends
    WHERE id = ? AND line_account_id = ? AND line_user_id = ? AND is_following = 1
  `).bind(friend.id, lineAccountId, lineUserId).first<{ ref_code: string | null }>();
  if (following?.ref_code) await discard();
  return claimed?.ref_code ?? following?.ref_code ?? null;
}
