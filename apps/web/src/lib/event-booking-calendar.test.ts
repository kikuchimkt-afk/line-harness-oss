import { describe, expect, it } from 'vitest'
import type { EventBookingItem } from '@/lib/api'
import {
  buildEventBookingCalendarIndex,
  countEventBookingStatuses,
  eventBookingDateKey,
} from './event-booking-calendar'

function booking(id: string, status: string, slotStartsAt: string): EventBookingItem {
  return {
    id,
    event_id: 'event-1',
    slot_id: `slot-${id}`,
    friend_id: `friend-${id}`,
    line_account_id: 'account-1',
    status,
    customer_note: null,
    form_answers: null,
    internal_note: null,
    requested_at: '2026-07-01T00:00:00.000Z',
    decided_at: null,
    cancelled_at: null,
    cancelled_by: null,
    slot_starts_at: slotStartsAt,
    slot_ends_at: slotStartsAt,
    friend_display_name: id,
    friend_line_user_id: `line-${id}`,
  }
}

describe('event booking calendar data', () => {
  it('excludes cancelled bookings while preserving the other booking states', () => {
    const items = [
      booking('cancelled', 'cancelled', '2026-08-21T09:40:00.000Z'),
      booking('requested', 'requested', '2026-08-21T09:40:00.000Z'),
      booking('waitlisted', 'waitlisted', '2026-08-21T09:40:00.000Z'),
      booking('rejected', 'rejected', '2026-08-21T09:40:00.000Z'),
      booking('confirmed', 'confirmed', '2026-08-21T09:40:00.000Z'),
      booking('attended', 'attended', '2026-08-21T09:40:00.000Z'),
      booking('no-show', 'no_show', '2026-08-21T09:40:00.000Z'),
      booking('expired', 'expired', '2026-08-21T09:40:00.000Z'),
    ]

    const result = buildEventBookingCalendarIndex(items)
    const dayItems = result.byDate.get('2026-08-21') ?? []

    expect(dayItems).toHaveLength(7)
    expect(dayItems.map((item) => item.status)).toEqual([
      'requested',
      'waitlisted',
      'rejected',
      'confirmed',
      'attended',
      'no_show',
      'expired',
    ])
    expect(countEventBookingStatuses(dayItems)).toEqual({
      total: 7,
      requested: 1,
      waitlisted: 1,
      confirmed: 1,
      other: 4,
    })
  })

  it('does not count cancelled bookings when given an unfiltered list', () => {
    const items = [
      booking('cancelled', 'cancelled', '2026-08-21T09:40:00.000Z'),
      booking('confirmed', 'confirmed', '2026-08-21T09:40:00.000Z'),
    ]

    expect(countEventBookingStatuses(items)).toEqual({
      total: 1,
      requested: 0,
      waitlisted: 0,
      confirmed: 1,
      other: 0,
    })
  })

  it('removes a date that contains only cancelled bookings', () => {
    const result = buildEventBookingCalendarIndex([
      booking('cancelled', 'cancelled', '2026-08-21T09:40:00.000Z'),
    ])

    expect(result.items).toEqual([])
    expect(result.byDate.has('2026-08-21')).toBe(false)
  })

  it('uses Japan time when assigning a booking to a calendar day', () => {
    expect(eventBookingDateKey('2026-08-21T15:30:00.000Z')).toBe('2026-08-22')
  })
})
