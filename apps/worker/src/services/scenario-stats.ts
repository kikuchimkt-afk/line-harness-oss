export interface ScenarioStats {
  enrolledTotal: number;
  activeNow: number;
  completed: number;
  paused: number;
  steps: Array<{
    stepOrder: number;
    reachedCount: number;
    /** 0..1 */
    reachRate: number;
  }>;
}

interface EnrollmentRow {
  total: number;
  active_count: number;
  completed_count: number;
  paused_count: number;
}

interface StepReachRow {
  step_order: number;
  reached_count: number;
}

/**
 * シナリオの到達率ダッシュボード集計。
 * 「到達」= messages_log に scenario_step_id 付きで outgoing scenario レコードが書かれた、と定義。
 * ブロック中の友だち (push 失敗 → messages_log なし) や condition_type=false で skip した step は
 * 自然と除外される。
 */
export async function computeScenarioStats(
  db: D1Database,
  scenarioId: string,
): Promise<ScenarioStats> {
  // 1) enrollment 数。再 enrollment では同じ friend に複数行が残るため、
  // started_at / updated_at / id で最新行を 1 件に絞って現在状態を集計する。
  // これにより「登録 6 人 / 進行中 3 / 完了 4」のように状態合計が登録人数を
  // 超える表示を防ぐ。delivering は一時的な配信ロックなので進行中に含める。
  const enrollRow = await db
    .prepare(
      `WITH ranked_enrollments AS (
         SELECT friend_id,
                status,
                ROW_NUMBER() OVER (
                  PARTITION BY friend_id
                  ORDER BY julianday(started_at) DESC,
                           julianday(updated_at) DESC,
                           id DESC
                ) AS row_rank
         FROM friend_scenarios
         WHERE scenario_id = ?
       )
       SELECT COUNT(*) AS total,
              COUNT(CASE WHEN status IN ('active', 'delivering') THEN 1 END) AS active_count,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count,
              COUNT(CASE WHEN status = 'paused' THEN 1 END) AS paused_count
       FROM ranked_enrollments
       WHERE row_rank = 1`,
    )
    .bind(scenarioId)
    .first<EnrollmentRow>();

  const enrolledTotal = enrollRow?.total ?? 0;

  // 2) 各 step の到達ユニーク人数
  const stepsResult = await db
    .prepare(
      `SELECT ss.step_order, COUNT(DISTINCT ml.friend_id) AS reached_count
       FROM scenario_steps ss
       LEFT JOIN messages_log ml
         ON ml.scenario_step_id = ss.id
        AND ml.direction = 'outgoing'
        AND ml.source = 'scenario'
       WHERE ss.scenario_id = ?
       GROUP BY ss.step_order
       ORDER BY ss.step_order ASC`,
    )
    .bind(scenarioId)
    .all<StepReachRow>();

  const steps = stepsResult.results.map((row) => ({
    stepOrder: row.step_order,
    reachedCount: row.reached_count,
    reachRate: enrolledTotal > 0 ? row.reached_count / enrolledTotal : 0,
  }));

  return {
    enrolledTotal,
    activeNow: enrollRow?.active_count ?? 0,
    completed: enrollRow?.completed_count ?? 0,
    paused: enrollRow?.paused_count ?? 0,
    steps,
  };
}
