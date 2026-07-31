import type { EventBookingItem } from '@/lib/api'

const JST_DATE_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export interface EventBookingStatusCounts {
  total: number
  requested: number
  confirmed: number
  other: number
}

export function eventBookingDateKey(iso: string): string {
  const parts = JST_DATE_FORMATTER.formatToParts(new Date(iso))
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = parts.find((part) => part.type === 'day')?.value ?? ''
  return `${year}-${month}-${day}`
}

export function buildEventBookingCalendarIndex(items: EventBookingItem[]): {
  items: EventBookingItem[]
  byDate: Map<string, EventBookingItem[]>
} {
  const sortedItems = items
    .slice()
    .sort((a, b) => new Date(a.slot_starts_at).getTime() - new Date(b.slot_starts_at).getTime())
  const byDate = new Map<string, EventBookingItem[]>()

  for (const booking of sortedItems) {
    const key = eventBookingDateKey(booking.slot_starts_at)
    const dateItems = byDate.get(key) ?? []
    dateItems.push(booking)
    byDate.set(key, dateItems)
  }

  return { items: sortedItems, byDate }
}

export function countEventBookingStatuses(items: EventBookingItem[]): EventBookingStatusCounts {
  const requested = items.filter((booking) => booking.status === 'requested').length
  const confirmed = items.filter((booking) => booking.status === 'confirmed').length
  return {
    total: items.length,
    requested,
    confirmed,
    other: items.length - requested - confirmed,
  }
}
