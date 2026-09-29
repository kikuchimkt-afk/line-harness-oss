import { describe, expect, test } from 'vitest'

import {
  jstScheduleInputFromStored,
  scenarioScheduleHasChanges,
  validateJstScheduleInput,
} from './scenario-schedule-edit'

describe('scenario schedule edit helpers', () => {
  test('converts offset and legacy JST timestamps into date/time controls', () => {
    expect(jstScheduleInputFromStored('2026-10-01T18:32:00.000+09:00')).toEqual({
      date: '2026-10-01',
      time: '18:32',
    })
    expect(jstScheduleInputFromStored('2026-10-01 18:32:00.000')).toEqual({
      date: '2026-10-01',
      time: '18:32',
    })
  })

  test('serializes a future JST wall-clock with an explicit offset', () => {
    expect(validateJstScheduleInput(
      '2026-10-01',
      '18:32',
      new Date('2026-09-29T06:00:00.000Z'),
    )).toEqual({ ok: true, iso: '2026-10-01T18:32:00.000+09:00' })
  })

  test('does not enable saving until the step or scheduled minute changes', () => {
    const current = { date: '2026-10-01', time: '18:32' }
    expect(scenarioScheduleHasChanges({
      currentStepId: 'step-2',
      nextStepId: 'step-2',
      current,
      next: { ...current },
    })).toBe(false)
    expect(scenarioScheduleHasChanges({
      currentStepId: 'step-2',
      nextStepId: 'step-3',
      current,
      next: { ...current },
    })).toBe(true)
    expect(scenarioScheduleHasChanges({
      currentStepId: 'step-2',
      nextStepId: 'step-2',
      current,
      next: { ...current, time: '19:00' },
    })).toBe(true)
  })

  test.each([
    ['', '18:30', '配信日と時刻'],
    ['2026-10-01', '', '配信日と時刻'],
    ['2026-02-31', '18:30', '正しい配信日時'],
    ['2026-09-29', '14:59', '現在より後'],
  ])('rejects invalid or past values: %s %s', (date, time, message) => {
    const result = validateJstScheduleInput(
      date,
      time,
      new Date('2026-09-29T06:00:00.000Z'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(message)
  })
})
