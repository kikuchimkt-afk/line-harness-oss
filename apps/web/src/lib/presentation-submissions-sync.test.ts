import { describe, expect, it, vi } from 'vitest'
import {
  buildPresentationSubmissionsSyncPayload,
  PRESENTATION_SUBMISSIONS_SYNC_MESSAGE,
  resolvePresentationSyncRequest,
  sendPresentationSubmissionsSync,
} from './presentation-submissions-sync'

const formId = 'ef52ae42-d475-4f24-81ba-51736630a01e'
const nonce = '9dfb4f53-97ee-43d5-b93d-426f10ae22fd'
const productionOrigin = 'https://tokushima-elementary-english-presentation-2026.vercel.app'

function syncSearch(target = productionOrigin): string {
  return new URLSearchParams({
    formId,
    presentation_sync_target: target,
    presentation_sync_nonce: nonce,
  }).toString()
}

const fields = [
  { name: 'student_name', label: '参加者氏名', type: 'text' },
  { name: 'school_grade', label: '学年', type: 'select' },
]

const submissions = [
  {
    id: 'submission-1',
    formId,
    friendId: 'friend-1',
    friendName: 'LINE表示名',
    data: { student_name: 'テスト児童', school_grade: '小学4年生' },
    createdAt: '2026-10-01T00:00:00.000Z',
  },
]

describe('presentation submissions sync', () => {
  it('accepts only the production manager and the two local development origins', () => {
    expect(resolvePresentationSyncRequest(syncSearch())).toEqual({
      targetOrigin: productionOrigin,
      formId,
      nonce,
    })
    expect(resolvePresentationSyncRequest(syncSearch('http://localhost:3000'))?.targetOrigin)
      .toBe('http://localhost:3000')
    expect(resolvePresentationSyncRequest(syncSearch('http://localhost:3010/'))?.targetOrigin)
      .toBe('http://localhost:3010')

    expect(resolvePresentationSyncRequest(syncSearch(`${productionOrigin}.evil.example`))).toBeNull()
    expect(resolvePresentationSyncRequest(syncSearch(`${productionOrigin}/admin`))).toBeNull()
    expect(resolvePresentationSyncRequest(syncSearch('http://localhost:3001'))).toBeNull()
    expect(resolvePresentationSyncRequest(syncSearch('https://example.com'))).toBeNull()
  })

  it('requires the receiver-provided nonce and target together with formId', () => {
    const missingNonce = new URLSearchParams({
      formId,
      presentation_sync_target: productionOrigin,
    }).toString()
    const shortNonce = new URLSearchParams({
      formId,
      presentation_sync_target: productionOrigin,
      presentation_sync_nonce: 'short',
    }).toString()
    const missingForm = new URLSearchParams({
      presentation_sync_target: productionOrigin,
      presentation_sync_nonce: nonce,
    }).toString()

    expect(resolvePresentationSyncRequest(missingNonce)).toBeNull()
    expect(resolvePresentationSyncRequest(shortNonce)).toBeNull()
    expect(resolvePresentationSyncRequest(missingForm)).toBeNull()
  })

  it('builds an explicit versioned payload and strips LINE identity data', () => {
    const request = resolvePresentationSyncRequest(syncSearch())!
    const payload = buildPresentationSubmissionsSyncPayload(
      request,
      '徳島県小学生英語プレゼンテーションコンテスト',
      [...fields, { name: 'lineUserId', label: 'internal' }],
      [{
        ...submissions[0],
        data: {
          ...submissions[0].data,
          lineUserId: 'U-sensitive',
          nested: { line_user_id: 'U-nested', answer: 'kept' },
        },
        lineUserId: 'U-top-level',
      }],
      '2026-10-01T01:02:03.000Z',
    )

    expect(payload).toMatchObject({
      type: PRESENTATION_SUBMISSIONS_SYNC_MESSAGE,
      version: 1,
      formId,
      formName: '徳島県小学生英語プレゼンテーションコンテスト',
      exportedAt: '2026-10-01T01:02:03.000Z',
      nonce,
    })
    expect(payload.fields.map((field) => field.name)).toEqual(['student_name', 'school_grade'])
    expect(payload.submissions[0]).toEqual({
      id: 'submission-1',
      formId,
      friendId: null,
      friendName: null,
      data: {
        student_name: 'テスト児童',
        school_grade: '小学4年生',
        nested: { answer: 'kept' },
      },
      createdAt: '2026-10-01T00:00:00.000Z',
    })
    expect(JSON.stringify(payload)).not.toContain('U-sensitive')
    expect(JSON.stringify(payload)).not.toContain('U-nested')
    expect(JSON.stringify(payload)).not.toContain('U-top-level')
    expect(JSON.stringify(payload)).not.toContain('friend-1')
    expect(JSON.stringify(payload)).not.toContain('LINE表示名')
  })

  it('posts only to the validated origin when opener and selected form match', () => {
    const postMessage = vi.fn()
    const result = sendPresentationSubmissionsSync({
      search: syncSearch(),
      selectedFormId: formId,
      formName: '大会参加申込',
      fields,
      submissions,
      opener: { closed: false, postMessage },
      exportedAt: '2026-10-01T01:02:03.000Z',
    })

    expect(result.ok).toBe(true)
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ formId, nonce }),
      productionOrigin,
    )
  })

  it('does not post without an opener or when the form context is inconsistent', () => {
    const postMessage = vi.fn()
    expect(sendPresentationSubmissionsSync({
      search: syncSearch(),
      selectedFormId: formId,
      formName: '大会参加申込',
      fields,
      submissions,
      opener: null,
    })).toEqual({ ok: false, reason: 'opener_missing' })

    expect(sendPresentationSubmissionsSync({
      search: syncSearch(),
      selectedFormId: 'another-form',
      formName: '大会参加申込',
      fields,
      submissions,
      opener: { closed: false, postMessage },
    })).toEqual({ ok: false, reason: 'form_mismatch' })

    expect(sendPresentationSubmissionsSync({
      search: syncSearch(),
      selectedFormId: formId,
      formName: '大会参加申込',
      fields,
      submissions: [{ ...submissions[0], formId: 'another-form' }],
      opener: { closed: false, postMessage },
    })).toEqual({ ok: false, reason: 'submission_form_mismatch' })

    expect(postMessage).not.toHaveBeenCalled()
  })
})
