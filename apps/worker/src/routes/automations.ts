import { Hono } from 'hono';
import {
  getAutomations,
  getAutomationById,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  getAutomationLogs,
} from '@line-crm/db';
import type { AutomationRow } from '@line-crm/db';
import type { Env } from '../index.js';
import { denyIfCannotAccessLineAccount } from '../middleware/account-access.js';
import {
  retryFailedRichMenuAssignments,
  retryRichMenuAssignment,
} from '../services/rich-menu-assignment.js';

const automations = new Hono<Env>();

function serializeAutomation(item: AutomationRow) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    eventType: item.event_type,
    conditions: JSON.parse(item.conditions),
    actions: JSON.parse(item.actions),
    lineAccountId: item.line_account_id,
    isActive: Boolean(item.is_active),
    priority: item.priority,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

interface RichMenuAssignmentListRow {
  friend_id: string;
  automation_id: string | null;
  automation_name: string | null;
  source: 'automation' | 'manual' | 'backfill';
  status: 'pending' | 'retry_wait' | 'processing' | 'applied' | 'failed_permanent';
  retry_count: number;
  max_retries: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  applied_at: string | null;
  verified_at: string | null;
  last_error: string | null;
  updated_at: string;
}

function assignmentReason(row: RichMenuAssignmentListRow): string {
  if (row.status === 'applied' && row.last_error) return '定期照合を再確認します';
  if (row.status === 'applied') return '適用済み';
  if (row.status === 'processing') return 'LINEへ適用中';
  if (row.status === 'pending' || row.status === 'retry_wait') return '自動再試行を待機中';
  return '設定またはLINE接続の確認が必要です';
}

// ========== リッチメニュー自動切替の耐障害状態 ==========

automations.get('/api/automations/rich-menu-assignments', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    if (!lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    }
    const denied = await denyIfCannotAccessLineAccount(c, lineAccountId);
    if (denied) return denied;

    const requestedLimit = Number(c.req.query('limit') ?? '100');
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 100;
    const [itemsResult, summaryResult] = await Promise.all([
      c.env.DB
        .prepare(
          `SELECT r.friend_id, r.automation_id, a.name AS automation_name,
                  r.source, r.status, r.retry_count, r.max_retries,
                  r.next_attempt_at, r.last_attempt_at, r.applied_at,
                  r.verified_at, r.last_error, r.updated_at
             FROM rich_menu_assignments r
             LEFT JOIN automations a ON a.id = r.automation_id
            WHERE r.line_account_id = ?
            ORDER BY CASE r.status
                       WHEN 'failed_permanent' THEN 0
                       WHEN 'processing' THEN 1
                       WHEN 'retry_wait' THEN 2
                       WHEN 'pending' THEN 3
                       ELSE 4
                     END,
                     r.updated_at DESC
            LIMIT ?`,
        )
        .bind(lineAccountId, limit)
        .all<RichMenuAssignmentListRow>(),
      c.env.DB
        .prepare(
          `SELECT status, COUNT(*) AS count
             FROM rich_menu_assignments
            WHERE line_account_id = ?
            GROUP BY status`,
        )
        .bind(lineAccountId)
        .all<{ status: RichMenuAssignmentListRow['status']; count: number }>(),
    ]);

    const counts = new Map(
      (summaryResult.results ?? []).map((row) => [row.status, Number(row.count)]),
    );
    return c.json({
      success: true,
      data: {
        summary: {
          applied: counts.get('applied') ?? 0,
          waiting:
            (counts.get('pending') ?? 0) +
            (counts.get('retry_wait') ?? 0) +
            (counts.get('processing') ?? 0),
          needsAttention: counts.get('failed_permanent') ?? 0,
          total: [...counts.values()].reduce((sum, value) => sum + value, 0),
        },
        items: (itemsResult.results ?? []).map((row) => ({
          assignmentKey: row.friend_id,
          automationId: row.automation_id,
          automationName: row.automation_name,
          source: row.source,
          status: row.status,
          retryCount: row.retry_count,
          maxRetries: row.max_retries,
          nextAttemptAt: row.next_attempt_at,
          lastAttemptAt: row.last_attempt_at,
          appliedAt: row.applied_at,
          verifiedAt: row.verified_at,
          updatedAt: row.updated_at,
          reasonLabel: assignmentReason(row),
          canRetry: row.status === 'failed_permanent',
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/automations/rich-menu-assignments error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

automations.post('/api/automations/rich-menu-assignments/retry-failed', async (c) => {
  try {
    const body = await c.req.json<{ lineAccountId?: string }>();
    if (!body.lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    }
    const denied = await denyIfCannotAccessLineAccount(c, body.lineAccountId);
    if (denied) return denied;
    const queued = await retryFailedRichMenuAssignments(c.env.DB, body.lineAccountId);
    return c.json({ success: true, data: { queued } }, 202);
  } catch (err) {
    console.error('POST /api/automations/rich-menu-assignments/retry-failed error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

automations.post('/api/automations/rich-menu-assignments/:friendId/retry', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const row = await c.env.DB
      .prepare('SELECT line_account_id FROM rich_menu_assignments WHERE friend_id = ?')
      .bind(friendId)
      .first<{ line_account_id: string | null }>();
    if (!row) return c.json({ success: false, error: 'Assignment not found' }, 404);
    if (!row.line_account_id) {
      return c.json({ success: false, error: 'Assignment has no LINE account' }, 409);
    }
    const denied = await denyIfCannotAccessLineAccount(c, row.line_account_id);
    if (denied) return denied;
    const queued = await retryRichMenuAssignment(c.env.DB, friendId);
    return c.json({ success: true, data: { queued } }, 202);
  } catch (err) {
    console.error('POST /api/automations/rich-menu-assignments/:friendId/retry error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 自動化ルールCRUD ==========

automations.get('/api/automations', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    let items;
    if (lineAccountId) {
      const result = await c.env.DB
        .prepare(`SELECT * FROM automations WHERE line_account_id IS NULL OR line_account_id = ? ORDER BY priority DESC, created_at DESC`)
        .bind(lineAccountId)
        .all();
      items = result.results as unknown as Awaited<ReturnType<typeof getAutomations>>;
    } else {
      items = await getAutomations(c.env.DB);
    }
    return c.json({
      success: true,
      data: items.map(serializeAutomation),
    });
  } catch (err) {
    console.error('GET /api/automations error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

automations.get('/api/automations/:id', async (c) => {
  try {
    const item = await getAutomationById(c.env.DB, c.req.param('id'));
    if (!item) return c.json({ success: false, error: 'Automation not found' }, 404);

    // ログも取得
    const logs = await getAutomationLogs(c.env.DB, item.id, 50);

    return c.json({
      success: true,
      data: {
        ...serializeAutomation(item),
        logs: logs.map((l) => ({
          id: l.id,
          friendId: l.friend_id,
          eventData: l.event_data ? JSON.parse(l.event_data) : null,
          actionsResult: l.actions_result ? JSON.parse(l.actions_result) : null,
          status: l.status,
          createdAt: l.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/automations/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

automations.post('/api/automations', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      description?: string;
      eventType: string;
      conditions?: Record<string, unknown>;
      actions: unknown[];
      priority?: number;
      lineAccountId?: string | null;
    }>();
    if (!body.name || !body.eventType || !body.actions) {
      return c.json({ success: false, error: 'name, eventType, actions are required' }, 400);
    }
    const item = await createAutomation(c.env.DB, body);
    return c.json({
      success: true,
      data: serializeAutomation(item),
    }, 201);
  } catch (err) {
    console.error('POST /api/automations error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

automations.put('/api/automations/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Partial<{
      name: string;
      description: string;
      eventType: string;
      conditions: Record<string, unknown>;
      actions: unknown[];
      lineAccountId: string | null;
      isActive: boolean;
      priority: number;
    }>>();
    await updateAutomation(c.env.DB, id, body);
    const updated = await getAutomationById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: serializeAutomation(updated),
    });
  } catch (err) {
    console.error('PUT /api/automations/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

automations.delete('/api/automations/:id', async (c) => {
  try {
    await deleteAutomation(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/automations/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 自動化ログ ==========

automations.get('/api/automations/:id/logs', async (c) => {
  try {
    const automationId = c.req.param('id');
    const limit = Number(c.req.query('limit') ?? '100');
    const logs = await getAutomationLogs(c.env.DB, automationId, limit);
    return c.json({
      success: true,
      data: logs.map((l) => ({
        id: l.id,
        automationId: l.automation_id,
        friendId: l.friend_id,
        eventData: l.event_data ? JSON.parse(l.event_data) : null,
        actionsResult: l.actions_result ? JSON.parse(l.actions_result) : null,
        status: l.status,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/automations/:id/logs error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { automations };
