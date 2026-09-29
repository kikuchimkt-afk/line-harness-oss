export type ScenarioSentDelivery = {
  id: string
  friendId: string
  displayName: string
  pictureUrl: string | null
  stepOrder: number
  sentAt: string
  messageType: string
  sendCount: number
}

export type ScenarioUpcomingDelivery = {
  enrollmentId: string
  friendId: string
  displayName: string
  pictureUrl: string | null
  status: string
  startedAt: string
  nextDeliveryAt: string
  updatedAt: string
  nextStepOrder: number
  messageType: string
}

export type ScenarioDeliveryStatus = {
  generatedAt: string
  /** Successful scenario message rows stored in messages_log. */
  sentMessageTotal: number
  /** Logical friend + scenario-step groups with at least one successful send record. */
  sentDeliveryTotal: number
  sentRecipientTotal: number
  upcomingRecipientTotal: number
  sentHasMore: boolean
  upcomingHasMore: boolean
  sent: ScenarioSentDelivery[]
  upcoming: ScenarioUpcomingDelivery[]
}

export type UpcomingStateTone = 'green' | 'blue' | 'amber' | 'gray' | 'red'

export type UpcomingStatePresentation = {
  label: string
  tone: UpcomingStateTone
}

const JST_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const JST_SHORT_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parseStoredDateTime(value: string): Date {
  const trimmed = value.trim()
  // Legacy D1 timestamps are stored as JST wall-clock values without an
  // offset. Treating them as browser-local time makes the display depend on
  // the staff device timezone, so make the persisted JST meaning explicit.
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
  const isoLike = trimmed.replace(' ', 'T')
  const normalized = hasTimeZone
    ? isoLike
    : `${isoLike}+09:00`
  return new Date(normalized)
}

function dateTimeMillis(value: string): number {
  return parseStoredDateTime(value).getTime()
}

function formatWith(formatter: Intl.DateTimeFormat, value: string | null | undefined): string | null {
  if (!value) return null
  const date = parseStoredDateTime(value)
  if (Number.isNaN(date.getTime())) return null
  return formatter.format(date)
}

export function formatJstDateTime(value: string | null | undefined): string {
  return formatWith(JST_FORMATTER, value) ?? '日時を確認'
}

export function formatJstShort(value: string | null | undefined): string {
  return formatWith(JST_SHORT_FORMATTER, value) ?? '日時を確認'
}

export function messageTypeLabel(messageType: string): string {
  if (messageType === 'text') return 'テキスト'
  if (messageType === 'image') return '画像'
  if (messageType === 'flex') return 'Flex'
  return messageType || '形式不明'
}

export function upcomingStatePresentation(input: {
  scenarioIsActive: boolean
  status: string
  nextDeliveryAt: string
  generatedAt: string
  updatedAt: string
}): UpcomingStatePresentation {
  if (!input.scenarioIsActive) {
    return { label: 'シナリオ停止中', tone: 'gray' }
  }
  if (input.status === 'paused') {
    return { label: '一時停止中', tone: 'gray' }
  }
  if (input.status === 'delivering') {
    const generatedAt = dateTimeMillis(input.generatedAt)
    const updatedAt = dateTimeMillis(input.updatedAt)
    if (Number.isFinite(generatedAt) && Number.isFinite(updatedAt) && generatedAt - updatedAt > 5 * 60 * 1000) {
      return { label: '再処理待ち', tone: 'amber' }
    }
    return { label: '送信処理中', tone: 'blue' }
  }
  if (input.status !== 'active') {
    return { label: '状態を確認', tone: 'red' }
  }

  const scheduledAt = dateTimeMillis(input.nextDeliveryAt)
  const generatedAt = dateTimeMillis(input.generatedAt)
  if (Number.isFinite(scheduledAt) && Number.isFinite(generatedAt) && scheduledAt <= generatedAt) {
    return { label: '配信処理待ち', tone: 'amber' }
  }
  return { label: '配信予定', tone: 'green' }
}

export function filterByDisplayName<T extends { displayName: string }>(items: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase('ja-JP')
  if (!normalized) return items
  return items.filter((item) => item.displayName.toLocaleLowerCase('ja-JP').includes(normalized))
}
