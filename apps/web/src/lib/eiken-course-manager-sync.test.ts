import { describe, expect, it } from 'vitest'
import type { EventBookingFormField, EventBookingItem, EventDetail } from './api'
import {
  buildEventBookingsSyncPayload,
  buildEikenManagerSyncPayload,
  buildManagerSyncPayload,
  EIKEN_MANAGER_MESSAGE_TYPE,
  EVENT_BOOKINGS_MESSAGE_TYPE,
  friendAnswerText,
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
  friend_course_level: '3級',
} satisfies EventBookingItem

describe('Eiken course manager sync', () => {
  it('accepts only the configured manager origins', () => {
    expect(resolveEikenManagerOrigin('https://eiken-intensive-course-manager-2026.vercel.app/path'))
      .toBe('https://eiken-intensive-course-manager-2026.vercel.app')
    expect(resolveEikenManagerOrigin('https://eiken-study-meeting-manager-2026-round2.vercel.app/calendar'))
      .toBe('https://eiken-study-meeting-manager-2026-round2.vercel.app')
    // Vercel が名前を切り詰めて実際に配信するのはこちら。ここが漏れると同期が無言で止まる。
    expect(resolveEikenManagerOrigin('https://eiken-study-meeting-manager-2026-ro.vercel.app/calendar'))
      .toBe('https://eiken-study-meeting-manager-2026-ro.vercel.app')
    expect(resolveEikenManagerOrigin('https://tokushima-elementary-english-presentation-2026.vercel.app/admin'))
      .toBe('https://tokushima-elementary-english-presentation-2026.vercel.app')
    expect(resolveEikenManagerOrigin('https://ecc-preschool-autumn-events.vercel.app/admin'))
      .toBe('https://ecc-preschool-autumn-events.vercel.app')
    expect(resolveEikenManagerOrigin('https://example.com')).toBeNull()
  })

  it('creates a detailed generic payload for the picture-book event manager', () => {
    const pictureBookEvent = {
      ...event,
      id: '887d5545-7b60-425d-9c24-91d36e84d1ed',
      name: '【幼児】土曜・英語絵本イベント｜2026秋冬',
      venue_name: null,
    } as EventDetail
    const pictureBookFields: EventBookingFormField[] = [
      { id: 'venue', label: '受講希望教室', type: 'select', required: true },
      { id: 'guardian', label: '保護者さまのお名前', type: 'text', required: true },
      { id: 'child', label: 'お子さまのお名前（ひらがな）', type: 'text', required: true },
      { id: 'age', label: 'お子さまの年齢', type: 'select', required: true },
      { id: 'phone', label: '当日連絡のつく電話番号', type: 'text', required: true },
      { id: 'care', label: 'アレルギー・配慮事項', type: 'textarea', required: false },
    ]
    const pictureBookBooking: EventBookingItem = {
      ...booking,
      id: 'booking-preschool-1',
      event_id: pictureBookEvent.id,
      slot_id: 'slot-preschool-1',
      form_answers: {
        venue: '藍住教室（藍住町）',
        guardian: '山田 花子',
        child: 'やまだ はな',
        age: '3歳児',
        phone: '090-1234-5678',
        care: '卵アレルギー',
      },
      friend_display_name: 'はなママ',
    }

    const payload = buildEventBookingsSyncPayload(
      pictureBookEvent,
      [pictureBookBooking],
      pictureBookFields,
      '2026-09-22T03:00:00.000Z',
    )

    expect(payload.type).toBe(EVENT_BOOKINGS_MESSAGE_TYPE)
    expect(payload.rows[0]).toEqual(expect.arrayContaining([
      '予約ID',
      '枠ID',
      '子どもの名前',
      '保護者名',
      '年齢・学年',
      '電話番号',
      '受講会場',
      '連絡事項',
    ]))
    expect(payload.rows[1]).toEqual(expect.arrayContaining([
      'booking-preschool-1',
      'slot-preschool-1',
      'やまだ はな',
      '山田 花子',
      '3歳児',
      '090-1234-5678',
      '藍住教室',
      '卵アレルギー',
      'はなママ',
    ]))
    expect(JSON.stringify(payload)).not.toContain('U1')
  })

  it('selects the generic format only for the two picture-book events', () => {
    const preschool = buildManagerSyncPayload(
      { ...event, id: '887d5545-7b60-425d-9c24-91d36e84d1ed' } as EventDetail,
      [booking],
      fields,
    )
    const elementary = buildManagerSyncPayload(
      { ...event, id: 'dec4cc02-3d28-41d0-a725-642a1364dafd' } as EventDetail,
      [booking],
      fields,
    )
    const eiken = buildManagerSyncPayload(event, [booking], fields)

    expect(preschool.type).toBe(EVENT_BOOKINGS_MESSAGE_TYPE)
    expect(elementary.type).toBe(EVENT_BOOKINGS_MESSAGE_TYPE)
    expect(eiken.type).toBe(EIKEN_MANAGER_MESSAGE_TYPE)
    expect(eiken.rows[0]).toHaveLength(12)
  })

  it('uses stable booking field ids even when display labels change', () => {
    const pictureBookEvent = {
      ...event,
      id: '887d5545-7b60-425d-9c24-91d36e84d1ed',
      venue_name: '藍住・大学前・北島中央教室',
    } as EventDetail
    const renamedFields: EventBookingFormField[] = [
      { id: 'field_5637a98b', label: '会場（変更後）', type: 'select', required: true },
      { id: 'guardian_name', label: '保護者（変更後）', type: 'text', required: true },
      { id: 'child_name', label: '参加者（変更後）', type: 'text', required: true },
      { id: 'child_age', label: '区分（変更後）', type: 'select', required: true },
      { id: 'field_3fcbb927', label: '連絡先（変更後）', type: 'text', required: true },
      { id: 'considerations', label: '備考（変更後）', type: 'textarea', required: false },
    ]
    const renamedBooking: EventBookingItem = {
      ...booking,
      id: 'booking-kitajima-1',
      event_id: pictureBookEvent.id,
      form_answers: {
        field_5637a98b: '北島中央教室（北島町）',
        guardian_name: '保護者A',
        child_name: 'こどもA',
        child_age: '5歳児',
        field_3fcbb927: '090-0000-0000',
        considerations: '特になし',
      },
    }

    const payload = buildManagerSyncPayload(pictureBookEvent, [renamedBooking], renamedFields)

    expect(payload.type).toBe(EVENT_BOOKINGS_MESSAGE_TYPE)
    expect(payload.rows[1]).toEqual(expect.arrayContaining([
      'こどもA',
      '保護者A',
      '5歳児',
      '090-0000-0000',
      '北島中央教室',
      '特になし',
    ]))
    expect(payload.rows[1]).not.toContain('藍住・大学前・北島中央教室')
  })

  it('does not replace an empty explicit classroom answer with a combined event venue', () => {
    const pictureBookEvent = {
      ...event,
      id: '887d5545-7b60-425d-9c24-91d36e84d1ed',
      venue_name: '藍住・大学前・北島中央教室',
    } as EventDetail
    const venueField: EventBookingFormField = {
      id: 'field_5637a98b',
      label: '受講希望教室',
      type: 'select',
      required: true,
    }
    const payload = buildEventBookingsSyncPayload(
      pictureBookEvent,
      [{ ...booking, form_answers: { field_5637a98b: '' } }],
      [venueField],
    )

    expect(payload.rows[1][11]).toBe('')
  })

  it('creates Excel-compatible rows without sending credentials', () => {
    const payload = buildEikenManagerSyncPayload(event, [booking], fields, '2026-08-27T03:00:00.000Z')

    expect(payload.type).toBe(EIKEN_MANAGER_MESSAGE_TYPE)
    expect(payload.rows[0]).toContain('受講者氏名')
    expect(payload.rows[0]).toContain('受講級')
    expect(payload.rows[1]).toEqual(expect.arrayContaining([
      '英検集中講座｜開講日程予約',
      '2026/09/01',
      '16:00',
      '18:00',
      '確定',
      '受講 太郎',
      '中学3年',
      '3級',
    ]))
    expect(JSON.stringify(payload)).not.toContain('U1')
    expect(JSON.stringify(payload)).not.toContain('保護者')
  })

  it('uses the LINE display name when an event has no booking form fields', () => {
    const payload = buildEikenManagerSyncPayload(
      { ...event, id: 'study-meeting', name: '2026年度第2回英検勉強会' } as EventDetail,
      [{ ...booking, form_answers: '{}', friend_display_name: '受講 花子', friend_course_level: null }],
      [],
      '2026-09-09T03:00:00.000Z',
    )

    expect(payload.rows[0]).toEqual(expect.arrayContaining(['受講者氏名', '学年', '受講級']))
    expect(payload.rows[1]).toEqual(expect.arrayContaining(['受講 花子', '']))
    expect(JSON.stringify(payload)).not.toContain('U1')
  })

  it('flattens checkbox answers stored as JSON text', () => {
    // json_extract を通した回答は、チェックボックス設問だと
    // '["5級"]' のような JSON 文字列で届く。そのまま出すと角括弧が見える。
    expect(friendAnswerText('["5級"]')).toBe('5級')
    expect(friendAnswerText('["5級","4級"]')).toBe('5級、4級')
    expect(friendAnswerText('"準2級"')).toBe('準2級')
    // ラジオやテキストの回答はそのまま
    expect(friendAnswerText('準2級')).toBe('準2級')
    expect(friendAnswerText('中学2年生')).toBe('中学2年生')
    // 未回答
    expect(friendAnswerText(null)).toBe('')
    expect(friendAnswerText(undefined)).toBe('')
    expect(friendAnswerText('')).toBe('')
    // 壊れた JSON でも中身を捨てない
    expect(friendAnswerText('[壊れています')).toBe('[壊れています')
  })
})
