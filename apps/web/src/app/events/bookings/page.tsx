'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/header'
import { useAccount } from '@/contexts/account-context'
import { eventsApi, type EventBookingFormField, type EventBookingItem, type EventDetail } from '@/lib/api'
import {
  buildEikenManagerSyncPayload,
  EIKEN_MANAGER_PRIMARY_ORIGIN,
  EIKEN_MANAGER_READY_MESSAGE,
  resolveEikenManagerOrigin,
} from '@/lib/eiken-course-manager-sync'
import {
  buildEventBookingCalendarIndex,
  countEventBookingStatuses,
  eventBookingDateKey,
} from '@/lib/event-booking-calendar'

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'requested', label: '承認待ち' },
  { key: 'waitlisted', label: 'キャンセル待ち' },
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
  waitlisted: 'bg-pink-100 text-pink-800',
  confirmed: 'bg-green-100 text-green-800',
  rejected: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-500',
  attended: 'bg-blue-100 text-blue-800',
  no_show: 'bg-red-100 text-red-800',
}

const PRIMARY_CALENDAR_STATUSES = new Set(['requested', 'waitlisted', 'confirmed'])

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

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'event-bookings'
}

interface DecisionDialogState {
  bookingIds: string[]
  targetCount: number
  action: 'confirm' | 'reject'
}

function dateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function defaultScheduledNotificationTime(now = new Date()): string {
  const next = new Date(now)
  const hour = next.getHours()
  if (hour >= 21) {
    next.setDate(next.getDate() + 1)
    next.setHours(9, 0, 0, 0)
  } else if (hour < 8) {
    next.setHours(9, 0, 0, 0)
  } else {
    next.setMinutes(Math.ceil((next.getMinutes() + 15) / 30) * 30, 0, 0)
    if (next.getHours() >= 21) {
      next.setDate(next.getDate() + 1)
      next.setHours(9, 0, 0, 0)
    }
  }
  return dateTimeLocalValue(next)
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
  const [decisionDialog, setDecisionDialog] = useState<DecisionDialogState | null>(null)
  const [approvalComment, setApprovalComment] = useState('')
  const [notificationMode, setNotificationMode] = useState<'now' | 'scheduled'>('now')
  const [notificationScheduledAt, setNotificationScheduledAt] = useState(
    () => defaultScheduledNotificationTime(),
  )
  const [notificationDisabled, setNotificationDisabled] = useState(false)
  const [managerSyncNotice, setManagerSyncNotice] = useState<string | null>(null)

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

  const formFields = useMemo(
    () => event ? parseFormFields(event.booking_form_fields) : [],
    [event],
  )
  const managerSyncTarget = resolveEikenManagerOrigin(params.get('eiken_sync_target'))
  const accountLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts) {
      map.set(account.id, `${account.country ? account.country + ' ' : ''}${account.name}`)
    }
    return map
  }, [accounts])
  const calendarIndex = useMemo(() => buildEventBookingCalendarIndex(allItems), [allItems])
  const calendarItems = calendarIndex.items
  const bookingsByDate = calendarIndex.byDate
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth])
  const firstPrimarySlotStart =
    calendarItems.find((booking) => PRIMARY_CALENDAR_STATUSES.has(booking.status))?.slot_starts_at ??
    calendarItems[0]?.slot_starts_at ??
    null
  const selectedDateItems = selectedDateKey ? bookingsByDate.get(selectedDateKey) ?? [] : []
  const requestedVisibleItems = useMemo(
    () => items.filter((booking) => booking.status === 'requested'),
    [items],
  )
  const selectedDateRequestedItems = selectedDateItems.filter((booking) => booking.status === 'requested')

  useEffect(() => {
    if (!firstPrimarySlotStart) {
      setSelectedDateKey(null)
      return
    }
    setCalendarMonth(monthKeyFromIso(firstPrimarySlotStart))
    setSelectedDateKey((prev) => prev ?? eventBookingDateKey(firstPrimarySlotStart))
  }, [eventId, firstPrimarySlotStart])

  function accountLabel(lineAccountId: string | null | undefined): string {
    if (!lineAccountId) return ''
    return accountLabelById.get(lineAccountId) ?? lineAccountId.slice(0, 8)
  }

  const managerSyncPayload = useMemo(
    () => event
      ? buildEikenManagerSyncPayload(
          event,
          allItems,
          formFields,
        )
      : null,
    [event, allItems, formFields],
  )

  useEffect(() => {
    if (!managerSyncTarget || !managerSyncPayload || loading || !window.opener) return
    window.opener.postMessage(managerSyncPayload, managerSyncTarget)
    setManagerSyncNotice('英検集中講座 管理アプリへ予約データを送りました。')
  }, [loading, managerSyncPayload, managerSyncTarget])

  function sendToEikenManager() {
    if (!managerSyncPayload) return
    const managerWindow = window.open(EIKEN_MANAGER_PRIMARY_ORIGIN, 'eiken-course-manager')
    if (!managerWindow) {
      setError('管理アプリを開けませんでした。ブラウザのポップアップを許可してください。')
      return
    }

    const handleReady = (message: MessageEvent<unknown>) => {
      if (
        message.origin !== EIKEN_MANAGER_PRIMARY_ORIGIN ||
        message.source !== managerWindow ||
        !message.data ||
        typeof message.data !== 'object' ||
        (message.data as { type?: unknown }).type !== EIKEN_MANAGER_READY_MESSAGE
      ) return
      managerWindow.postMessage(managerSyncPayload, EIKEN_MANAGER_PRIMARY_ORIGIN)
      window.removeEventListener('message', handleReady)
      setManagerSyncNotice('英検集中講座 管理アプリへ予約データを送りました。')
    }

    window.addEventListener('message', handleReady)
    window.setTimeout(() => window.removeEventListener('message', handleReady), 15_000)
  }

  async function downloadExcel() {
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
      '受講級',
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
        booking.friend_course_level ?? '',
        booking.customer_note ?? '',
        booking.internal_note ?? '',
      ]),
    ]
    const { buildXlsxWorkbook } = await import('@/components/events/xlsx-export')
    const workbook = buildXlsxWorkbook(htmlRows)
    const blob = new Blob([workbook], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeFileName(event.name)}_予約一覧.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function openDecisionDialog(
    bookings: EventBookingItem[],
    action: 'confirm' | 'reject',
  ) {
    const targets = bookings.filter((booking) => booking.status === 'requested')
    if (targets.length === 0) return
    setApprovalComment(action === 'confirm' ? event?.confirmation_message_extra ?? '' : '')
    setNotificationMode('now')
    setNotificationScheduledAt(defaultScheduledNotificationTime())
    setNotificationDisabled(false)
    setDecisionDialog({
      bookingIds: targets.map((booking) => booking.id),
      targetCount: targets.length,
      action,
    })
  }

  function openApprovalDialog(bookings: EventBookingItem[]) {
    openDecisionDialog(bookings, 'confirm')
  }

  function closeDecisionDialog() {
    setDecisionDialog(null)
    setApprovalComment('')
    setNotificationMode('now')
    setNotificationDisabled(false)
  }

  async function submitDecision() {
    if (!selectedAccountId || !eventId || !decisionDialog) return
    const note = approvalComment.trim()
    let notifyAt: string | undefined
    if (notificationMode === 'scheduled') {
      const parsed = new Date(notificationScheduledAt)
      if (!notificationScheduledAt || !Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setError('送信日時は現在より後の日時を指定してください。')
        return
      }
      notifyAt = parsed.toISOString()
    }
    const notification = {
      notify_at: notifyAt,
      notification_disabled: notificationDisabled,
    }
    setBusy(true)
    setError(null)
    try {
      if (decisionDialog.bookingIds.length === 1) {
        await eventsApi.decideBooking(
          selectedAccountId,
          eventId,
          decisionDialog.bookingIds[0],
          decisionDialog.action,
          decisionDialog.action === 'reject' ? note || undefined : undefined,
          decisionDialog.action === 'confirm' ? note : undefined,
          notification,
        )
      } else {
        const result = await eventsApi.bulkDecideBookings(
          selectedAccountId,
          eventId,
          decisionDialog.bookingIds,
          decisionDialog.action,
          decisionDialog.action === 'reject' ? note || undefined : undefined,
          decisionDialog.action === 'confirm' ? note : undefined,
          notification,
        )
        if (result.skipped > 0) {
          window.alert(
            `${result.updated}件を更新しました。${result.skipped}件はすでに処理済みのためスキップしました。`,
          )
        }
      }
      closeDecisionDialog()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function bulkDecide(bookings: EventBookingItem[], action: 'confirm' | 'reject') {
    if (!selectedAccountId || !eventId) return
    const targets = bookings.filter((booking) => booking.status === 'requested')
    if (targets.length === 0) return
    openDecisionDialog(targets, action)
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

  async function markStatus(id: string, status: 'confirmed' | 'attended' | 'no_show') {
    if (!selectedAccountId || !eventId) return
    if (
      status === 'confirmed' &&
      !confirm('この予約を「確定」に戻しますか？友だちへのLINE通知は送信されません。')
    ) return
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
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'list' && tab === 'requested' && (
              <>
                <button
                  type="button"
                  onClick={() => bulkDecide(requestedVisibleItems, 'confirm')}
                  disabled={busy || requestedVisibleItems.length === 0}
                  className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 shadow-sm transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  表示中をまとめて承認
                </button>
                <button
                  type="button"
                  onClick={() => bulkDecide(requestedVisibleItems, 'reject')}
                  disabled={busy || requestedVisibleItems.length === 0}
                  className="rounded-xl border border-gray-200 bg-white/85 px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  表示中をまとめて拒否
                </button>
              </>
            )}
            <button
              type="button"
              onClick={sendToEikenManager}
              disabled={!event || allItems.length === 0}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 shadow-sm transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              英検管理へ送る
            </button>
            <button
              type="button"
              onClick={downloadExcel}
              disabled={!event || allItems.length === 0}
              className="rounded-xl border border-pink-200 bg-white/85 px-4 py-2 text-sm font-medium text-pink-700 shadow-sm transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ExcelでDL
            </button>
          </div>
        </div>

        {managerSyncNotice && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
            {managerSyncNotice} データはブラウザ間で直接受け渡しされ、外部には保存されません。
          </div>
        )}

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
                        <div className="flex flex-col items-start gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[b.status] ?? 'bg-gray-100'}`}>
                            {STATUS_TABS.find((t) => t.key === b.status)?.label ?? b.status}
                          </span>
                          {b.status === 'waitlisted' && b.waitlist_position != null && (
                            <span className="text-xs font-medium text-pink-700">{b.waitlist_position}番目</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatJp(b.requested_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {b.status === 'requested' && (
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => openApprovalDialog([b])}
                              disabled={busy}
                              className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              承認
                            </button>
                            <button
                              onClick={() => openDecisionDialog([b], 'reject')}
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
                        {b.status === 'waitlisted' && (
                          <button
                            onClick={() => adminCancel(b.id)}
                            disabled={busy}
                            className="px-3 py-1 border border-pink-200 text-pink-700 rounded-lg text-xs font-medium hover:bg-pink-50 disabled:opacity-50"
                          >
                            待ちを取り消す
                          </button>
                        )}
                        {(b.status === 'attended' || b.status === 'no_show') && (
                          <button
                            type="button"
                            onClick={() => markStatus(b.id, 'confirmed')}
                            disabled={busy}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            確定に戻す
                          </button>
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
                <p className="mt-0.5 text-xs text-gray-500">
                  承認待ち・確定・キャンセルなど、すべての予約履歴を日ごとに表示します。
                </p>
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
                      const counts = countEventBookingStatuses(dayBookings)
                      const selected = cell != null && cell === selectedDateKey
                      return (
                        <button
                          key={cell ?? `blank-${index}`}
                          type="button"
                          disabled={!cell || counts.total === 0}
                          onClick={() => cell && setSelectedDateKey(cell)}
                          className={`min-h-[104px] border-b border-r border-pink-100 p-2 text-left transition last:border-r-0 disabled:cursor-default ${
                            !cell
                              ? 'bg-gray-50/60'
                              : selected
                                ? 'bg-pink-100/80 ring-2 ring-inset ring-pink-300'
                                : counts.total > 0
                                  ? 'bg-white hover:bg-pink-50'
                                  : 'bg-white/70 text-gray-400'
                          }`}
                        >
                          {cell && (
                            <>
                              <div className="text-sm font-bold text-gray-800">{Number(cell.slice(-2))}</div>
                              {counts.total > 0 ? (
                                <div className="mt-2 space-y-1">
                                  <div className="inline-flex w-full items-center justify-between rounded-lg bg-pink-50 px-2 py-1 text-[11px] font-medium text-pink-800">
                                    <span>予約者</span>
                                    <span>{counts.total}人</span>
                                  </div>
                                  {counts.requested > 0 && (
                                    <div className="inline-flex w-full items-center justify-between rounded-lg bg-yellow-50 px-2 py-1 text-[11px] font-medium text-yellow-800">
                                      <span>承認待ち</span>
                                      <span>{counts.requested}人</span>
                                    </div>
                                  )}
                                  {counts.waitlisted > 0 && (
                                    <div className="inline-flex w-full items-center justify-between rounded-lg bg-pink-100 px-2 py-1 text-[11px] font-medium text-pink-800">
                                      <span>キャンセル待ち</span>
                                      <span>{counts.waitlisted}人</span>
                                    </div>
                                  )}
                                  {counts.confirmed > 0 && (
                                    <div className="inline-flex w-full items-center justify-between rounded-lg bg-green-50 px-2 py-1 text-[11px] font-medium text-green-800">
                                      <span>確定</span>
                                      <span>{counts.confirmed}人</span>
                                    </div>
                                  )}
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
                      {selectedDateKey
                        ? `${dateLabelFromKey(selectedDateKey)} の予約者（${selectedDateItems.length}人）`
                        : '日付を選択'}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      カレンダーの日付を押すと、その日の予約詳細を確認できます。
                    </p>
                  </div>

                  {selectedDateRequestedItems.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-pink-100 bg-pink-50/60 p-3">
                      <span className="text-xs font-medium text-gray-600">
                        この日の承認待ち: {selectedDateRequestedItems.length}件
                      </span>
                      <button
                        type="button"
                        onClick={() => bulkDecide(selectedDateRequestedItems, 'confirm')}
                        disabled={busy}
                        className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        まとめて承認
                      </button>
                      <button
                        type="button"
                        onClick={() => bulkDecide(selectedDateRequestedItems, 'reject')}
                        disabled={busy}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        まとめて拒否
                      </button>
                    </div>
                  )}

                  {!selectedDateKey ? (
                    <div className="rounded-lg border border-dashed border-pink-200 p-6 text-center text-sm text-gray-500">
                      日付を選ぶと参加者が表示されます
                    </div>
                  ) : selectedDateItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-pink-200 p-6 text-center text-sm text-gray-500">
                      この日の予約はありません
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
                                {booking.status === 'waitlisted' && booking.waitlist_position != null
                                  ? ` ${booking.waitlist_position}番目`
                                  : ''}
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
                                    onClick={() => openApprovalDialog([booking])}
                                    disabled={busy}
                                    className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    承認
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openDecisionDialog([booking], 'reject')}
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
                              {booking.status === 'waitlisted' && (
                                <button
                                  type="button"
                                  onClick={() => adminCancel(booking.id)}
                                  disabled={busy}
                                  className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700 hover:bg-pink-100 disabled:opacity-50"
                                >
                                  待ちを取り消す
                                </button>
                              )}
                              {(booking.status === 'attended' || booking.status === 'no_show') && (
                                <button
                                  type="button"
                                  onClick={() => markStatus(booking.id, 'confirmed')}
                                  disabled={busy}
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                >
                                  確定に戻す
                                </button>
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

      {decisionDialog && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-title"
        >
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-pink-100 bg-white p-5 shadow-xl">
            <h2 id="decision-title" className="text-lg font-bold text-gray-900">
              予約を{decisionDialog.action === 'confirm' ? '承認' : '拒否'}する
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {decisionDialog.targetCount === 1
                ? `この予約の${decisionDialog.action === 'confirm' ? '確定' : '拒否'}メッセージを送ります。`
                : `${decisionDialog.targetCount}件の予約をまとめて${decisionDialog.action === 'confirm' ? '承認' : '拒否'}します。同じ友だちへの通知は1通にまとまります。`}
            </p>

            <div className="mt-5">
              <label htmlFor="approval-comment" className="block text-sm font-medium text-gray-800">
                {decisionDialog.action === 'confirm'
                  ? '保護者へ送るコメント'
                  : '拒否理由（管理者用メモ）'}
                <span className="ml-1 text-xs font-normal text-gray-500">任意</span>
              </label>
              {decisionDialog.action === 'confirm' && event?.confirmation_message_extra && (
                <p className="mt-1 text-xs text-gray-500">
                  イベント設定の既定文を読み込みました。この承認だけ内容を変更できます。
                </p>
              )}
              <textarea
                id="approval-comment"
                value={approvalComment}
                onChange={(event) => setApprovalComment(event.target.value)}
                maxLength={2000}
                rows={7}
                autoFocus
                placeholder={
                  decisionDialog.action === 'confirm'
                    ? '例：事前にこちらをご確認ください。\nhttps://example.com/preparation'
                    : '例：定員に達したため（この内容は友だちには表示されません）'
                }
                className="mt-2 w-full resize-y rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              />
              <div className="mt-1 flex items-start justify-between gap-3 text-xs text-gray-500">
                <p>
                  {decisionDialog.action === 'confirm'
                    ? '入力したURLは、LINE上でタップできるリンクになります。'
                    : '友だちには固定の拒否メッセージが送られます。'}
                </p>
                <span className="shrink-0">{approvalComment.length} / 2000</span>
              </div>
            </div>

            <fieldset className="mt-5 rounded-lg border border-pink-100 bg-pink-50/40 p-4">
              <legend className="px-1 text-sm font-medium text-gray-800">LINE連絡の送信タイミング</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNotificationMode('now')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    notificationMode === 'now'
                      ? 'border-pink-400 bg-pink-100 text-pink-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-pink-50'
                  }`}
                >
                  今すぐ送る
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationMode('scheduled')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    notificationMode === 'scheduled'
                      ? 'border-pink-400 bg-pink-100 text-pink-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-pink-50'
                  }`}
                >
                  日時を指定
                </button>
              </div>

              {notificationMode === 'scheduled' && (
                <div className="mt-3">
                  <label htmlFor="notification-scheduled-at" className="block text-xs font-medium text-gray-700">
                    送信日時
                  </label>
                  <input
                    id="notification-scheduled-at"
                    type="datetime-local"
                    value={notificationScheduledAt}
                    min={dateTimeLocalValue(new Date(Date.now() + 60_000))}
                    onChange={(event) => setNotificationScheduledAt(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    5分間隔で送信を確認するため、指定時刻から最大5分ほど遅れる場合があります。
                  </p>
                </div>
              )}

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-green-100 bg-green-50/70 p-3">
                <input
                  type="checkbox"
                  checked={notificationDisabled}
                  onChange={(event) => setNotificationDisabled(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-pink-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">
                    通知音を鳴らさず送る
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-600">
                    メッセージは通常どおり届きますが、端末のプッシュ通知や通知音を出しません。
                  </span>
                </span>
              </label>
            </fieldset>

            <div className="mt-5 rounded-lg border border-green-100 bg-green-50/70 p-3 text-xs text-gray-700">
              予約状態はこの操作ですぐに変更されます。LINE連絡だけが、選んだタイミングで送信されます。
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDecisionDialog}
                disabled={busy}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void submitDecision()}
                disabled={busy}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  decisionDialog.action === 'confirm'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {busy
                  ? `${decisionDialog.action === 'confirm' ? '承認' : '拒否'}中...`
                  : `${decisionDialog.action === 'confirm' ? '承認' : '拒否'}を確定`}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
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
