'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/header'
import { useAccount } from '@/contexts/account-context'
import { eventsApi, type EventBookingFormField, type EventBookingItem, type EventDetail } from '@/lib/api'

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'requested', label: '承認待ち' },
  { key: 'confirmed', label: '確定' },
  { key: 'rejected', label: '拒否' },
  { key: 'cancelled', label: 'キャンセル' },
  { key: 'expired', label: '期限切れ' },
  { key: 'attended', label: '参加済' },
  { key: 'no_show', label: '無断' },
  { key: 'all', label: '全件' },
]

const statusBadge: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  rejected: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-500',
  attended: 'bg-blue-100 text-blue-800',
  no_show: 'bg-red-100 text-red-800',
}

const ACTIVE_CALENDAR_STATUSES = new Set(['requested', 'confirmed'])

function formatJp(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatJpDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatJpTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dateKey(iso: string): string {
  return formatJpDate(iso).replaceAll('/', '-')
}

function monthKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function monthKeyFromIso(iso: string): string {
  return monthKeyFromDate(new Date(iso))
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return monthKeyFromDate(date)
}

function buildCalendarCells(monthKey: string): Array<string | null> {
  const [year, month] = monthKey.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const cells: Array<string | null> = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function dateLabelFromKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${year}年${month}月`
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
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string | string[]>
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
  const answers = parseAnswers(booking.form_answers)
  const raw = answers[field.id]
  return Array.isArray(raw) ? raw.join('、') : typeof raw === 'string' ? raw : ''
}

function bookingAnswerLines(
  booking: EventBookingItem,
  fields: EventBookingFormField[],
): Array<{ label: string; value: string }> {
  const answers = parseAnswers(booking.form_answers)
  const lines = fields
    .map((field) => {
      const raw = answers[field.id]
      const value = Array.isArray(raw) ? raw.join('、') : typeof raw === 'string' ? raw : ''
      return value ? { label: field.label, value } : null
    })
    .filter((x): x is { label: string; value: string } => x !== null)
  if (booking.customer_note) {
    lines.push({ label: '備考', value: booking.customer_note })
  }
  return lines
}

function statusLabel(status: string): string {
  return STATUS_TABS.find((t) => t.key === status)?.label ?? status
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'event-bookings'
}

function BookingsInner() {
  const params = useSearchParams()
  const eventId = params.get('id')
  const { selectedAccountId, accounts } = useAccount()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [items, setItems] = useState<EventBookingItem[]>([])
  const [allItems, setAllItems] = useState<EventBookingItem[]>([])
  const [tab, setTab] = useState<string>('requested')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromDate(new Date()))
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!selectedAccountId || !eventId) return
    setLoading(true)
    setError(null)
    try {
      const filters = tab === 'all' ? {} : { status: tab }
      const [evRes, listRes, allRes] = await Promise.all([
        event == null ? eventsApi.getEvent(selectedAccountId, eventId) : Promise.resolve(event),
        eventsApi.listBookings(selectedAccountId, eventId, filters),
        eventsApi.listBookings(selectedAccountId, eventId),
      ])
      setEvent(evRes)
      setItems(listRes.items)
      setAllItems(allRes.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, eventId, tab])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const formFields = event ? parseFormFields(event.booking_form_fields) : []
  const accountLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts) {
      map.set(account.id, `${account.country ? account.country + ' ' : ''}${account.name}`)
    }
    return map
  }, [accounts])
  const activeCalendarItems = useMemo(
    () =>
      allItems
        .filter((booking) => ACTIVE_CALENDAR_STATUSES.has(booking.status))
        .sort((a, b) => new Date(a.slot_starts_at).getTime() - new Date(b.slot_starts_at).getTime()),
    [allItems],
  )
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, EventBookingItem[]>()
    for (const booking of activeCalendarItems) {
      const key = dateKey(booking.slot_starts_at)
      const list = map.get(key) ?? []
      list.push(booking)
      map.set(key, list)
    }
    return map
  }, [activeCalendarItems])
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth])
  const firstActiveSlotStart = activeCalendarItems[0]?.slot_starts_at ?? null
  const selectedDateItems = selectedDateKey ? bookingsByDate.get(selectedDateKey) ?? [] : []

  useEffect(() => {
    if (!firstActiveSlotStart) {
      setSelectedDateKey(null)
      return
    }
    setCalendarMonth(monthKeyFromIso(firstActiveSlotStart))
    setSelectedDateKey((prev) => prev ?? dateKey(firstActiveSlotStart))
  }, [eventId, firstActiveSlotStart])

  function accountLabel(lineAccountId: string | null | undefined): string {
    if (!lineAccountId) return ''
    return accountLabelById.get(lineAccountId) ?? lineAccountId.slice(0, 8)
  }

  function downloadExcel() {
    if (!event) return
    const rows = allItems
      .slice()
      .sort((a, b) => new Date(a.slot_starts_at).getTime() - new Date(b.slot_starts_at).getTime())
    const headers = [
      'イベント名',
      '予約日',
      '開始時刻',
      '終了時刻',
      '状態',
      '友だち',
      '経由アカウント',
      '受付日時',
      ...formFields.map((field) => field.label),
      '備考',
      '内部メモ',
    ]
    const htmlRows = [
      headers,
      ...rows.map((booking) => [
        event.name,
        formatJpDate(booking.slot_starts_at),
        formatJpTime(booking.slot_starts_at),
        formatJpTime(booking.slot_ends_at),
        statusLabel(booking.status),
        booking.friend_display_name ?? booking.friend_id,
        accountLabel(booking.line_account_id),
        formatJp(booking.requested_at),
        ...formFields.map((field) => answerValue(booking, field)),
        booking.customer_note ?? '',
        booking.internal_note ?? '',
      ]),
    ]
    const table = htmlRows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`)
      .join('')
    const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table border="1">${table}</table></body></html>`
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeFileName(event.name)}_予約一覧.xls`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function decide(id: string, action: 'confirm' | 'reject') {
    if (!selectedAccountId || !eventId) return
    let reason: string | undefined
    if (action === 'reject') {
      const r = window.prompt('拒否理由（任意・admin内部メモ。友だちには固定文面）')
      if (r === null) return
      reason = r || undefined
    }
    setBusy(true)
    try {
      await eventsApi.decideBooking(selectedAccountId, eventId, id, action, reason)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function adminCancel(id: string) {
    if (!selectedAccountId || !eventId) return
    if (!confirm('運営側でキャンセルしますか？友だちにLINE通知が送られます。')) return
    setBusy(true)
    try {
      await eventsApi.adminCancelBooking(selectedAccountId, eventId, id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function markStatus(id: string, status: 'attended' | 'no_show') {
    if (!selectedAccountId || !eventId) return
    setBusy(true)
    try {
      await eventsApi.updateBooking(selectedAccountId, eventId, id, { status })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!eventId) {
    return <div className="p-4 text-red-700">id クエリが必要です</div>
  }

  return (
    <>
      <Header title={event?.name ?? 'イベント予約管理'} />
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Link href="/events" className="text-blue-600 hover:underline">イベント一覧</Link>
          <span className="text-gray-400">/</span>
          <Link href={`/events/edit?id=${eventId}`} className="text-blue-600 hover:underline">
            {event?.name ?? '編集'}
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-700">予約管理</span>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{event?.name ?? 'イベント予約管理'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">予約の承認・キャンセル・出欠管理</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-pink-200 bg-white/80 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === 'list'
                  ? 'bg-pink-100 text-pink-700'
                  : 'text-gray-600 hover:bg-pink-50'
              }`}
            >
              一覧表示
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === 'calendar'
                  ? 'bg-pink-100 text-pink-700'
                  : 'text-gray-600 hover:bg-pink-50'
              }`}
            >
              カレンダー表示
            </button>
          </div>
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!event || allItems.length === 0}
            className="rounded-xl border border-pink-200 bg-white/85 px-4 py-2 text-sm font-medium text-pink-700 shadow-sm transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ExcelでDL
          </button>
        </div>

        {viewMode === 'list' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">読み込み中...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              該当する予約はありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">友だち</th>
                    <th className="text-left px-4 py-2 font-medium">経由アカ</th>
                    <th className="text-left px-4 py-2 font-medium">回答内容</th>
                    <th className="text-left px-4 py-2 font-medium">予約枠</th>
                    <th className="text-left px-4 py-2 font-medium">状態</th>
                    <th className="text-left px-4 py-2 font-medium">受付日時</th>
                    <th className="text-right px-4 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => {
                    const answerLines = bookingAnswerLines(b, formFields)
                    return (
                    <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-800">
                        {b.friend_display_name ?? b.friend_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{accountLabel(b.line_account_id)}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs min-w-[220px]">
                        {answerLines.length === 0 ? (
                          <span className="text-gray-400">未入力</span>
                        ) : (
                          <div className="space-y-1">
                            {answerLines.map((line) => (
                              <div key={line.label}>
                                <span className="font-medium text-gray-500">{line.label}: </span>
                                <span className="whitespace-pre-wrap">{line.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatJp(b.slot_starts_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[b.status] ?? 'bg-gray-100'}`}>
                          {STATUS_TABS.find((t) => t.key === b.status)?.label ?? b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatJp(b.requested_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {b.status === 'requested' && (
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => decide(b.id, 'confirm')}
                              disabled={busy}
                              className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              承認
                            </button>
                            <button
                              onClick={() => decide(b.id, 'reject')}
                              disabled={busy}
                              className="px-3 py-1 bg-gray-500 text-white rounded-lg text-xs font-medium hover:bg-gray-600 disabled:opacity-50"
                            >
                              拒否
                            </button>
                          </div>
                        )}
                        {b.status === 'confirmed' && (
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => markStatus(b.id, 'attended')}
                              disabled={busy}
                              className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                              参加済
                            </button>
                            <button
                              onClick={() => markStatus(b.id, 'no_show')}
                              disabled={busy}
                              className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                            >
                              無断
                            </button>
                            <button
                              onClick={() => adminCancel(b.id)}
                              disabled={busy}
                              className="px-3 py-1 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white disabled:opacity-50"
                            >
                              キャンセル
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {viewMode === 'calendar' && (
          <div className="rounded-lg border border-pink-200 bg-white/85 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">日別カレンダー</h2>
                <p className="mt-0.5 text-xs text-gray-500">承認待ち・確定の予約だけを日ごとに表示します。</p>
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((current) => shiftMonth(current, -1))}
                  className="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-pink-50"
                >
                  前月
                </button>
                <div className="min-w-[110px] text-center text-sm font-bold text-gray-900">
                  {monthLabel(calendarMonth)}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}
                  className="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-pink-50"
                >
                  翌月
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-500">読み込み中...</div>
            ) : (
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
                <div className="overflow-hidden rounded-xl border border-pink-100 bg-white/70">
                  <div className="grid grid-cols-7 border-b border-pink-100 bg-pink-50/70 text-center text-xs font-bold text-gray-500">
                    {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                      <div key={day} className="py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {calendarCells.map((cell, index) => {
                      const dayBookings = cell ? bookingsByDate.get(cell) ?? [] : []
                      const requestedCount = dayBookings.filter((booking) => booking.status === 'requested').length
                      const confirmedCount = dayBookings.filter((booking) => booking.status === 'confirmed').length
                      const totalCount = requestedCount + confirmedCount
                      const selected = cell != null && cell === selectedDateKey
                      return (
                        <button
                          key={cell ?? `blank-${index}`}
                          type="button"
                          disabled={!cell || totalCount === 0}
                          onClick={() => cell && setSelectedDateKey(cell)}
                          className={`min-h-[104px] border-b border-r border-pink-100 p-2 text-left transition last:border-r-0 disabled:cursor-default ${
                            !cell
                              ? 'bg-gray-50/60'
                              : selected
                                ? 'bg-pink-100/80 ring-2 ring-inset ring-pink-300'
                                : totalCount > 0
                                  ? 'bg-white hover:bg-pink-50'
                                  : 'bg-white/70 text-gray-400'
                          }`}
                        >
                          {cell && (
                            <>
                              <div className="text-sm font-bold text-gray-800">{Number(cell.slice(-2))}</div>
                              {totalCount > 0 ? (
                                <div className="mt-2 space-y-1">
                                  <div className="inline-flex w-full items-center justify-between rounded-lg bg-yellow-50 px-2 py-1 text-[11px] font-medium text-yellow-800">
                                    <span>承認待ち</span>
                                    <span>{requestedCount}人</span>
                                  </div>
                                  <div className="inline-flex w-full items-center justify-between rounded-lg bg-green-50 px-2 py-1 text-[11px] font-medium text-green-800">
                                    <span>確定</span>
                                    <span>{confirmedCount}人</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-7 text-center text-[11px] text-gray-400">予約なし</div>
                              )}
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-pink-100 bg-white/75 p-4">
                  <div className="mb-3">
                    <h3 className="text-base font-bold text-gray-900">
                      {selectedDateKey ? `${dateLabelFromKey(selectedDateKey)} の参加者` : '日付を選択'}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      カレンダーの日付を押すと、その日の予約詳細を確認できます。
                    </p>
                  </div>

                  {!selectedDateKey ? (
                    <div className="rounded-lg border border-dashed border-pink-200 p-6 text-center text-sm text-gray-500">
                      日付を選ぶと参加者が表示されます
                    </div>
                  ) : selectedDateItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-pink-200 p-6 text-center text-sm text-gray-500">
                      この日の承認待ち・確定予約はありません
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDateItems.map((booking) => {
                        const answerLines = bookingAnswerLines(booking, formFields)
                        return (
                          <div key={booking.id} className="rounded-xl border border-pink-100 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-bold text-gray-900">
                                  {booking.friend_display_name ?? booking.friend_id.slice(0, 8)}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">
                                  {formatJpTime(booking.slot_starts_at)}〜{formatJpTime(booking.slot_ends_at)}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">
                                  経由: {accountLabel(booking.line_account_id)}
                                </div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[booking.status] ?? 'bg-gray-100'}`}>
                                {statusLabel(booking.status)}
                              </span>
                            </div>

                            {answerLines.length > 0 && (
                              <div className="mt-3 space-y-1 rounded-lg bg-pink-50/60 p-2 text-xs text-gray-700">
                                {answerLines.map((line) => (
                                  <div key={line.label}>
                                    <span className="font-medium text-gray-500">{line.label}: </span>
                                    <span className="whitespace-pre-wrap">{line.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {booking.status === 'requested' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => decide(booking.id, 'confirm')}
                                    disabled={busy}
                                    className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    承認
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => decide(booking.id, 'reject')}
                                    disabled={busy}
                                    className="rounded-lg bg-gray-500 px-3 py-1 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                                  >
                                    拒否
                                  </button>
                                </>
                              )}
                              {booking.status === 'confirmed' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => markStatus(booking.id, 'attended')}
                                    disabled={busy}
                                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    参加済
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => markStatus(booking.id, 'no_show')}
                                    disabled={busy}
                                    className="rounded-lg bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                                  >
                                    無断
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => adminCancel(booking.id)}
                                    disabled={busy}
                                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    キャンセル
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default function EventBookingsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-gray-500">読み込み中...</div>}>
      <BookingsInner />
    </Suspense>
  )
}
