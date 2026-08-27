import { describe, expect, it } from 'vitest'
import type { EventBookingFormField, EventBookingItem, EventDetail } from './api'
import {
  buildEikenManagerSyncPayload,
  EIKEN_MANAGER_MESSAGE_TYPE,
  resolveEikenManagerOrigin,
} from './eiken-course-manager-sync'

const event = {
  id: 'eiken-intensive-2026-autumn',
  name: '英検集中講座｜開講日程予約',
  venue_name: '藍住校',
} as EventDetail

const fields: EventBookingFormField[] = [
  { id: 'student', label: '受講者氏名', type: 'text', required: true },
  { id: 'grade', label: '学年', type: 'select', required: true },
]

const booking = {
  id: 'b1',
  event_id: event.id,
  slot_id: 's1',
  friend_id: 'f1',
  line_account_id: 'la1',
  status: 'confirmed',
  customer_note: '単語帳を持参します',
  form_answers: JSON.stringify({ student: '受講 太郎', grade: '中学3年' }),
  internal_note: null,
  requested_at: '2026-08-27T01:00:00.000Z',
  decided_at: '2026-08-27T02:00:00.000Z',
  cancelled_at: null,
  cancelled_by: null,
  slot_starts_at: '2026-09-01T07:00:00.000Z',
  slot_ends_at: '2026-09-01T09:00:00.000Z',
  friend_display_name: '保護者',
  friend_line_user_id: 'U1',
} satisfies EventBookingItem

describe('Eiken course manager sync', () => {
  it('accepts only the configured manager origins', () => {
    expect(resolveEikenManagerOrigin('https://eiken-intensive-course-manager-2026.vercel.app/path'))
      .toBe('https://eiken-intensive-course-manager-2026.vercel.app')
    expect(resolveEikenManagerOrigin('https://example.com')).toBeNull()
  })

  it('creates Excel-compatible rows without sending credentials', () => {
    const payload = buildEikenManagerSyncPayload(event, [booking], fields, '2026-08-27T03:00:00.000Z')

    expect(payload.type).toBe(EIKEN_MANAGER_MESSAGE_TYPE)
    expect(payload.rows[0]).toContain('受講者氏名')
    expect(payload.rows[1]).toEqual(expect.arrayContaining([
      '英検集中講座｜開講日程予約',
      '2026/09/01',
      '16:00',
      '18:00',
      '確定',
      '受講 太郎',
      '中学3年',
    ]))
    expect(JSON.stringify(payload)).not.toContain('U1')
    expect(JSON.stringify(payload)).not.toContain('保護者')
  })
})
