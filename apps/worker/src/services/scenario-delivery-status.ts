export const DEFAULT_SCENARIO_DELIVERY_STATUS_LIMIT = 200;
export const MAX_SCENARIO_DELIVERY_STATUS_LIMIT = 500;

export interface ScenarioSentDelivery {
  id: string;
  friendId: string;
  displayName: string;
  pictureUrl: string | null;
  stepOrder: number;
  sentAt: string;
  messageType: string;
  sendCount: number;
}

export interface ScenarioUpcomingDelivery {
  enrollmentId: string;
  friendId: string;
  displayName: string;
  pictureUrl: string | null;
  status: 'active' | 'delivering';
  startedAt: string;
  nextDeliveryAt: string;
  updatedAt: string;
  nextStepOrder: number;
  messageType: string;
}

export interface ScenarioDeliveryStatus {
  generatedAt: string;
  sentMessageTotal: number;
  sentDeliveryTotal: number;
  sentRecipientTotal: number;
  upcomingRecipientTotal: number;
  sentHasMore: boolean;
  upcomingHasMore: boolean;
  sent: ScenarioSentDelivery[];
  upcoming: ScenarioUpcomingDelivery[];
}

interface SentCountRow {
  message_count: number;
  delivery_count: number;
  recipient_count: number;
}

interface UpcomingCountRow {
  recipient_count: number;
}

interface SentDeliveryRow {
  friend_id: string;
  display_name: string | null;
  picture_url: string | null;
  step_id: string;
  step_order: number;
  sent_at: string;
  message_type: string;
  send_count: number;
}

interface UpcomingDeliveryRow {
  enrollment_id: string;
  friend_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: 'active' | 'delivering';
  started_at: string;
  next_delivery_at: string;
  updated_at: string;
  next_step_order: number;
  message_type: string;
}

export function normalizeScenarioDeliveryStatusLimit(raw: string | number | undefined): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SCENARIO_DELIVERY_STATUS_LIMIT;
  return Math.min(MAX_SCENARIO_DELIVERY_STATUS_LIMIT, Math.max(1, Math.floor(parsed)));
}

/**
 * Return the durable successful-send history and the authoritative next-send queue.
 *
 * A send is complete only after step-delivery writes an outgoing scenario row
 * to messages_log. The upcoming list mirrors the delivery worker: an
 * active/delivering enrollment, a following friend, a non-null schedule, and
 * the first step whose order is greater than current_step_order.
 */
export async function getScenarioDeliveryStatus(
  db: D1Database,
  scenarioId: string,
  rawLimit?: string | number,
): Promise<ScenarioDeliveryStatus> {
  const limit = normalizeScenarioDeliveryStatusLimit(rawLimit);
  const fetchLimit = limit + 1;

  const sentCount = await db
    .prepare(
      `SELECT COUNT(*) AS message_count,
              COUNT(DISTINCT ml.friend_id || ':' || ss.id) AS delivery_count,
              COUNT(DISTINCT ml.friend_id) AS recipient_count
       FROM messages_log ml
       INNER JOIN scenario_steps ss ON ss.id = ml.scenario_step_id
       INNER JOIN scenarios s ON s.id = ss.scenario_id
       INNER JOIN friends f ON f.id = ml.friend_id
       WHERE ss.scenario_id = ?
         AND ml.direction = 'outgoing'
         AND ml.source = 'scenario'
         AND (ml.delivery_type IS NULL OR ml.delivery_type != 'test')
         AND (s.line_account_id IS NULL OR f.line_account_id = s.line_account_id)`,
    )
    .bind(scenarioId)
    .first<SentCountRow>();

  const upcomingCount = await db
    .prepare(
      `SELECT COUNT(*) AS recipient_count
       FROM friend_scenarios fs
       INNER JOIN friends f ON f.id = fs.friend_id
       INNER JOIN scenarios s ON s.id = fs.scenario_id
       WHERE fs.scenario_id = ?
         AND fs.status IN ('active', 'delivering')
         AND fs.next_delivery_at IS NOT NULL
         AND s.is_active = 1
         AND f.is_following = 1
         AND (s.line_account_id IS NULL OR f.line_account_id = s.line_account_id)
         AND EXISTS (
           SELECT 1
           FROM scenario_steps next_ss
           WHERE next_ss.scenario_id = fs.scenario_id
             AND next_ss.step_order > fs.current_step_order
         )`,
    )
    .bind(scenarioId)
    .first<UpcomingCountRow>();

  const sentResult = await db
    .prepare(
      `WITH ranked_deliveries AS (
         SELECT ml.id,
                ml.friend_id,
                f.display_name,
                f.picture_url,
                ss.id AS step_id,
                ss.step_order,
                ml.created_at AS sent_at,
                ml.message_type,
                COUNT(*) OVER (
                  PARTITION BY ml.friend_id, ss.id
                ) AS send_count,
                ROW_NUMBER() OVER (
                  PARTITION BY ml.friend_id, ss.id
                  ORDER BY julianday(ml.created_at) DESC, ml.id DESC
                ) AS delivery_rank
         FROM messages_log ml
         INNER JOIN scenario_steps ss ON ss.id = ml.scenario_step_id
         INNER JOIN scenarios s ON s.id = ss.scenario_id
         INNER JOIN friends f ON f.id = ml.friend_id
         WHERE ss.scenario_id = ?
           AND ml.direction = 'outgoing'
           AND ml.source = 'scenario'
           AND (ml.delivery_type IS NULL OR ml.delivery_type != 'test')
           AND (s.line_account_id IS NULL OR f.line_account_id = s.line_account_id)
       )
       SELECT friend_id,
              display_name,
              picture_url,
              step_id,
              step_order,
              sent_at,
              message_type,
              send_count
       FROM ranked_deliveries
       WHERE delivery_rank = 1
       ORDER BY julianday(sent_at) DESC, friend_id ASC, step_order ASC
       LIMIT ?`,
    )
    .bind(scenarioId, fetchLimit)
    .all<SentDeliveryRow>();

  const upcomingResult = await db
    .prepare(
      `SELECT fs.id AS enrollment_id,
              fs.friend_id,
              f.display_name,
              f.picture_url,
              fs.status,
              fs.started_at,
              fs.next_delivery_at,
              fs.updated_at,
              next_ss.step_order AS next_step_order,
              next_ss.message_type
       FROM friend_scenarios fs
       INNER JOIN friends f ON f.id = fs.friend_id
       INNER JOIN scenarios s ON s.id = fs.scenario_id
       INNER JOIN scenario_steps next_ss
         ON next_ss.scenario_id = fs.scenario_id
        AND next_ss.step_order = (
          SELECT MIN(candidate.step_order)
          FROM scenario_steps candidate
          WHERE candidate.scenario_id = fs.scenario_id
            AND candidate.step_order > fs.current_step_order
        )
       WHERE fs.scenario_id = ?
         AND fs.status IN ('active', 'delivering')
         AND fs.next_delivery_at IS NOT NULL
         AND s.is_active = 1
         AND f.is_following = 1
         AND (s.line_account_id IS NULL OR f.line_account_id = s.line_account_id)
       ORDER BY julianday(fs.next_delivery_at) ASC,
                julianday(fs.started_at) ASC,
                fs.id ASC
       LIMIT ?`,
    )
    .bind(scenarioId, fetchLimit)
    .all<UpcomingDeliveryRow>();

  const sentHasMore = sentResult.results.length > limit;
  const upcomingHasMore = upcomingResult.results.length > limit;

  return {
    generatedAt: new Date().toISOString(),
    sentMessageTotal: sentCount?.message_count ?? 0,
    sentDeliveryTotal: sentCount?.delivery_count ?? 0,
    sentRecipientTotal: sentCount?.recipient_count ?? 0,
    upcomingRecipientTotal: upcomingCount?.recipient_count ?? 0,
    sentHasMore,
    upcomingHasMore,
    sent: sentResult.results.slice(0, limit).map((row) => ({
      id: `${row.friend_id}:${row.step_id}`,
      friendId: row.friend_id,
      displayName: row.display_name?.trim() || '名前未設定',
      pictureUrl: row.picture_url,
      stepOrder: row.step_order,
      sentAt: row.sent_at,
      messageType: row.message_type,
      sendCount: row.send_count,
    })),
    upcoming: upcomingResult.results.slice(0, limit).map((row) => ({
      enrollmentId: row.enrollment_id,
      friendId: row.friend_id,
      displayName: row.display_name?.trim() || '名前未設定',
      pictureUrl: row.picture_url,
      status: row.status,
      startedAt: row.started_at,
      nextDeliveryAt: row.next_delivery_at,
      updatedAt: row.updated_at,
      nextStepOrder: row.next_step_order,
      messageType: row.message_type,
    })),
  };
}
