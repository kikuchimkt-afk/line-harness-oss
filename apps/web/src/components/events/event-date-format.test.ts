import { describe, expect, test } from 'vitest'
import { formatEventSlotDateTime, formatEventSlotTime } from './event-date-format.js'

describe('event slot date format', () => {
  test('shows the Japanese weekday in JST', () => {
    expect(formatEventSlotDateTime('2026-07-28T05:30:00.000Z'))
      .toBe('2026/07/28（火）14:30')
  })

  test('calculates the weekday after crossing midnight in JST', () => {
    expect(formatEventSlotDateTime('2026-07-28T15:30:00.000Z'))
      .toBe('2026/07/29（水）00:30')
  })

  test('formats the end time without repeating the date', () => {
    expect(formatEventSlotTime('2026-07-28T08:30:00.000Z')).toBe('17:30')
  })
})
