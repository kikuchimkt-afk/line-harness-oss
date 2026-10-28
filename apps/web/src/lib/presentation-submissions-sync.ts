export const PRESENTATION_SUBMISSIONS_SYNC_MESSAGE = 'l-harness:presentation-submissions:v1'
export const PRESENTATION_SUBMISSIONS_SYNC_VERSION = 1 as const

const PRESENTATION_SYNC_ALLOWED_ORIGINS = new Set([
  'https://tokushima-elementary-english-presentation-2026.vercel.app',
  'http://localhost:3000',
  'http://localhost:3010',
])

const SAFE_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const SAFE_FORM_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export type PresentationSyncRequest = {
  targetOrigin: string
  formId: string
  nonce: string
}

export type PresentationSyncFieldInput = {
  name: string
  label: string
  type?: string
}

export type PresentationSyncSubmissionInput = {
  id: string
  formId: string
  friendId: string | null
  friendName?: string | null
  data: Record<string, unknown>
  createdAt: string
}

export type PresentationSubmissionsSyncPayload = {
  type: typeof PRESENTATION_SUBMISSIONS_SYNC_MESSAGE
  version: typeof PRESENTATION_SUBMISSIONS_SYNC_VERSION
  formId: string
  formName: string
  exportedAt: string
  fields: PresentationSyncFieldInput[]
  submissions: Array<{
    id: string
    formId: string
    friendId: string | null
    friendName: string | null
    data: Record<string, unknown>
    createdAt: string
  }>
  nonce: string
}

type PresentationSyncMessageTarget = {
  readonly closed?: boolean
  postMessage(message: unknown, targetOrigin: string): void
}

export type PresentationSyncFailureReason =
  | 'invalid_request'
  | 'opener_missing'
  | 'form_mismatch'
  | 'submission_form_mismatch'
  | 'post_message_failed'

export type PresentationSyncResult =
  | { ok: true; payload: PresentationSubmissionsSyncPayload }
  | { ok: false; reason: PresentationSyncFailureReason }

function isLineUserIdKey(key: string): boolean {
  return key.replaceAll('_', '').replaceAll('-', '').toLowerCase() === 'lineuserid'
}

function sanitizeAnswerValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAnswerValue)
  if (!value || typeof value !== 'object') return value

  const sanitized: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    if (!isLineUserIdKey(key)) sanitized[key] = sanitizeAnswerValue(nestedValue)
  }
  return sanitized
}

/**
 * Resolve the cross-application sync request from the current URL.
 *
 * The target must be an exact allowlisted origin. Paths, credentials, query
 * strings, and fragments are rejected so postMessage can never be redirected
 * by a crafted presentation_sync_target value.
 */
export function resolvePresentationSyncRequest(search: string): PresentationSyncRequest | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const rawTarget = params.get('presentation_sync_target')?.trim()
  const formId = params.get('formId') ?? ''
  const nonce = params.get('presentation_sync_nonce') ?? ''
  if (!rawTarget || !SAFE_FORM_ID_PATTERN.test(formId) || !SAFE_NONCE_PATTERN.test(nonce)) return null

  try {
    const target = new URL(rawTarget)
    if (
      target.username ||
      target.password ||
      target.pathname !== '/' ||
      target.search ||
      target.hash ||
      !PRESENTATION_SYNC_ALLOWED_ORIGINS.has(target.origin)
    ) return null

    return { targetOrigin: target.origin, formId, nonce }
  } catch {
    return null
  }
}

export function buildPresentationSubmissionsSyncPayload(
  request: PresentationSyncRequest,
  formName: string,
  fields: PresentationSyncFieldInput[],
  submissions: PresentationSyncSubmissionInput[],
  exportedAt = new Date().toISOString(),
): PresentationSubmissionsSyncPayload {
  return {
    type: PRESENTATION_SUBMISSIONS_SYNC_MESSAGE,
    version: PRESENTATION_SUBMISSIONS_SYNC_VERSION,
    formId: request.formId,
    formName,
    exportedAt,
    fields: fields
      .filter((field) => !isLineUserIdKey(field.name))
      .map((field) => ({
        name: field.name,
        label: field.label,
        ...(field.type ? { type: field.type } : {}),
      })),
    submissions: submissions.map((submission) => ({
      id: submission.id,
      formId: submission.formId,
      // 大会運営側ではLINE内部識別子やLINE表示名を使わないため送信しません。
      friendId: null,
      friendName: null,
      data: sanitizeAnswerValue(submission.data) as Record<string, unknown>,
      createdAt: submission.createdAt,
    })),
    nonce: request.nonce,
  }
}

/**
 * Validate the live URL and selected form immediately before posting.
 * This keeps a stale React render or history manipulation from changing the
 * destination or mixing answers from another form.
 */
export function sendPresentationSubmissionsSync(input: {
  search: string
  selectedFormId: string | null
  formName: string
  fields: PresentationSyncFieldInput[]
  submissions: PresentationSyncSubmissionInput[]
  opener: PresentationSyncMessageTarget | null
  exportedAt?: string
}): PresentationSyncResult {
  const request = resolvePresentationSyncRequest(input.search)
  if (!request) return { ok: false, reason: 'invalid_request' }
  if (!input.opener || input.opener.closed) return { ok: false, reason: 'opener_missing' }
  if (!input.selectedFormId || input.selectedFormId !== request.formId) {
    return { ok: false, reason: 'form_mismatch' }
  }
  if (input.submissions.some((submission) => submission.formId !== request.formId)) {
    return { ok: false, reason: 'submission_form_mismatch' }
  }

  const payload = buildPresentationSubmissionsSyncPayload(
    request,
    input.formName,
    input.fields,
    input.submissions,
    input.exportedAt,
  )

  try {
    input.opener.postMessage(payload, request.targetOrigin)
    return { ok: true, payload }
  } catch {
    return { ok: false, reason: 'post_message_failed' }
  }
}
