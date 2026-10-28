import { describe, expect, it } from 'vitest'
import type { EventBookingItem, EventDetail, EventListItem } from '@/lib/api'
import { buildCombinedBookingRows, buildSelectedEventRows } from './multi-event-export'

const event = {
  id: 'event-1',
  name: '英検3級オンライン勉強会',
  venue_name: 'オンライン',
  is_published: 1,
  booking_form_fields: [
    { id: 'grade', label: '学年', type: 'select', required: true },
    { id: 'notes', label: '相談内容', type: 'textarea', required: false },
  ],
} as EventDetail

const booking = {
  id: 'booking-1',
  event_id: 'event-1',
  slot_id: 'slot-1',
  friend_id: 'friend-1',
  line_account_id: 'account-1',
  status: 'requested',
  customer_note: '筆記のポイントを知りたい',
  form_answers: JSON.stringify({ grade: '中2', notes: '長文読解', extra: '保護者同席' }),
  internal_note: '初参加',
  requested_at: '2026-07-27T13:52:00.000Z',
  decided_at: null,
  cancelled_at: null,
  cancelled_by: null,
  slot_starts_at: '2026-08-08T10:30:00.000Z',
  slot_ends_at: '2026-08-08T11:30:00.000Z',
  friend_display_name: '山田花子',
  friend_line_user_id: 'U123',
} as EventBookingItem

describe('multi event booking export', () => {
  it('combines different form answers into one readable cell', () => {
    const rows = buildCombinedBookingRows(
      [{ event, bookings: [booking] }],
      () => 'あいことば',
    )

    expect(rows[0]).toContain('イベント名')
    expect(rows[1][0]).toBe('英検3級オンライン勉強会')
    expect(rows[1][4]).toBe('承認待ち')
    expect(rows[1][6]).toBe('あいことば')
    expect(rows[1][8]).toBe('学年: 中2\n相談内容: 長文読解\nextra: 保護者同席')
  })

  it('includes selected events even when they have no bookings', () => {
    const rows = buildSelectedEventRows([
      {
        ...event,
        next_slot_starts_at: null,
        total_active: 0,
        pending_count: 0,
        total_capacity: null,
      } as EventListItem,
    ])

    expect(rows[1]).toEqual([
      '英検3級オンライン勉強会',
      '公開中',
      '日時未設定',
      0,
      0,
      '無制限',
      'オンライン',
    ])
  })
})
