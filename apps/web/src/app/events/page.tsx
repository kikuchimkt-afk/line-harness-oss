'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/header'
import { eventsApi, type EventListItem } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import {
  buildCombinedBookingRows,
  buildSelectedEventRows,
} from '@/components/events/multi-event-export'

function formatJpDate(iso: string | null): string {
  if (!iso) return '日時未設定'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function EventsListPage() {
  const router = useRouter()
  const { selectedAccountId, accounts } = useAccount()
  const [items, setItems] = useState<EventListItem[]>([])
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const refresh = useCallback(async () => {
    if (!selectedAccountId) return
    setLoading(true)
    setError(null)
    try {
      const res = await eventsApi.listEvents(selectedAccountId)
      setItems(res.items)
      const availableIds = new Set(res.items.map((item) => item.id))
      setSelectedEventIds((current) => {
        const next = new Set([...current].filter((id) => availableIds.has(id)))
        return next.size === current.size ? current : next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setSelectedEventIds(new Set())
  }, [selectedAccountId])

  const selectedEvents = useMemo(
    () => items.filter((item) => selectedEventIds.has(item.id)),
    [items, selectedEventIds],
  )

  function toggleEventSelection(eventId: string) {
    setSelectedEventIds((current) => {
      const next = new Set(current)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  function selectAllEvents() {
    setSelectedEventIds(new Set(items.map((item) => item.id)))
  }

  function clearEventSelection() {
    setSelectedEventIds(new Set())
  }

  async function downloadSelectedEventsExcel() {
    if (!selectedAccountId || selectedEvents.length === 0 || exporting) return
    setExporting(true)
    setError(null)
    try {
      const sources = await Promise.all(
        selectedEvents.map(async (event) => {
          const [detail, bookings] = await Promise.all([
            eventsApi.getEvent(selectedAccountId, event.id),
            eventsApi.listBookings(selectedAccountId, event.id),
          ])
          return { event: detail, bookings: bookings.items }
        }),
      )
      const accountLabelById = new Map(
        accounts.map((account) => [
          account.id,
          `${account.country ? `${account.country} ` : ''}${account.name}`,
        ]),
      )
      const { buildMultiSheetXlsxWorkbook } = await import(
        '@/components/events/xlsx-export'
      )
      const workbook = buildMultiSheetXlsxWorkbook([
        {
          name: '予約一覧',
          rows: buildCombinedBookingRows(
            sources,
            (accountId) => accountLabelById.get(accountId) ?? accountId.slice(0, 8),
          ),
        },
        {
          name: '選択イベント',
          rows: buildSelectedEventRows(selectedEvents),
        },
      ])
      const blob = new Blob([workbook], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const today = new Date().toLocaleDateString('ja-JP').replaceAll('/', '')
      link.href = url
      link.download = `${today}_選択イベント予約データ_${selectedEvents.length}件.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  async function duplicateEvent(event: EventListItem) {
    if (!selectedAccountId || duplicatingId) return
    if (!confirm(`「${event.name}」をコピーして下書きを作成します。\n予約者・予約履歴はコピーされません。よろしいですか？`)) return
    setDuplicatingId(event.id)
    setError(null)
    try {
      const copied = await eventsApi.duplicateEvent(selectedAccountId, event.id)
      router.push(`/events/edit?id=${copied.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDuplicatingId(null)
    }
  }

  async function deleteEvent(event: EventListItem) {
    if (!selectedAccountId || deletingId) return
    if (event.total_active > 0 || event.pending_count > 0 || event.waitlist_count > 0) {
      setError('予約済み・承認待ち・キャンセル待ちがあるイベントは削除できません。予約管理でキャンセルまたは処理してから削除してください。')
      return
    }
    if (!confirm(`「${event.name}」を削除します。\n一覧と予約ページから非表示になります。予約履歴は保持されます。\nよろしいですか？`)) return
    setDeletingId(event.id)
    setError(null)
    try {
      await eventsApi.deleteEvent(selectedAccountId, event.id)
      setItems((current) => current.filter((item) => item.id !== event.id))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(
        message === 'event_has_active_bookings'
          ? '予約済み・承認待ち・キャンセル待ちがあるイベントは削除できません。予約管理でキャンセルまたは処理してから削除してください。'
          : message,
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <Header title="イベント予約" />
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">イベント一覧</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              日時を指定したイベントを作成し、LIFF 経由で友だちに予約してもらえます
            </p>
          </div>
          <Link
            href="/events/new"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            ＋ 新しいイベント
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-500">
            読み込み中...
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="text-gray-700 font-medium mb-2">イベントが作成されていません</div>
            <p className="text-sm text-gray-500 mb-4">
              友だちに告知する勉強会・説明会・オフ会などをここから作成します。
            </p>
            <Link
              href="/events/new"
              className="inline-block px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              最初のイベントを作成
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pink-200 bg-white/90 p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  選択中 <span className="text-pink-700">{selectedEvents.length}</span> 件
                </span>
                <button
                  type="button"
                  onClick={selectAllEvents}
                  disabled={selectedEvents.length === items.length}
                  className="rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm text-pink-700 hover:bg-pink-50 disabled:opacity-40"
                >
                  全選択
                </button>
                <button
                  type="button"
                  onClick={clearEventSelection}
                  disabled={selectedEvents.length === 0}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  選択解除
                </button>
              </div>
              <button
                type="button"
                onClick={downloadSelectedEventsExcel}
                disabled={selectedEvents.length === 0 || exporting}
                className="rounded-lg border border-pink-300 bg-pink-50 px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {exporting
                  ? 'Excel作成中...'
                  : `選択したイベントをExcelでDL (${selectedEvents.length})`}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((e) => (
                <div
                  key={e.id}
                  className={`relative overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md ${
                    selectedEventIds.has(e.id)
                      ? 'border-pink-400 ring-2 ring-pink-100'
                      : 'border-gray-200'
                  }`}
                >
                  <label className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white/95 px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm">
                    <input
                      type="checkbox"
                      checked={selectedEventIds.has(e.id)}
                      onChange={() => toggleEventSelection(e.id)}
                      className="h-4 w-4 accent-pink-600"
                    />
                    選択
                  </label>
                  <Link href={`/events/edit?id=${e.id}`} className="block">
                    {e.image_url ? (
                      <img
                        src={e.image_url}
                        alt={e.name}
                        className="w-full h-32 object-cover bg-gray-100"
                      />
                    ) : (
                      <div className="w-full h-32 bg-gradient-to-br from-blue-100 to-blue-200" />
                    )}
                    <div className="p-4 pb-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-semibold text-gray-900 line-clamp-2 flex-1">{e.name}</div>
                        <div className="flex flex-col gap-1 shrink-0 items-end">
                          {e.is_published === 1 ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              公開中
                            </span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              下書き
                            </span>
                          )}
                          {e.target_type === 'multi-account-dedup' && (() => {
                            const ids: string[] = Array.isArray(e.account_ids)
                              ? e.account_ids
                              : typeof e.account_ids === 'string'
                                ? (() => { try { return JSON.parse(e.account_ids) as string[] } catch { return [] } })()
                                : []
                            return (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                横断 {ids.length} アカ
                              </span>
                            )
                          })()}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mb-3">
                        {formatJpDate(e.next_slot_starts_at)}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">
                          予約 <span className="font-semibold">{e.total_active}</span>
                          {e.total_capacity != null && <span className="text-gray-400"> / {e.total_capacity}</span>}
                        </span>
                        {e.pending_count > 0 && (
                          <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">
                            承認待ち {e.pending_count}
                          </span>
                        )}
                        {e.waitlist_count > 0 && (
                          <span className="bg-pink-100 text-pink-800 text-xs font-bold px-2 py-0.5 rounded-full">
                            キャンセル待ち {e.waitlist_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => duplicateEvent(e)}
                      disabled={duplicatingId === e.id || deletingId === e.id}
                      className="w-full rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100 disabled:opacity-50"
                    >
                      {duplicatingId === e.id ? 'コピー中...' : 'コピーして編集'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEvent(e)}
                      disabled={deletingId === e.id || duplicatingId === e.id}
                      className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === e.id ? '削除中...' : '削除'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
