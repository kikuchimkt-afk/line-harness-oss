const JST_TIME_ZONE = 'Asia/Tokyo'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

function jstParts(iso: string): {
  year: string
  month: string
  day: string
  hour: string
  minute: string
} {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  }
}

function jstWeekday(iso: string): string {
  const date = new Date(iso)
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return WEEKDAYS[jstDate.getUTCDay()]
}

export function formatEventSlotDateTime(iso: string): string {
  const parts = jstParts(iso)
  return `${parts.year}/${parts.month}/${parts.day}（${jstWeekday(iso)}）${parts.hour}:${parts.minute}`
}

export function formatEventSlotTime(iso: string): string {
  const parts = jstParts(iso)
  return `${parts.hour}:${parts.minute}`
}
