'use client'

import { useEffect, useState } from 'react'

function getJstDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function NewBadge({ publishedAt, newUntil }: { publishedAt: string; newUntil?: string }) {
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    setToday(getJstDateKey())
  }, [])

  const visible = Boolean(today && newUntil && publishedAt <= today && today <= newUntil)

  return (
    <span className={visible ? 'badge badgeNew' : 'badgePlaceholder'} aria-hidden={!visible}>
      {visible ? '新着' : ''}
    </span>
  )
}
