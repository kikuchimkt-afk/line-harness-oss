import { jstNow, toJstString } from './utils.js';
import { computeNextDeliveryAt } from './scenario-schedule.js';
export type ScenarioTriggerType = 'friend_add' | 'tag_added' | 'manual';
export type MessageType = 'text' | 'image' | 'flex';
export type FriendScenarioStatus = 'active' | 'delivering' | 'paused' | 'completed';
export type DeliveryMode = 'relative' | 'elapsed' | 'absolute_time';

export interface Scenario {
  id: string;
  name: string;
  description: string | null;
  trigger_type: ScenarioTriggerType;
  trigger_tag_id: string | null;
  line_account_id: string | null;
  is_active: number;
  delivery_mode: DeliveryMode;
  created_at: string;
  updated_at: string;
}

export interface ScenarioStep {
  id: string;
  scenario_id: string;
  step_order: number;
  delay_minutes: number;
  message_type: MessageType;
  message_content: string;
  condition_type: string | null;
  condition_value: string | null;
  next_step_on_false: number | null;
  offset_days: number | null;
  offset_minutes: number | null;
  delivery_time: string | null;
  template_id: string | null;
  on_reach_tag_id: string | null;
  created_at: string;
}

export interface ScenarioWithSteps extends Scenario {
  steps: ScenarioStep[];
}

export interface FriendScenario {
  id: string;
  friend_id: string;
  scenario_id: string;
  current_step_order: number;
  status: FriendScenarioStatus;
  started_at: string;
  next_delivery_at: string | null;
  updated_at: string;
}

export type ManualScenarioStartTiming = 'configured' | 'next_cron';

export interface ManualScenarioStartState {
  enrollment: FriendScenario | null;
  current_next_step: ScenarioStep | null;
  sent_step_orders: number[];
  /**
   * Opaque optimistic-lock token. Callers must send this value back when
   * changing the position so an operator cannot overwrite a delivery that
   * moved after the confirmation screen was opened.
   */
  state_version: string;
}

export type ManualScenarioStartAction = 'created' | 'resumed' | 'repositioned';

export type ManualScenarioStartResult =
  | {
      ok: true;
      action: ManualScenarioStartAction;
      enrollment: FriendScenario;
      start_step: ScenarioStep;
      previous_step_order: number;
      sent_step_orders: number[];
      state_version: string;
    }
  | { ok: false; reason: 'step_not_found' | 'state_changed' | 'delivery_in_progress' };

// ============================================================
// Scenario CRUD
// ============================================================

export type ScenarioWithStepCount = Scenario & { step_count: number };

export async function getScenarios(db: D1Database): Promise<ScenarioWithStepCount[]> {
  const result = await db
    .prepare(
      `SELECT s.*, COUNT(ss.id) as step_count
       FROM scenarios s
       LEFT JOIN scenario_steps ss ON s.id = ss.scenario_id
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
    )
    .all<ScenarioWithStepCount>();
  return result.results;
}

export async function getScenarioById(
  db: D1Database,
  id: string,
): Promise<ScenarioWithSteps | null> {
  const scenario = await db
    .prepare(`SELECT * FROM scenarios WHERE id = ?`)
    .bind(id)
    .first<Scenario>();

  if (!scenario) return null;

  const stepsResult = await db
    .prepare(
      `SELECT * FROM scenario_steps WHERE scenario_id = ? ORDER BY step_order ASC`,
    )
    .bind(id)
    .all<ScenarioStep>();

  return { ...scenario, steps: stepsResult.results };
}

export interface CreateScenarioInput {
  name: string;
  description?: string | null;
  triggerType: ScenarioTriggerType;
  triggerTagId?: string | null;
  deliveryMode?: DeliveryMode;
}

export async function createScenario(
  db: D1Database,
  input: CreateScenarioInput,
): Promise<Scenario> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO scenarios (id, name, description, trigger_type, trigger_tag_id, is_active, delivery_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.description ?? null,
      input.triggerType,
      input.triggerTagId ?? null,
      input.deliveryMode ?? 'relative',
      now,
      now,
    )
    .run();

  return (await db
    .prepare(`SELECT * FROM scenarios WHERE id = ?`)
    .bind(id)
    .first<Scenario>())!;
}

export type UpdateScenarioInput = Partial<
  Pick<Scenario, 'name' | 'description' | 'trigger_type' | 'trigger_tag_id' | 'is_active'>
>;

export async function updateScenario(
  db: D1Database,
  id: string,
  updates: UpdateScenarioInput,
): Promise<Scenario | null> {
  const now = jstNow();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.trigger_type !== undefined) {
    fields.push('trigger_type = ?');
    values.push(updates.trigger_type);
  }
  if (updates.trigger_tag_id !== undefined) {
    fields.push('trigger_tag_id = ?');
    values.push(updates.trigger_tag_id);
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active);
  }

  if (fields.length === 0) {
    return db
      .prepare(`SELECT * FROM scenarios WHERE id = ?`)
      .bind(id)
      .first<Scenario>();
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  await db
    .prepare(`UPDATE scenarios SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return db
    .prepare(`SELECT * FROM scenarios WHERE id = ?`)
    .bind(id)
    .first<Scenario>();
}

export async function deleteScenario(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM scenarios WHERE id = ?`).bind(id).run();
}

// ============================================================
// Scenario Steps
// ============================================================

export interface CreateScenarioStepInput {
  scenarioId: string;
  stepOrder: number;
  delayMinutes?: number;
  messageType: MessageType;
  messageContent: string;
  conditionType?: string | null;
  conditionValue?: string | null;
  nextStepOnFalse?: number | null;
  offsetDays?: number | null;
  offsetMinutes?: number | null;
  deliveryTime?: string | null;
  templateId?: string | null;
  onReachTagId?: string | null;
}

export async function createScenarioStep(
  db: D1Database,
  input: CreateScenarioStepInput,
): Promise<ScenarioStep> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO scenario_steps
       (id, scenario_id, step_order, delay_minutes, message_type, message_content,
        condition_type, condition_value, next_step_on_false,
        offset_days, offset_minutes, delivery_time,
        template_id, on_reach_tag_id,
        created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.scenarioId,
      input.stepOrder,
      input.delayMinutes ?? 0,
      input.messageType,
      input.messageContent,
      input.conditionType ?? null,
      input.conditionValue ?? null,
      input.nextStepOnFalse ?? null,
      input.offsetDays ?? null,
      input.offsetMinutes ?? null,
      input.deliveryTime ?? null,
      input.templateId ?? null,
      input.onReachTagId ?? null,
      now,
    )
    .run();

  return (await db
    .prepare(`SELECT * FROM scenario_steps WHERE id = ?`)
    .bind(id)
    .first<ScenarioStep>())!;
}

export type UpdateScenarioStepInput = Partial<
  Pick<
    ScenarioStep,
    | 'step_order'
    | 'delay_minutes'
    | 'message_type'
    | 'message_content'
    | 'condition_type'
    | 'condition_value'
    | 'next_step_on_false'
    | 'offset_days'
    | 'offset_minutes'
    | 'delivery_time'
    | 'template_id'
    | 'on_reach_tag_id'
  >
>;

export async function updateScenarioStep(
  db: D1Database,
  id: string,
  updates: UpdateScenarioStepInput,
): Promise<ScenarioStep | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.step_order !== undefined) {
    fields.push('step_order = ?');
    values.push(updates.step_order);
  }
  if (updates.delay_minutes !== undefined) {
    fields.push('delay_minutes = ?');
    values.push(updates.delay_minutes);
  }
  if (updates.message_type !== undefined) {
    fields.push('message_type = ?');
    values.push(updates.message_type);
  }
  if (updates.message_content !== undefined) {
    fields.push('message_content = ?');
    values.push(updates.message_content);
  }
  if (updates.condition_type !== undefined) {
    fields.push('condition_type = ?');
    values.push(updates.condition_type);
  }
  if (updates.condition_value !== undefined) {
    fields.push('condition_value = ?');
    values.push(updates.condition_value);
  }
  if (updates.next_step_on_false !== undefined) {
    fields.push('next_step_on_false = ?');
    values.push(updates.next_step_on_false);
  }
  if (updates.offset_days !== undefined) {
    fields.push('offset_days = ?');
    values.push(updates.offset_days);
  }
  if (updates.offset_minutes !== undefined) {
    fields.push('offset_minutes = ?');
    values.push(updates.offset_minutes);
  }
  if (updates.delivery_time !== undefined) {
    fields.push('delivery_time = ?');
    values.push(updates.delivery_time);
  }
  if (updates.template_id !== undefined) {
    fields.push('template_id = ?');
    values.push(updates.template_id);
  }
  if (updates.on_reach_tag_id !== undefined) {
    fields.push('on_reach_tag_id = ?');
    values.push(updates.on_reach_tag_id);
  }

  if (fields.length > 0) {
    values.push(id);
    await db
      .prepare(`UPDATE scenario_steps SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  return db
    .prepare(`SELECT * FROM scenario_steps WHERE id = ?`)
    .bind(id)
    .first<ScenarioStep>();
}

export async function deleteScenarioStep(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM scenario_steps WHERE id = ?`).bind(id).run();
}

export async function getScenarioSteps(
  db: D1Database,
  scenarioId: string,
): Promise<ScenarioStep[]> {
  const result = await db
    .prepare(
      `SELECT * FROM scenario_steps WHERE scenario_id = ? ORDER BY step_order ASC`,
    )
    .bind(scenarioId)
    .all<ScenarioStep>();
  return result.results;
}

// ============================================================
// Friend Scenario Enrollments
// ============================================================

export async function enrollFriendInScenario(
  db: D1Database,
  friendId: string,
  scenarioId: string,
): Promise<FriendScenario | null> {
  const id = crypto.randomUUID();
  const now = jstNow();

  // delivery_mode を取得（migration 037 適用前の DB では 'relative' が DEFAULT で既に入っている）
  const scenarioRow = await db
    .prepare(`SELECT delivery_mode FROM scenarios WHERE id = ?`)
    .bind(scenarioId)
    .first<{ delivery_mode: DeliveryMode }>();
  if (!scenarioRow) return null;

  const firstStep = await db
    .prepare(
      `SELECT step_order, delay_minutes, offset_days, offset_minutes, delivery_time
       FROM scenario_steps WHERE scenario_id = ? ORDER BY step_order ASC LIMIT 1`,
    )
    .bind(scenarioId)
    .first<{
      step_order: number;
      delay_minutes: number;
      offset_days: number | null;
      offset_minutes: number | null;
      delivery_time: string | null;
    }>();

  // A scenario with no steps is immediately completed — no stuck active enrollment.
  if (!firstStep) {
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO friend_scenarios (id, friend_id, scenario_id, current_step_order, status, started_at, next_delivery_at, updated_at)
         VALUES (?, ?, ?, 0, 'completed', ?, NULL, ?)`,
      )
      .bind(id, friendId, scenarioId, now, now)
      .run();

    if (!result.meta.changes || result.meta.changes === 0) return null;

    return (await db
      .prepare(`SELECT * FROM friend_scenarios WHERE id = ?`)
      .bind(id)
      .first<FriendScenario>())!;
  }

  const enrolledAtDate = new Date(Date.now() + 9 * 60 * 60_000);
  const nextDeliveryDate = computeNextDeliveryAt(
    { delivery_mode: scenarioRow.delivery_mode },
    firstStep,
    { enrolledAt: enrolledAtDate, previousDeliveredAt: enrolledAtDate, now: enrolledAtDate },
  );
  const nextDeliveryAt = nextDeliveryDate.toISOString().slice(0, -1) + '+09:00';

  // current_step_order is initialized to -1 (NOT 0) so that the step-delivery
  // service's `steps.find(s => s.step_order > fs.current_step_order)` lookup
  // matches the very first step (step_order=0).
  // If we initialize to 0, scenarios that only have a step_order=0 step are
  // silently completed without delivering anything (because no step has
  // step_order > 0). This was observed in production on 2026-04-27 where
  // ~10 friend_scenarios silently completed for a 46-hour window.
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO friend_scenarios (id, friend_id, scenario_id, current_step_order, status, started_at, next_delivery_at, updated_at)
       VALUES (?, ?, ?, -1, 'active', ?, ?, ?)`,
    )
    .bind(id, friendId, scenarioId, now, nextDeliveryAt, now)
    .run();

  if (!result.meta.changes || result.meta.changes === 0) return null;

  return (await db
    .prepare(`SELECT * FROM friend_scenarios WHERE id = ?`)
    .bind(id)
    .first<FriendScenario>())!;
}

function manualStartStateVersion(enrollment: FriendScenario | null): string {
  if (!enrollment) return 'none';
  return [
    enrollment.id,
    enrollment.status,
    String(enrollment.current_step_order),
    enrollment.started_at,
    enrollment.next_delivery_at ?? '',
    enrollment.updated_at,
  ].map(encodeURIComponent).join('.');
}

/**
 * Read the operator-facing state used before manually positioning a friend in
 * a scenario. Message history is deliberately independent from the active run:
 * repositioning never deletes or fabricates previously delivered steps.
 */
export async function getManualScenarioStartState(
  db: D1Database,
  scenarioId: string,
  friendId: string,
): Promise<ManualScenarioStartState> {
  const enrollment = await db
    .prepare(
      `SELECT * FROM friend_scenarios
       WHERE friend_id = ? AND scenario_id = ? AND status != 'completed'
       ORDER BY started_at DESC, id DESC
       LIMIT 1`,
    )
    .bind(friendId, scenarioId)
    .first<FriendScenario>();

  const currentNextStep = enrollment
    ? await db
      .prepare(
        `SELECT * FROM scenario_steps
         WHERE scenario_id = ? AND step_order > ?
         ORDER BY step_order ASC
         LIMIT 1`,
      )
      .bind(scenarioId, enrollment.current_step_order)
      .first<ScenarioStep>()
    : null;

  const sentRows = await db
    .prepare(
      `SELECT DISTINCT ss.step_order
       FROM messages_log ml
       INNER JOIN scenario_steps ss ON ss.id = ml.scenario_step_id
       WHERE ml.friend_id = ?
         AND ml.direction = 'outgoing'
         AND ss.scenario_id = ?
       ORDER BY ss.step_order ASC`,
    )
    .bind(friendId, scenarioId)
    .all<{ step_order: number }>();

  return {
    enrollment: enrollment ?? null,
    current_next_step: currentNextStep ?? null,
    sent_step_orders: sentRows.results.map((row) => row.step_order),
    state_version: manualStartStateVersion(enrollment ?? null),
  };
}

export interface StartFriendScenarioFromStepInput {
  friendId: string;
  scenarioId: string;
  stepId: string;
  deliveryTiming: ManualScenarioStartTiming;
  expectedStateVersion: string;
  /** Test seam. Production callers omit this. */
  now?: Date;
}

/**
 * Make `stepId` the next step for one friend without sending synchronously.
 *
 * Existing active/paused runs are repositioned with an optimistic compare and
 * swap. A delivering run is never touched. When no live run exists, a new run
 * is inserted; the partial unique index is the final race guard.
 */
export async function startFriendScenarioFromStep(
  db: D1Database,
  input: StartFriendScenarioFromStepInput,
): Promise<ManualScenarioStartResult> {
  const state = await getManualScenarioStartState(db, input.scenarioId, input.friendId);
  if (state.enrollment?.status === 'delivering') {
    return { ok: false, reason: 'delivery_in_progress' };
  }
  if (state.state_version !== input.expectedStateVersion) {
    return { ok: false, reason: 'state_changed' };
  }

  const step = await db
    .prepare(`SELECT * FROM scenario_steps WHERE id = ? AND scenario_id = ?`)
    .bind(input.stepId, input.scenarioId)
    .first<ScenarioStep>();
  if (!step) return { ok: false, reason: 'step_not_found' };

  const scenario = await db
    .prepare(`SELECT delivery_mode FROM scenarios WHERE id = ?`)
    .bind(input.scenarioId)
    .first<{ delivery_mode: DeliveryMode }>();
  // The route verifies scenario existence. Treat a concurrent deletion as a
  // state change rather than creating an orphan run.
  if (!scenario) return { ok: false, reason: 'state_changed' };

  const previousRow = await db
    .prepare(
      `SELECT MAX(step_order) AS previous_step_order
       FROM scenario_steps
       WHERE scenario_id = ? AND step_order < ?`,
    )
    .bind(input.scenarioId, step.step_order)
    .first<{ previous_step_order: number | null }>();
  // step_order is not required to be contiguous. If this is the first actual
  // step, a one-less sentinel ensures the delivery worker selects it next.
  const previousStepOrder = previousRow?.previous_step_order ?? step.step_order - 1;

  const nowInstant = input.now ?? new Date();
  const nowTimestamp = toJstString(nowInstant);
  // A confirmation token must be single-use even when an operator submits in
  // the exact millisecond already stored on the run and chooses an identical
  // position/time. Force a distinct updated_at value for that edge case.
  const updatedTimestamp = state.enrollment?.updated_at === nowTimestamp
    ? toJstString(new Date(nowInstant.getTime() + 1))
    : nowTimestamp;
  const nowJstClock = new Date(nowInstant.getTime() + 9 * 60 * 60_000);
  const startedAt = state.enrollment?.started_at ?? nowTimestamp;
  const enrolledAtParsed = new Date(startedAt);
  const enrolledAtJstClock = Number.isNaN(enrolledAtParsed.getTime())
    ? nowJstClock
    : new Date(enrolledAtParsed.getTime() + 9 * 60 * 60_000);
  const nextDeliveryAt = input.deliveryTiming === 'next_cron'
    ? nowTimestamp
    : computeNextDeliveryAt(
      { delivery_mode: scenario.delivery_mode },
      step,
      {
        enrolledAt: enrolledAtJstClock,
        previousDeliveredAt: nowJstClock,
        now: nowJstClock,
      },
    ).toISOString().slice(0, -1) + '+09:00';

  let action: ManualScenarioStartAction;
  let enrollment: FriendScenario;

  if (state.enrollment) {
    const current = state.enrollment;
    const update = await db
      .prepare(
        `UPDATE friend_scenarios
         SET current_step_order = ?, status = 'active', next_delivery_at = ?, updated_at = ?
         WHERE id = ?
           AND status = ?
           AND current_step_order = ?
           AND started_at = ?
           AND next_delivery_at IS ?
           AND updated_at = ?`,
      )
      .bind(
        previousStepOrder,
        nextDeliveryAt,
        updatedTimestamp,
        current.id,
        current.status,
        current.current_step_order,
        current.started_at,
        current.next_delivery_at,
        current.updated_at,
      )
      .run();
    if (!update.meta.changes) {
      const latest = await db
        .prepare(`SELECT status FROM friend_scenarios WHERE id = ?`)
        .bind(current.id)
        .first<{ status: FriendScenarioStatus }>();
      return {
        ok: false,
        reason: latest?.status === 'delivering' ? 'delivery_in_progress' : 'state_changed',
      };
    }
    action = current.status === 'paused' ? 'resumed' : 'repositioned';
    enrollment = {
      ...current,
      current_step_order: previousStepOrder,
      status: 'active',
      next_delivery_at: nextDeliveryAt,
      updated_at: updatedTimestamp,
    };
  } else {
    const id = crypto.randomUUID();
    const insert = await db
      .prepare(
        `INSERT OR IGNORE INTO friend_scenarios
           (id, friend_id, scenario_id, current_step_order, status, started_at, next_delivery_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .bind(
        id,
        input.friendId,
        input.scenarioId,
        previousStepOrder,
        nowTimestamp,
        nextDeliveryAt,
        updatedTimestamp,
      )
      .run();
    if (!insert.meta.changes) return { ok: false, reason: 'state_changed' };
    action = 'created';
    enrollment = {
      id,
      friend_id: input.friendId,
      scenario_id: input.scenarioId,
      current_step_order: previousStepOrder,
      status: 'active',
      started_at: nowTimestamp,
      next_delivery_at: nextDeliveryAt,
      updated_at: updatedTimestamp,
    };
  }

  return {
    ok: true,
    action,
    enrollment,
    start_step: step,
    previous_step_order: previousStepOrder,
    sent_step_orders: state.sent_step_orders,
    state_version: manualStartStateVersion(enrollment),
  };
}

export async function getFriendScenariosDueForDelivery(
  db: D1Database,
  now: string,
): Promise<FriendScenario[]> {
  // Fetch all active scenarios with a delivery time, then filter by epoch comparison
  // to handle mixed timestamp formats (Z and +09:00) during migration
  const result = await db
    .prepare(
      `SELECT fs.* FROM friend_scenarios fs
       INNER JOIN scenarios s ON fs.scenario_id = s.id
       WHERE fs.status = 'active'
         AND s.is_active = 1
         AND fs.next_delivery_at IS NOT NULL`,
    )
    .all<FriendScenario>();
  const nowMs = new Date(now).getTime();
  return result.results
    .filter((fs) => new Date(fs.next_delivery_at!).getTime() <= nowMs)
    .sort((a, b) => new Date(a.next_delivery_at!).getTime() - new Date(b.next_delivery_at!).getTime());
}

/**
 * Optimistic lock: claim a friend_scenario for delivery.
 * Only succeeds if status='active' and current_step_order matches.
 * Returns true if claimed, false if another worker already processed it.
 */
export async function claimFriendScenarioForDelivery(
  db: D1Database,
  id: string,
  expectedStepOrder: number,
): Promise<boolean> {
  const now = jstNow();
  const result = await db
    .prepare(
      `UPDATE friend_scenarios
       SET status = 'delivering', updated_at = ?
       WHERE id = ? AND status = 'active' AND current_step_order = ?`,
    )
    .bind(now, id, expectedStepOrder)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Crash recovery: reset friend_scenarios stuck in 'delivering' for over 5 minutes back to 'active'.
 */
export async function recoverStuckDeliveries(db: D1Database): Promise<number> {
  const fiveMinAgo = new Date(Date.now() + 9 * 60 * 60_000 - 5 * 60_000);
  const threshold = fiveMinAgo.toISOString().slice(0, -1) + '+09:00';
  const result = await db
    .prepare(
      `UPDATE friend_scenarios SET status = 'active', updated_at = ?
       WHERE status = 'delivering' AND updated_at < ?`,
    )
    .bind(jstNow(), threshold)
    .run();
  return result.meta.changes ?? 0;
}

export async function advanceFriendScenario(
  db: D1Database,
  id: string,
  nextStepOrder: number,
  nextDeliveryAt?: string | null,
): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `UPDATE friend_scenarios
       SET current_step_order = ?,
           next_delivery_at = ?,
           status = 'active',
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextStepOrder, nextDeliveryAt ?? null, now, id)
    .run();
}

export async function completeFriendScenario(
  db: D1Database,
  id: string,
): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `UPDATE friend_scenarios
       SET status = 'completed',
           next_delivery_at = NULL,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, id)
    .run();
}
