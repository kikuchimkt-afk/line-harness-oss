import type {
  EventBookingFormField,
  EventBookingItem,
  EventDetail,
  EventListItem,
} from '@/lib/api'
import type { SpreadsheetCell } from './xlsx-export'

export interface EventBookingExportSource {
  event: EventDetail
  bookings: EventBookingItem[]
}

const STATUS_LABELS: Record<string, string> = {
  requested: '承認待ち',
  waitlisted: 'キャンセル待ち',
  confirmed: '確定',
  rejected: '拒否',
  cancelled: 'キャンセル',
  expired: '期限切れ',
  attended: '参加済',
  no_show: '無断',
}

function parseFormFields(raw: EventDetail['booking_form_fields']): EventBookingFormField[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as EventBookingFormField[]) : []
  } catch {
    return []
  }
}

function parseAnswers(raw: EventBookingItem['form_answers']): Record<string, string | string[]> {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, string | string[]>
  }
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

function answerText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join('、') : value ?? ''
}

function combinedAnswerText(event: EventDetail, booking: EventBookingItem): string {
  const answers = parseAnswers(booking.form_answers)
  const fields = parseFormFields(event.booking_form_fields)
  const knownIds = new Set(fields.map((field) => field.id))
  const lines = fields
    .map((field) => {
      const value = answerText(answers[field.id])
      return value ? `${field.label}: ${value}` : ''
    })
    .filter(Boolean)

  for (const [key, rawValue] of Object.entries(answers)) {
    if (knownIds.has(key)) continue
    const value = answerText(rawValue)
    if (value) lines.push(`${key}: ${value}`)
  }
  return lines.join('\n')
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateWithWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildCombinedBookingRows(
  sources: EventBookingExportSource[],
  accountLabel: (accountId: string) => string,
): SpreadsheetCell[][] {
  const rows = sources
    .flatMap(({ event, bookings }) =>
      bookings.map((booking) => ({ event, booking })),
    )
    .sort((a, b) => {
      const timeDiff =
        new Date(a.booking.slot_starts_at).getTime()
        - new Date(b.booking.slot_starts_at).getTime()
      return timeDiff || a.event.name.localeCompare(b.event.name, 'ja')
    })

  return [
    [
      'イベント名',
      '予約日',
      '開始時刻',
      '終了時刻',
      '状態',
      '友だち',
      '経由アカウント',
      '受付日時',
      '回答内容',
      '備考',
      '内部メモ',
    ],
    ...rows.map(({ event, booking }) => [
      event.name,
      formatDateWithWeekday(booking.slot_starts_at),
      formatTime(booking.slot_starts_at),
      formatTime(booking.slot_ends_at),
      STATUS_LABELS[booking.status] ?? booking.status,
      booking.friend_display_name ?? booking.friend_id,
      accountLabel(booking.line_account_id),
      formatDateTime(booking.requested_at),
      combinedAnswerText(event, booking),
      booking.customer_note ?? '',
      booking.internal_note ?? '',
    ]),
  ]
}

export function buildSelectedEventRows(events: EventListItem[]): SpreadsheetCell[][] {
  return [
    [
      'イベント名',
      '公開状態',
      '次回日時',
      '予約数',
      '承認待ち',
      '総定員',
      '開催場所',
    ],
    ...events.map((event) => [
      event.name,
      event.is_published === 1 ? '公開中' : '下書き',
      event.next_slot_starts_at ? formatDateTime(event.next_slot_starts_at) : '日時未設定',
      event.total_active,
      event.pending_count,
      event.total_capacity ?? '無制限',
      event.venue_name ?? '',
    ]),
  ]
}
