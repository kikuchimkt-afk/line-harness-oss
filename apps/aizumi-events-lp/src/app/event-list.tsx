'use client'

import type { EventItem } from './events'
import { NewBadge } from './new-badge'

export function EventList({ items }: { items: EventItem[] }) {
  return (
    <div className="eventGrid">
      {items.map((event) => {
        const linkLabel = event.external ? '案内PDFを見る' : '講座の詳細を見る'

        return (
          <article
            className="eventCard"
            key={event.id}
          >
            <div className="eventMeta">
              <NewBadge publishedAt={event.publishedAt} newUntil={event.newUntil} />
              {event.status ? <span className="badge badgeStatus">{event.status}</span> : null}
              {event.audience ? <span className="audience">{event.audience}</span> : null}
            </div>

            <h2>{event.title}</h2>
            <p className="eventDescription">{event.description}</p>

            <div className="eventPeriod">
              <span>ご案内期間</span>
              <strong>{event.period}</strong>
            </div>

            <div className="eventActions">
              <a
                className="eventLink"
                href={event.href}
                target={event.external ? '_blank' : undefined}
                rel={event.external ? 'noreferrer' : undefined}
                aria-label={`${event.title}：${linkLabel}`}
              >
                {linkLabel}
                <span className="eventArrow" aria-hidden="true">→</span>
              </a>
              {event.documentHref ? (
                <a
                  className="eventPdfLink"
                  href={event.documentHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  案内PDFを見る
                  <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}
