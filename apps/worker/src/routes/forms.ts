import { Hono } from 'hono';
import {
  getForms,
  getFormsWithStats,
  getFormById,
  createForm,
  updateForm,
  deleteForm,
  getFormSubmissions,
  createFormSubmission,
  getFormSubmissionByIdempotencyKey,
  markFormSubmissionDelivery,
  deleteFormSubmission,
  jstNow,
} from '@line-crm/db';
import { getFriendByLineUserId, getFriendById } from '@line-crm/db';
import { addTagToFriend, enrollFriendInScenario } from '@line-crm/db';
import type {
  Form as DbForm,
  FormSubmission as DbFormSubmission,
  FormUsedByAccount,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { pushMessageWithRetry } from '../services/line-push-retry.js';

const forms = new Hono<Env>();
const FORM_NOTICE_RECIPIENTS_KEY = 'incoming_notice_recipients';
const FORM_NOTICE_MAX_ANSWERS = 8;
const FORM_NOTICE_VALUE_MAX_LENGTH = 160;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function serializeForm(
  row: DbForm,
  extra?: { lastSubmittedAt?: string | null; usedByAccounts?: FormUsedByAccount[] },
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: JSON.parse(row.fields || '[]') as unknown[],
    onSubmitTagId: row.on_submit_tag_id,
    onSubmitScenarioId: row.on_submit_scenario_id,
    onSubmitMessageType: row.on_submit_message_type,
    onSubmitMessageContent: row.on_submit_message_content,
    onSubmitWebhookUrl: row.on_submit_webhook_url,
    onSubmitWebhookHeaders: row.on_submit_webhook_headers,
    onSubmitWebhookFailMessage: row.on_submit_webhook_fail_message,
    saveToMetadata: Boolean(row.save_to_metadata),
    isActive: Boolean(row.is_active),
    submitCount: row.submit_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSubmittedAt: extra?.lastSubmittedAt ?? null,
    usedByAccounts: extra?.usedByAccounts ?? [],
  };
}

function serializeSubmission(row: DbFormSubmission & { friend_name?: string | null }) {
  return {
    id: row.id,
    formId: row.form_id,
    friendId: row.friend_id,
    friendName: row.friend_name || null,
    data: JSON.parse(row.data || '{}') as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

type FormFieldForNotice = {
  name: string;
  label: string;
};

type FormNoticeRecipient = {
  id: string;
  line_user_id: string;
};

function formatNoticeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const text = Array.isArray(value)
    ? value.join(', ')
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return text.length > FORM_NOTICE_VALUE_MAX_LENGTH
    ? `${text.slice(0, FORM_NOTICE_VALUE_MAX_LENGTH)}...`
    : text;
}

async function notifyFormSubmissionRecipients(
  db: D1Database,
  defaultAccessToken: string,
  params: {
    formName: string;
    formFields: FormFieldForNotice[];
    friendId: string;
    submissionData: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const friend = await getFriendById(db, params.friendId);
    if (!friend) return;
    const lineAccountId = (friend as unknown as { line_account_id?: string | null }).line_account_id;
    if (!lineAccountId) return;

    const setting = await db
      .prepare(`SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?`)
      .bind(lineAccountId, FORM_NOTICE_RECIPIENTS_KEY)
      .first<{ value: string | null }>();

    let recipientIds: string[] = [];
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        recipientIds = Array.isArray(parsed)
          ? parsed
              .filter((id): id is string => typeof id === 'string')
              .map((id) => id.trim())
              .filter((id) => id.length > 0 && id !== params.friendId)
          : [];
      } catch {
        recipientIds = [];
      }
    }
    recipientIds = [...new Set(recipientIds)];
    if (recipientIds.length === 0) return;

    const account = await db
      .prepare(`SELECT name, channel_access_token FROM line_accounts WHERE id = ?`)
      .bind(lineAccountId)
      .first<{ name: string | null; channel_access_token: string | null }>();

    const placeholders = recipientIds.map(() => '?').join(',');
    const recipients = await db
      .prepare(
        `SELECT id, line_user_id
         FROM friends
         WHERE line_account_id = ?
           AND is_following = 1
           AND id IN (${placeholders})`,
      )
      .bind(lineAccountId, ...recipientIds)
      .all<FormNoticeRecipient>();
    if (recipients.results.length === 0) return;

    const fieldLabelByName = new Map(params.formFields.map((field) => [field.name, field.label]));
    const answerLines = Object.entries(params.submissionData)
      .slice(0, FORM_NOTICE_MAX_ANSWERS)
      .map(([key, value]) => {
        const label = fieldLabelByName.get(key) || key;
        return `・${label}: ${formatNoticeValue(value)}`;
      });

    const text = [
      '📝 フォームが送信されました',
      '',
      `アカウント：${account?.name ?? 'LINE公式アカウント'}`,
      `フォーム：${params.formName}`,
      `回答者：${friend.display_name || '名前なし'}`,
      '',
      ...answerLines,
      '',
      'L Harnessのフォーム回答で確認してください。',
    ].join('\n');

    const { LineClient } = await import('@line-crm/line-sdk');
    const lineClient = new LineClient(account?.channel_access_token || defaultAccessToken);

    for (const recipient of recipients.results) {
      try {
        await pushMessageWithRetry(
          lineClient,
          recipient.line_user_id,
          [{ type: 'text', text }],
          crypto.randomUUID(),
        );
      } catch (err) {
        console.error(`[forms] submit notice failed recipient=${recipient.id}`, err);
      }
    }
  } catch (err) {
    console.error('[forms] submit notice failed', err);
  }
}

// GET /api/forms — list all forms (with submission stats + delivering accounts)
forms.get('/api/forms', async (c) => {
  try {
    const items = await getFormsWithStats(c.env.DB);
    return c.json({
      success: true,
      data: items.map((row) =>
        serializeForm(row, {
          lastSubmittedAt: row.last_submitted_at,
          usedByAccounts: row.used_by_accounts,
        }),
      ),
    });
  } catch (err) {
    console.error('GET /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/forms/:id — get form
forms.get('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    return c.json({ success: true, data: serializeForm(form) });
  } catch (err) {
    console.error('GET /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms — create form
forms.post('/api/forms', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      onSubmitMessageType?: 'text' | 'flex' | null;
      onSubmitMessageContent?: string | null;
      onSubmitWebhookUrl?: string | null;
      onSubmitWebhookHeaders?: string | null;
      onSubmitWebhookFailMessage?: string | null;
      saveToMetadata?: boolean;
    }>();

    if (!body.name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }

    const form = await createForm(c.env.DB, {
      name: body.name,
      description: body.description ?? null,
      fields: JSON.stringify(body.fields ?? []),
      onSubmitTagId: body.onSubmitTagId ?? null,
      onSubmitScenarioId: body.onSubmitScenarioId ?? null,
      onSubmitMessageType: body.onSubmitMessageType ?? null,
      onSubmitMessageContent: body.onSubmitMessageContent ?? null,
      onSubmitWebhookUrl: body.onSubmitWebhookUrl ?? null,
      onSubmitWebhookHeaders: body.onSubmitWebhookHeaders ?? null,
      onSubmitWebhookFailMessage: body.onSubmitWebhookFailMessage ?? null,
      saveToMetadata: body.saveToMetadata,
    });

    return c.json({ success: true, data: serializeForm(form) }, 201);
  } catch (err) {
    console.error('POST /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/forms/:id — update form
forms.put('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      onSubmitMessageType?: 'text' | 'flex' | null;
      onSubmitMessageContent?: string | null;
      onSubmitWebhookUrl?: string | null;
      onSubmitWebhookHeaders?: string | null;
      onSubmitWebhookFailMessage?: string | null;
      saveToMetadata?: boolean;
      isActive?: boolean;
    }>();

    // Only include fields that were explicitly sent (avoid undefined → null conversion)
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.fields !== undefined) updates.fields = JSON.stringify(body.fields);
    if (body.onSubmitTagId !== undefined) updates.onSubmitTagId = body.onSubmitTagId;
    if (body.onSubmitScenarioId !== undefined) updates.onSubmitScenarioId = body.onSubmitScenarioId;
    if (body.onSubmitMessageType !== undefined) updates.onSubmitMessageType = body.onSubmitMessageType;
    if (body.onSubmitMessageContent !== undefined) updates.onSubmitMessageContent = body.onSubmitMessageContent;
    if (body.onSubmitWebhookUrl !== undefined) updates.onSubmitWebhookUrl = body.onSubmitWebhookUrl;
    if (body.onSubmitWebhookHeaders !== undefined) updates.onSubmitWebhookHeaders = body.onSubmitWebhookHeaders;
    if (body.onSubmitWebhookFailMessage !== undefined) updates.onSubmitWebhookFailMessage = body.onSubmitWebhookFailMessage;
    if (body.saveToMetadata !== undefined) updates.saveToMetadata = body.saveToMetadata;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await updateForm(c.env.DB, id, updates as any);

    if (!updated) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    return c.json({ success: true, data: serializeForm(updated) });
  } catch (err) {
    console.error('PUT /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/forms/:id
forms.delete('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    await deleteForm(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/forms/:id/submissions — list submissions
forms.get('/api/forms/:id/submissions', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    const submissions = await getFormSubmissions(c.env.DB, id);
    return c.json({ success: true, data: submissions.map(serializeSubmission) });
  } catch (err) {
    console.error('GET /api/forms/:id/submissions error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/forms/:formId/submissions/:submissionId — delete one submission
forms.delete('/api/forms/:formId/submissions/:submissionId', async (c) => {
  try {
    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const form = await getFormById(c.env.DB, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    const deleted = await deleteFormSubmission(c.env.DB, formId, submissionId);
    if (!deleted) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/forms/:formId/submissions/:submissionId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms/:id/opened — record form open event (public, used by LIFF)
forms.post('/api/forms/:id/opened', async (c) => {
  try {
    const formId = c.req.param('id');
    const body = await c.req.json<{ lineUserId?: string; friendId?: string }>();
    const lineUserId = body.lineUserId;
    const friendId = body.friendId;

    // Resolve friend
    let friend = friendId
      ? await getFriendById(c.env.DB, friendId)
      : lineUserId
        ? await getFriendByLineUserId(c.env.DB, lineUserId)
        : null;

    const now = jstNow();
    await c.env.DB.prepare(
      'INSERT INTO form_opens (id, form_id, friend_id, friend_name, opened_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      crypto.randomUUID(),
      formId,
      friend?.id ?? null,
      friend?.display_name ?? null,
      now,
    ).run();

    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/forms/:id/opened error:', err);
    return c.json({ success: true }); // non-blocking, always succeed
  }
});

// POST /api/forms/:id/partial — save survey answers without x_username (public, used by LIFF page 1)
forms.post('/api/forms/:id/partial', async (c) => {
  try {
    const formId = c.req.param('id');
    const body = await c.req.json<{ lineUserId?: string; friendId?: string; data?: Record<string, unknown> }>();

    // Resolve friend
    let friend = body.friendId
      ? await getFriendById(c.env.DB, body.friendId)
      : body.lineUserId
        ? await getFriendByLineUserId(c.env.DB, body.lineUserId)
        : null;

    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    // Save survey data to friend metadata (merge with existing)
    const existingMeta = friend.metadata ? JSON.parse(friend.metadata) : {};
    const merged = { ...existingMeta, ...body.data };
    await c.env.DB.prepare(
      'UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?',
    ).bind(JSON.stringify(merged), jstNow(), friend.id).run();

    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/forms/:id/partial error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms/:id/submit — submit form (public, used by LIFF)
forms.post('/api/forms/:id/submit', async (c) => {
  try {
    const formId = c.req.param('id');
    const form = await getFormById(c.env.DB, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!form.is_active) {
      return c.json({ success: false, error: 'This form is no longer accepting responses' }, 400);
    }

    const body = await c.req.json<{
      lineUserId?: string;
      friendId?: string;
      data?: Record<string, unknown>;
      _skipWebhook?: boolean;
      trackedLinkId?: string;
    }>();

    const rawIdempotencyKey = c.req.header('Idempotency-Key')?.trim() ?? '';
    if (rawIdempotencyKey && !IDEMPOTENCY_KEY_PATTERN.test(rawIdempotencyKey)) {
      return c.json({ success: false, error: 'Invalid Idempotency-Key' }, 400);
    }
    const idempotencyKey = rawIdempotencyKey || null;

    let existingSubmission = idempotencyKey
      ? await getFormSubmissionByIdempotencyKey(c.env.DB, formId, idempotencyKey)
      : null;
    let submissionData = body.data ?? {};
    let friendId: string | null = body.friendId ?? null;
    let effectiveTrackedLinkId: string | null = body.trackedLinkId?.trim() || null;

    const restorePersistedRequest = (submission: DbFormSubmission) => {
      const parsed = JSON.parse(submission.data || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Persisted form submission data is invalid');
      }
      submissionData = parsed as Record<string, unknown>;
      friendId = submission.friend_id;
      effectiveTrackedLinkId = submission.tracked_link_id;
    };

    // Once an idempotency key has been stored, its recipient, answers and
    // campaign attribution are immutable. Never trust a changed replay body.
    if (existingSubmission) restorePersistedRequest(existingSubmission);

    // Validate required fields
    const fields = JSON.parse(form.fields || '[]') as Array<{
      name: string;
      label: string;
      type: string;
      required?: boolean;
    }>;

    for (const field of fields) {
      if (field.required) {
        const val = submissionData[field.name];
        if (val === undefined || val === null || val === '') {
          return c.json(
            { success: false, error: `${field.label} は必須項目です` },
            400,
          );
        }
      }
    }

    // Resolve friend by lineUserId or friendId only for a new request.
    if (!existingSubmission && !friendId && body.lineUserId) {
      const friend = await getFriendByLineUserId(c.env.DB, body.lineUserId);
      if (friend) {
        friendId = friend.id;
      }
    }

    // Webhook gate — a stored replay reuses the first persisted outcome and
    // never invokes the external webhook again.
    delete submissionData._webhookVerified;
    const skipWebhook = Boolean(body._skipWebhook);
    delete submissionData._skipWebhook;
    let webhookData: Record<string, unknown> | null = null;

    const respondToWebhookRejection = async (
      submission: DbFormSubmission,
      created: boolean,
      resultData: unknown,
    ): Promise<Response> => {
      if (
        form.on_submit_webhook_fail_message
        && friendId
        && submission.delivery_status !== 'sent'
        && submission.delivery_status !== 'not_required'
      ) {
        try {
          const friend = await getFriendById(c.env.DB, friendId);
          if (!friend?.line_user_id) throw new Error('Recipient LINE account is unavailable');
          const { LineClient } = await import('@line-crm/line-sdk');
          let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
          if ((friend as unknown as Record<string, unknown>).line_account_id) {
            const { getLineAccountById } = await import('@line-crm/db');
            const account = await getLineAccountById(c.env.DB, (friend as unknown as Record<string, unknown>).line_account_id as string);
            if (account) accessToken = account.channel_access_token;
          }
          const lineClient = new LineClient(accessToken);
          await pushMessageWithRetry(
            lineClient,
            friend.line_user_id,
            [{ type: 'text', text: form.on_submit_webhook_fail_message }],
            submission.delivery_retry_key ?? crypto.randomUUID(),
          );
          await c.env.DB
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at)
               VALUES (?, ?, 'outgoing', 'text', ?, NULL, NULL, 'auto_reply', ?)`,
            )
            .bind(crypto.randomUUID(), friend.id, form.on_submit_webhook_fail_message, jstNow())
            .run();
          await markFormSubmissionDelivery(c.env.DB, submission.id, 'sent');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await markFormSubmissionDelivery(c.env.DB, submission.id, 'failed', message);
          console.error('Failed to send webhook fail message:', error);
          return c.json({
            success: false,
            error: '回答は保存されています。確認メッセージを送信できなかったため、時間をおいてもう一度「送信」を押してください。',
            retryable: true,
          }, 503);
        }
      }
      return c.json({
        success: true,
        data: {
          ...serializeSubmission(submission),
          webhookPassed: false,
          webhookData: resultData,
          idempotentReplay: !created,
        },
      }, created ? 201 : 200);
    };

    if (
      existingSubmission
      && Object.prototype.hasOwnProperty.call(submissionData, '_webhookResult')
    ) {
      return respondToWebhookRejection(
        existingSubmission,
        false,
        submissionData._webhookResult,
      );
    }

    if (!existingSubmission && form.on_submit_webhook_url && !skipWebhook) {
      const webhookResult = await callFormWebhook(form, submissionData);
      webhookData = webhookResult.data as Record<string, unknown> | null;
      if (!webhookResult.passed) {
        const saved = await createFormSubmission(c.env.DB, {
          formId,
          friendId: friendId || null,
          data: JSON.stringify({ ...submissionData, _webhookResult: webhookResult.data }),
          idempotencyKey,
          trackedLinkId: effectiveTrackedLinkId,
        });
        restorePersistedRequest(saved.submission);
        if (Object.prototype.hasOwnProperty.call(submissionData, '_webhookResult')) {
          return respondToWebhookRejection(
            saved.submission,
            saved.created,
            submissionData._webhookResult,
          );
        }
        // A concurrent request with the same key persisted an accepted outcome
        // first. That stored outcome wins over this later webhook response.
        existingSubmission = saved.submission;
        webhookData = null;
      }
    }

    // Save submission (friendId null if not resolved — avoids FK constraint)
    const saved = existingSubmission
      ? { submission: existingSubmission, created: false }
      : await createFormSubmission(c.env.DB, {
          formId,
          friendId: friendId || null,
          data: JSON.stringify(submissionData),
          idempotencyKey,
          trackedLinkId: effectiveTrackedLinkId,
        });
    const { submission, created } = saved;
    if (!created) {
      restorePersistedRequest(submission);
      if (Object.prototype.hasOwnProperty.call(submissionData, '_webhookResult')) {
        return respondToWebhookRejection(submission, false, submissionData._webhookResult);
      }
      webhookData = null;
    }

    // A replay normally returns the first persisted result without repeating
    // side effects. If the durable confirmation/coupon delivery did not finish,
    // the replay resumes only that delivery with the same LINE retry key.
    const shouldResumeDelivery = Boolean(
      !created
      && friendId
      && submission.delivery_status !== 'sent'
      && submission.delivery_status !== 'not_required',
    );
    if (!created && !shouldResumeDelivery) {
      return c.json({
        success: true,
        data: { ...serializeSubmission(submission), idempotentReplay: true },
      }, 200);
    }

    // Side effects (best-effort, don't fail the request)
    if (friendId) {
      const db = c.env.DB;
      const now = jstNow();

      // Resolve reward template per-campaign.
      //
      // Priority:
      //   1. persisted trackedLinkId (= ?ref= from /r/:ref → LIFF → form). This lets
      //      X Harness campaign settings drive the reward, even for friends who
      //      were originally added via a different campaign.
      //   2. Fallback to friends.first_tracked_link_id (first-touch attribution)
      //      so existing tracked links without ref pass-through still work.
      //
      // This OVERRIDES form.on_submit_message_*.
      //
      // Note: anti-replay (preventing the same friend from claiming the same
      // reward twice via URL tampering) is intentionally NOT enforced. The
      // product is opt-in oriented and the engagement gate handles real
      // anti-fraud upstream.
      let rewardTemplate: import('@line-crm/db').MessageTemplate | null = null;
      {
        const { getFriendById, getTrackedLinkById, getMessageTemplateById } = await import('@line-crm/db');
        const { resolveRewardTemplate } = await import('../services/reward-resolver.js');
        rewardTemplate = await resolveRewardTemplate(
          db,
          {
            friendId,
            requestedTrackedLinkId: effectiveTrackedLinkId,
          },
          { getFriendById, getTrackedLinkById, getMessageTemplateById },
        );
      }

      const sideEffects: Promise<unknown>[] = [];

      // These side effects run only for the winning insert. A network replay
      // must not notify staff or re-enrol/re-tag the same person.
      if (created) {
        sideEffects.push(
          notifyFormSubmissionRecipients(db, c.env.LINE_CHANNEL_ACCESS_TOKEN, {
            formName: form.name,
            formFields: fields,
            friendId,
            submissionData,
          }),
        );

        // Save response data to friend's metadata
        if (form.save_to_metadata) {
          sideEffects.push(
            (async () => {
              const friend = await getFriendById(db, friendId!);
              if (!friend) return;
              const existing = JSON.parse(friend.metadata || '{}') as Record<string, unknown>;
              const merged = { ...existing, ...submissionData };
              await db
                .prepare(`UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?`)
                .bind(JSON.stringify(merged), now, friendId)
                .run();
            })(),
          );
        }

        // Add tag
        if (form.on_submit_tag_id) {
          sideEffects.push(addTagToFriend(db, friendId, form.on_submit_tag_id));
        }

        // Enroll in scenario
        if (form.on_submit_scenario_id) {
          sideEffects.push(enrollFriendInScenario(db, friendId, form.on_submit_scenario_id));
        }

        // If webhook returned a join_url (e.g. Meet Harness), send a Flex button to the user
        if (webhookData?.join_url) {
          sideEffects.push(
            (async () => {
              const friend = await getFriendById(db, friendId!);
              if (!friend?.line_user_id) return;
              const { LineClient } = await import('@line-crm/line-sdk');
              let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
              if ((friend as unknown as Record<string, unknown>).line_account_id) {
                const { getLineAccountById } = await import('@line-crm/db');
                const account = await getLineAccountById(db, (friend as unknown as Record<string, unknown>).line_account_id as string);
                if (account) accessToken = account.channel_access_token;
              }
              const lineClient = new LineClient(accessToken);
              const joinUrl = String(webhookData!.join_url);
              const meetFlex = {
                type: 'bubble',
                header: {
                  type: 'box', layout: 'vertical',
                  contents: [
                    { type: 'text', text: 'ヒアリングの準備ができました', size: 'md', weight: 'bold', color: '#1e293b' },
                  ],
                  paddingAll: '20px', backgroundColor: '#f0f9ff',
                },
                body: {
                  type: 'box', layout: 'vertical',
                  contents: [
                    { type: 'text', text: 'アンケートありがとうございます。続けて短いヒアリングにご協力ください。', size: 'sm', color: '#475569', wrap: true },
                  ],
                  paddingAll: '20px',
                },
                footer: {
                  type: 'box', layout: 'vertical',
                  contents: [
                    {
                      type: 'button', style: 'primary', color: '#4CAF50',
                      action: { type: 'uri', label: 'ヒアリングを始める', uri: joinUrl },
                    },
                  ],
                  paddingAll: '16px',
                },
              };
              await pushMessageWithRetry(
                lineClient,
                friend.line_user_id,
                [
                  { type: 'flex', altText: 'ヒアリングの準備ができました', contents: meetFlex },
                ],
                crypto.randomUUID(),
              );
              await db
                .prepare(
                  `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at)
                   VALUES (?, ?, 'outgoing', 'flex', ?, NULL, NULL, 'auto_reply', ?)`,
                )
                .bind(crypto.randomUUID(), friend.id, JSON.stringify(meetFlex), jstNow())
                .run();
            })(),
          );
        }
      }

      // Confirmation/coupon delivery is durable. It runs for a new response or
      // resumes a previous failed/pending response, always with the same LINE
      // retry key so LINE cannot deliver the same reward twice.
      const deliveryPromise = (async () => {
          console.log('Form reply: starting for friendId', friendId);
          const friend = await getFriendById(db, friendId!);
          if (!friend?.line_user_id) throw new Error('Recipient LINE account is unavailable');
          console.log('Form reply: sending to', friend.line_user_id);
          const { LineClient } = await import('@line-crm/line-sdk');
          // Resolve access token from friend's account (multi-account support)
          let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
          if ((friend as unknown as Record<string, unknown>).line_account_id) {
            const { getLineAccountById } = await import('@line-crm/db');
            const account = await getLineAccountById(db, (friend as unknown as Record<string, unknown>).line_account_id as string);
            if (account) accessToken = account.channel_access_token;
          }
          const lineClient = new LineClient(accessToken);
          const { buildMessage, expandVariables } = await import('../services/step-delivery.js');
          const apiOrigin = new URL(c.req.url).origin;
          const { resolveMetadata } = await import('../services/step-delivery.js');
          const resolvedMeta = await resolveMetadata(c.env.DB, { user_id: (friend as unknown as Record<string, string | null>).user_id, metadata: (friend as unknown as Record<string, string | null>).metadata });
          const friendData = {
            id: friend.id,
            display_name: friend.display_name,
            user_id: (friend as unknown as Record<string, string | null>).user_id,
            ref_code: (friend as unknown as Record<string, string | null>).ref_code,
            metadata: resolvedMeta,
          };

          // Build diagnostic result Flex card showing their answers
          const entries = Object.entries(submissionData as Record<string, unknown>);
          const answerRows = entries.map(([key, value]) => {
            const field = form.fields ? (JSON.parse(form.fields) as Array<{ name: string; label: string }>).find((f: { name: string }) => f.name === key) : null;
            const label = field?.label || key;
            const val = Array.isArray(value) ? value.join(', ') : (value !== null && value !== undefined && value !== '') ? String(value) : '-';
            return {
              type: 'box' as const, layout: 'vertical' as const, margin: 'md' as const,
              contents: [
                { type: 'text' as const, text: label, size: 'xxs' as const, color: '#64748b' },
                { type: 'text' as const, text: val, size: 'sm' as const, color: '#1e293b', weight: 'bold' as const, wrap: true },
              ],
            };
          });

          const resultFlex = {
            type: 'bubble', size: 'giga',
            header: {
              type: 'box', layout: 'vertical',
              contents: [
                { type: 'text', text: '診断結果', size: 'lg', weight: 'bold', color: '#1e293b' },
                { type: 'text', text: `${friend.display_name || ''}さんの回答`, size: 'xs', color: '#64748b', margin: 'sm' },
              ],
              paddingAll: '20px', backgroundColor: '#f0fdf4',
            },
            body: {
              type: 'box', layout: 'vertical',
              contents: [
                ...answerRows,
                { type: 'separator', margin: 'lg' },
                { type: 'text', text: '他社サービスでは、フォームの回答内容に合わせたリアルタイム返信はできません。LINE Harnessだからこそ可能な体験です。', size: 'xs', color: '#06C755', weight: 'bold', wrap: true, margin: 'lg' },
              ],
              paddingAll: '20px',
            },
          };

          const messages: ReturnType<typeof buildMessage>[] = [];

          const { buildRewardMessage } = await import('../services/reward-message.js');
          const rewardFromTrackedLink = buildRewardMessage(rewardTemplate, friend.display_name);

          if (rewardFromTrackedLink) {
            // Tracked-link reward template overrides everything (per-campaign reward)
            messages.push(rewardFromTrackedLink as ReturnType<typeof buildMessage>);
          } else if (form.on_submit_message_type && form.on_submit_message_content) {
            // Custom form message replaces default diagnostic result
            const expanded = expandVariables(form.on_submit_message_content, friendData, apiOrigin);
            messages.push(buildMessage(form.on_submit_message_type, expanded));
          } else {
            // Default: send diagnostic result Flex
            messages.push(buildMessage('flex', JSON.stringify(resultFlex)));
          }

          await pushMessageWithRetry(
            lineClient,
            friend.line_user_id,
            messages,
            submission.delivery_retry_key ?? crypto.randomUUID(),
          );

          // Mirror every pushed message into messages_log so the dashboard chat
          // view stays consistent with what the user actually receives in LINE.
          // Without this the form's auto-reply is invisible to operators.
          const { messageToLogPayload } = await import('../services/step-delivery.js');
          const sentAt = jstNow();
          for (const m of messages) {
            const payload = messageToLogPayload(m);
            await db
              .prepare(
                `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at)
                 VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'auto_reply', ?)`,
              )
              .bind(crypto.randomUUID(), friend.id, payload.messageType, payload.content, sentAt)
              .run();
          }
        })();

      if (sideEffects.length > 0) {
        const results = await Promise.allSettled(sideEffects);
        for (const r of results) {
          if (r.status === 'rejected') console.error('Form side-effect failed:', r.reason);
        }
      }

      try {
        await deliveryPromise;
        await markFormSubmissionDelivery(db, submission.id, 'sent');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markFormSubmissionDelivery(db, submission.id, 'failed', message);
        console.error('Form confirmation delivery failed:', error);
        return c.json({
          success: false,
          error: '回答は保存されています。クーポン送信を完了できなかったため、時間をおいてもう一度「送信」を押してください。',
          retryable: true,
        }, 503);
      }
    }

    return c.json({
      success: true,
      data: { ...serializeSubmission(submission), idempotentReplay: !created },
    }, created ? 201 : 200);
  } catch (err) {
    console.error('POST /api/forms/:id/submit error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

async function callFormWebhook(
  form: DbForm,
  submissionData: Record<string, unknown>,
): Promise<{ passed: boolean; data: unknown }> {
  if (!form.on_submit_webhook_url) return { passed: true, data: null };

  try {
    // Replace {field_name} placeholders in URL with submitted values
    let url = form.on_submit_webhook_url;
    for (const [key, value] of Object.entries(submissionData)) {
      url = url.replace(`{${key}}`, encodeURIComponent(String(value ?? '')));
    }

    // Parse headers
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (form.on_submit_webhook_headers) {
      try {
        const parsed = JSON.parse(form.on_submit_webhook_headers) as Record<string, string>;
        Object.assign(headers, parsed);
      } catch { /* ignore invalid headers */ }
    }

    // Determine method: GET if URL has {placeholders} replaced, POST otherwise
    const isGet = form.on_submit_webhook_url.includes('{');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: isGet ? 'GET' : 'POST',
      headers,
      signal: controller.signal,
      ...(isGet ? {} : { body: JSON.stringify(submissionData) }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { passed: false, data: { error: `HTTP ${res.status}` } };
    }

    const data = await res.json() as Record<string, unknown>;

    // Check for eligibility — support both { eligible: bool } and { success: bool, data: { eligible: bool } }
    const eligible = data.eligible ?? (data.data as Record<string, unknown> | undefined)?.eligible ?? data.success;
    return { passed: Boolean(eligible), data };
  } catch (err) {
    console.error('Form webhook error:', err);
    return { passed: false, data: { error: String(err) } };
  }
}

export { forms };
