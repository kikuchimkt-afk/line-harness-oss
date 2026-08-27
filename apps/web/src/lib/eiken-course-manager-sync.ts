import type { EventBookingFormField, EventBookingItem, EventDetail } from './api'

export const EIKEN_MANAGER_MESSAGE_TYPE = 'l-harness:eiken-course-reservations:v1'
export const EIKEN_MANAGER_READY_MESSAGE = 'eiken-course-manager:ready:v1'

const configuredEikenManagerOrigin =
  process.env.NEXT_PUBLIC_EIKEN_MANAGER_URL ??
  'https://eiken-intensive-course-manager-2026.vercel.app'

export const EIKEN_MANAGER_PRIMARY_ORIGIN = new URL(configuredEikenManagerOrigin).origin

const EIKEN_MANAGER_ALLOWED_ORIGINS = new Set([
  EIKEN_MANAGER_PRIMARY_ORIGIN,
  'https://eiken-intensive-course-manager-2026.makoto-keitai-list.chatgpt.site',
  'http://localhost:3000',
])

const STATUS_LABELS: Record<string, string> = {
  requested: '承認待ち',
  confirmed: '確定',
  rejected: '拒否',
  cancelled: 'キャンセル',
  expired: '期限切れ',
  attended: '参加済',
  no_show: '無断',
}

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export type EikenManagerSyncPayload = {
  type: typeof EIKEN_MANAGER_MESSAGE_TYPE
  version: 1
  eventId: string
  eventName: string
  exportedAt: string
  rows: unknown[][]
}

function parseAnswers(raw: EventBookingItem['form_answers']): Record<string, string | string[]> {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string | string[]>)
      : {}
  } catch {
    return {}
  }
}

function answerValue(booking: EventBookingItem, field: EventBookingFormField): string {
  const raw = parseAnswers(booking.form_answers)[field.id]
  return Array.isArray(raw) ? raw.join('、') : typeof raw === 'string' ? raw : ''
}

export function resolveEikenManagerOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const origin = new URL(value).origin
    return EIKEN_MANAGER_ALLOWED_ORIGINS.has(origin) ? origin : null
  } catch {
    return null
  }
}

export function buildEikenManagerSyncPayload(
  event: EventDetail,
  bookings: EventBookingItem[],
  fields: EventBookingFormField[],
  exportedAt = new Date().toISOString(),
): EikenManagerSyncPayload {
  const fieldsToSync = fields.filter((field) =>
    ['受講者氏名', '学年', '教室へ伝えておきたいこと'].includes(field.label),
  )
  const headers = [
    'イベント名',
    '予約日',
    '開始時刻',
    '終了時刻',
    '状態',
    ...fieldsToSync.map((field) => field.label),
    '受講会場',
    '備考',
    '受付日時',
  ]
  const rows = bookings
    .slice()
    .sort((a, b) => new Date(a.slot_starts_at).getTime() - new Date(b.slot_starts_at).getTime())
    .map((booking) => [
      event.name,
      dateFormatter.format(new Date(booking.slot_starts_at)),
      timeFormatter.format(new Date(booking.slot_starts_at)),
      timeFormatter.format(new Date(booking.slot_ends_at)),
      STATUS_LABELS[booking.status] ?? booking.status,
      ...fieldsToSync.map((field) => answerValue(booking, field)),
      event.venue_name ?? '',
      booking.customer_note ?? '',
      dateTimeFormatter.format(new Date(booking.requested_at)),
    ])

  return {
    type: EIKEN_MANAGER_MESSAGE_TYPE,
    version: 1,
    eventId: event.id,
    eventName: event.name,
    exportedAt,
    rows: [headers, ...rows],
  }
}
