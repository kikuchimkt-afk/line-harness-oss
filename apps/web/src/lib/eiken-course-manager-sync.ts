import type { EventBookingFormField, EventBookingItem, EventDetail } from './api'

export const EIKEN_MANAGER_MESSAGE_TYPE = 'l-harness:eiken-course-reservations:v1'
export const EIKEN_MANAGER_READY_MESSAGE = 'eiken-course-manager:ready:v1'

const configuredEikenManagerOrigin =
  process.env.NEXT_PUBLIC_EIKEN_MANAGER_URL ??
  'https://eiken-intensive-course-manager-2026.vercel.app'

export const EIKEN_MANAGER_PRIMARY_ORIGIN = new URL(configuredEikenManagerOrigin).origin

const EIKEN_MANAGER_ALLOWED_ORIGINS = new Set([
  EIKEN_MANAGER_PRIMARY_ORIGIN,
  // Vercel は長いプロジェクト名を切り詰めて本番ドメインを作る。
  // 実際に配信されるのは -ro のほうで、-round2 は保護付きの別名にしかならない。
  'https://eiken-study-meeting-manager-2026-ro.vercel.app',
  'https://eiken-study-meeting-manager-2026-round2.vercel.app',
  'https://tokushima-elementary-english-presentation-2026.vercel.app',
  'https://eiken-intensive-course-manager-2026.makoto-keitai-list.chatgpt.site',
  'http://localhost:3000',
])

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

/**
 * 参加申込フォームの回答を、表示できる文字列にそろえる。
 *
 * 回答は friends.metadata に JSON で入り、SQLite の json_extract をそのまま
 * 通すため、チェックボックス設問は '["5級"]' のような JSON 文字列で届く。
 * これを剥がさないと画面にも Excel にも角括弧付きで出てしまう。
 */
export function friendAnswerText(value: string | null | undefined): string {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text) return ''
  if (!text.startsWith('[') && !text.startsWith('"')) return text
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? '').trim()).filter(Boolean).join('、')
    if (typeof parsed === 'string') return parsed.trim()
  } catch {
    // JSON として読めなければ、元の文字列をそのまま見せる
  }
  return text
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
  const studentNameField = fields.find((field) => field.label === '受講者氏名')
  const schoolGradeField = fields.find((field) => field.label === '学年')
  const messageField = fields.find((field) => field.label === '教室へ伝えておきたいこと')
  const courseLevelField = fields.find((field) =>
    ['受講級', '受検予定級', '受検級', '受験級', '英検級'].includes(field.label),
  )
  // 日程予約側のフォームは運用で外してあるため、通常はこちらが空になる。
  // その場合は参加申込フォームの回答（friends.metadata）で補う。
  const studentNameFor = (booking: EventBookingItem) =>
    (studentNameField ? answerValue(booking, studentNameField) : '') ||
    friendAnswerText(booking.friend_student_name) ||
    booking.friend_display_name ||
    ''
  const schoolGradeFor = (booking: EventBookingItem) =>
    (schoolGradeField ? answerValue(booking, schoolGradeField) : '') ||
    friendAnswerText(booking.friend_school_grade)
  const courseLevelFor = (booking: EventBookingItem) =>
    (courseLevelField ? answerValue(booking, courseLevelField) : '') ||
    friendAnswerText(booking.friend_course_level)
  const messageFor = (booking: EventBookingItem) =>
    (messageField ? answerValue(booking, messageField) : '') ||
    friendAnswerText(booking.friend_request_note)
  const headers = [
    'イベント名',
    '予約日',
    '開始時刻',
    '終了時刻',
    '状態',
    '受講者氏名',
    '学年',
    '受講級',
    '教室へ伝えておきたいこと',
    '受講会場',
    '備考',
    '受付日時',
  ]
  const rows = bookings
    .slice()
    .sort((a, b) => new Date(a.slot_starts_at).getTime() - new Date(b.slot_starts_at).getTime())
    .map((booking) => {
      return [
        event.name,
        dateFormatter.format(new Date(booking.slot_starts_at)),
        timeFormatter.format(new Date(booking.slot_starts_at)),
        timeFormatter.format(new Date(booking.slot_ends_at)),
        STATUS_LABELS[booking.status] ?? booking.status,
        studentNameFor(booking),
        schoolGradeFor(booking),
        courseLevelFor(booking),
        messageFor(booking),
        event.venue_name ?? '',
        booking.customer_note ?? '',
        dateTimeFormatter.format(new Date(booking.requested_at)),
      ]
    })

  return {
    type: EIKEN_MANAGER_MESSAGE_TYPE,
    version: 1,
    eventId: event.id,
    eventName: event.name,
    exportedAt,
    rows: [headers, ...rows],
  }
}
