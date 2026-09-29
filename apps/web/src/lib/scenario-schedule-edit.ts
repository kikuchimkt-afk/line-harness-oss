import type { ScenarioManualStartEnrollment, ScenarioManualStartStep } from './scenario-manual-start'

const JST_OFFSET_MS = 9 * 60 * 60_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export type ScenarioScheduleUpdateResult = {
  enrollment: ScenarioManualStartEnrollment
  nextStep: ScenarioManualStartStep
  stateVersion: string
}

export type JstScheduleInput = {
  date: string
  time: string
}

export type JstScheduleValidation =
  | { ok: true; iso: string }
  | { ok: false; error: string }

export function scenarioScheduleHasChanges(input: {
  currentStepId: string
  nextStepId: string
  current: JstScheduleInput
  next: JstScheduleInput
}): boolean {
  return input.currentStepId !== input.nextStepId
    || input.current.date !== input.next.date
    || input.current.time !== input.next.time
}

export function scenarioScheduleNeedsAcknowledgement(input: {
  selectedStepOrder: number | null
  sentStepOrders: Iterable<number>
  skippedStepOrders: readonly number[]
}): boolean {
  if (input.selectedStepOrder === null) return false
  return new Set(input.sentStepOrders).has(input.selectedStepOrder)
    || input.skippedStepOrders.length > 0
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function parseStoredDateTime(value: string): Date {
  const trimmed = value.trim()
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
  const isoLike = trimmed.replace(' ', 'T')
  return new Date(hasTimeZone ? isoLike : `${isoLike}+09:00`)
}

/** Convert persisted timestamps to the values expected by JST date/time inputs. */
export function jstScheduleInputFromStored(value: string | null | undefined): JstScheduleInput {
  if (!value) return { date: '', time: '' }
  const instant = parseStoredDateTime(value)
  if (Number.isNaN(instant.getTime())) return { date: '', time: '' }
  const jstClock = new Date(instant.getTime() + JST_OFFSET_MS)
  return {
    date: `${jstClock.getUTCFullYear()}-${pad2(jstClock.getUTCMonth() + 1)}-${pad2(jstClock.getUTCDate())}`,
    time: `${pad2(jstClock.getUTCHours())}:${pad2(jstClock.getUTCMinutes())}`,
  }
}

/** Validate a future JST wall-clock value and serialize it with an explicit +09:00 offset. */
export function validateJstScheduleInput(
  date: string,
  time: string,
  now: Date = new Date(),
): JstScheduleValidation {
  const dateMatch = DATE_RE.exec(date)
  const timeMatch = TIME_RE.exec(time)
  if (!dateMatch || !timeMatch) {
    return { ok: false, error: '配信日と時刻を入力してください。' }
  }

  const iso = `${date}T${time}:00.000+09:00`
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) {
    return { ok: false, error: '正しい配信日時を入力してください。' }
  }

  // JavaScript normalizes impossible values such as 2026-02-31, so compare the
  // parsed JST clock back to the original input before accepting it.
  const roundTrip = jstScheduleInputFromStored(iso)
  if (roundTrip.date !== date || roundTrip.time !== time) {
    return { ok: false, error: '正しい配信日時を入力してください。' }
  }
  if (instant.getTime() <= now.getTime()) {
    return { ok: false, error: '現在より後の配信日時を指定してください。' }
  }
  return { ok: true, iso }
}
