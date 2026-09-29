'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DeliveryMode, ScenarioStep } from '@line-crm/shared'

import { api } from '@/lib/api'
import ScenarioManualStartModal from '@/components/scenarios/scenario-manual-start-modal'
import type {
  ScenarioDeliveryStatus,
  ScenarioSentDelivery,
  ScenarioUpcomingDelivery,
} from '@/lib/scenario-delivery-status'
import {
  filterByDisplayName,
  formatJstDateTime,
  formatJstShort,
  messageTypeLabel,
  upcomingStatePresentation,
  type UpcomingStateTone,
} from '@/lib/scenario-delivery-status'

type DeliveryTab = 'upcoming' | 'sent'

const toneClass: Record<UpcomingStateTone, string> = {
  green: 'border-green-200 bg-green-50 text-green-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  gray: 'border-gray-200 bg-gray-100 text-gray-600',
  red: 'border-red-200 bg-red-50 text-red-700',
}

function displayName(value: string): string {
  return value.trim() || '名前未設定'
}

function Avatar({ name, pictureUrl }: { name: string; pictureUrl: string | null }) {
  if (pictureUrl) {
    return (
      <img
        src={pictureUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-gray-100 object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-50 text-sm font-semibold text-pink-700"
    >
      {displayName(name).slice(0, 1)}
    </span>
  )
}

function SummaryCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl border border-pink-100 bg-pink-50/40 px-4 py-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">
        {value.toLocaleString('ja-JP')}
        <span className="ml-1 text-xs font-normal text-gray-500">{unit}</span>
      </p>
    </div>
  )
}

function UpcomingRow({
  item,
  scenarioIsActive,
  generatedAt,
}: {
  item: ScenarioUpcomingDelivery
  scenarioIsActive: boolean
  generatedAt: string
}) {
  const state = upcomingStatePresentation({
    scenarioIsActive,
    status: item.status,
    nextDeliveryAt: item.nextDeliveryAt,
    generatedAt,
    updatedAt: item.updatedAt,
  })

  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={item.displayName} pictureUrl={item.pictureUrl} />
        <div className="min-w-0">
          <Link
            href={`/friends/profile?id=${encodeURIComponent(item.friendId)}`}
            className="block truncate text-sm font-semibold text-gray-900 hover:text-green-700 hover:underline"
          >
            {displayName(item.displayName)}
          </Link>
          <p className="mt-0.5 text-xs text-gray-500">シナリオ開始 {formatJstShort(item.startedAt)} JST</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500">次回の処理予定</p>
        <p className="mt-0.5 text-sm font-semibold text-gray-900">
          {formatJstDateTime(item.nextDeliveryAt)} <span className="text-xs font-normal text-gray-500">JST</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          ステップ {item.nextStepOrder} ・ {messageTypeLabel(item.messageType)}
        </p>
      </div>
      <div className="sm:text-right">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass[state.tone]}`}>
          {state.label}
        </span>
        <p className="mt-1 text-[11px] text-gray-400">状態更新 {formatJstShort(item.updatedAt)} JST</p>
      </div>
    </li>
  )
}

function SentRow({ item }: { item: ScenarioSentDelivery }) {
  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={item.displayName} pictureUrl={item.pictureUrl} />
        <div className="min-w-0">
          <Link
            href={`/friends/profile?id=${encodeURIComponent(item.friendId)}`}
            className="block truncate text-sm font-semibold text-gray-900 hover:text-green-700 hover:underline"
          >
            {displayName(item.displayName)}
          </Link>
          <p className="mt-0.5 text-xs text-gray-500">ステップ {item.stepOrder} ・ {messageTypeLabel(item.messageType)}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500">最新の送信記録</p>
        <p className="mt-0.5 text-sm font-semibold text-gray-900">
          {formatJstDateTime(item.sentAt)} <span className="text-xs font-normal text-gray-500">JST</span>
        </p>
      </div>
      <div className="sm:text-right">
        <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
          送信済み
        </span>
        {item.sendCount > 1 && (
          <p className="mt-1 text-xs font-medium text-amber-700">送信記録 {item.sendCount}回</p>
        )}
      </div>
    </li>
  )
}

export default function ScenarioDeliveryStatusPanel({
  scenarioId,
  scenarioName,
  scenarioIsActive,
  lineAccountId,
  deliveryMode,
  steps,
  onEnrollmentChanged,
}: {
  scenarioId: string
  scenarioName: string
  scenarioIsActive: boolean
  lineAccountId: string | null
  deliveryMode: DeliveryMode | undefined
  steps: ScenarioStep[]
  onEnrollmentChanged?: () => void
}) {
  const [activeTab, setActiveTab] = useState<DeliveryTab>('upcoming')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<ScenarioDeliveryStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const requestSequence = useRef(0)

  const load = useCallback(async (kind: 'initial' | 'refresh') => {
    const requestId = ++requestSequence.current
    if (kind === 'initial') setLoading(true)
    if (kind === 'refresh') setRefreshing(true)
    setError('')
    try {
      const response = await api.scenarios.deliveryStatus(scenarioId, 200)
      if (requestId !== requestSequence.current) return
      if (response.success) {
        setData(response.data)
      } else {
        setError(response.error || '配信状況を取得できませんでした')
      }
    } catch (loadError) {
      if (requestId !== requestSequence.current) return
      setError(loadError instanceof Error ? loadError.message : '配信状況を取得できませんでした')
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [scenarioId])

  useEffect(() => {
    void load('initial')
    return () => {
      requestSequence.current += 1
    }
  }, [load])

  const visibleUpcoming = useMemo(
    () => filterByDisplayName(data?.upcoming ?? [], query),
    [data?.upcoming, query],
  )
  const visibleSent = useMemo(
    () => filterByDisplayName(data?.sent ?? [], query),
    [data?.sent, query],
  )
  const activeRows = activeTab === 'upcoming' ? visibleUpcoming : visibleSent
  const loadedCount = activeTab === 'upcoming' ? data?.upcoming.length ?? 0 : data?.sent.length ?? 0
  const hasMore = activeTab === 'upcoming' ? data?.upcomingHasMore : data?.sentHasMore

  return (
    <section aria-labelledby="scenario-delivery-status-title" className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h3 id="scenario-delivery-status-title" className="text-sm font-semibold text-gray-900">配信状況</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            誰に送信記録があり、誰への次回配信が予定されているかを確認できます。
          </p>
          {data && (
            <p className="mt-1 text-[11px] text-gray-400">データ取得 {formatJstShort(data.generatedAt)} JST</p>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ScenarioManualStartModal
            scenarioId={scenarioId}
            scenarioName={scenarioName}
            scenarioIsActive={scenarioIsActive}
            lineAccountId={lineAccountId}
            deliveryMode={deliveryMode}
            steps={steps}
            onChanged={() => {
              void load('refresh')
              onEnrollmentChanged?.()
            }}
          />
          <button
            type="button"
            onClick={() => void load('refresh')}
            disabled={loading || refreshing}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5m-5 4a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />
            </svg>
            {refreshing ? '更新中...' : '最新情報に更新'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 p-6" aria-live="polite" aria-busy="true">
          <p className="text-sm text-gray-500">配信状況を読み込んでいます...</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}
          </div>
        </div>
      ) : !data ? (
        <div className="p-6 text-center">
          <p className="text-sm text-red-600">{error || '配信状況を取得できませんでした'}</p>
          <button
            type="button"
            onClick={() => void load('initial')}
            className="mt-3 min-h-[40px] rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            もう一度読み込む
          </button>
        </div>
      ) : (
        <>
          <div className="p-4 sm:p-6">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                更新できませんでした。表示中の内容は前回取得時点のものです。（{error}）
              </div>
            )}
            {!scenarioIsActive && data.upcomingRecipientTotal > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                このシナリオは現在「無効」です。無効の間は、表示されている予定時刻を過ぎてもシナリオ配信処理の対象になりません。
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard label="次回配信予定" value={data.upcomingRecipientTotal} unit="人" />
              <SummaryCard label="送信済み" value={data.sentRecipientTotal} unit="人" />
              <SummaryCard label="送信済みステップ" value={data.sentDeliveryTotal} unit="件" />
              <SummaryCard label="送信記録" value={data.sentMessageTotal} unit="回" />
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              送信済みステップは「友だち × ステップ」の件数です。同じ友だちが「配信済み」と「次回配信予定」の両方に表示されることがあります。
            </p>
          </div>

          <div className="border-y border-gray-100 px-4 sm:px-6">
            <div className="flex gap-6 overflow-x-auto" role="tablist" aria-label="配信状況の表示切替">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'upcoming'}
                onClick={() => setActiveTab('upcoming')}
                className={`min-h-[48px] shrink-0 border-b-2 px-1 text-sm font-semibold transition-colors ${
                  activeTab === 'upcoming'
                    ? 'border-green-500 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                次回配信予定 <span className="ml-1 text-xs">{data.upcomingRecipientTotal.toLocaleString('ja-JP')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'sent'}
                onClick={() => setActiveTab('sent')}
                className={`min-h-[48px] shrink-0 border-b-2 px-1 text-sm font-semibold transition-colors ${
                  activeTab === 'sent'
                    ? 'border-green-500 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                配信済み <span className="ml-1 text-xs">{data.sentDeliveryTotal.toLocaleString('ja-JP')}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label className="relative block w-full sm:max-w-sm">
              <span className="sr-only">LINE表示名で検索</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="LINE表示名で検索"
                className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </label>
            <p className="shrink-0 text-xs text-gray-500" aria-live="polite">
              {query.trim()
                ? `検索結果 ${activeRows.length.toLocaleString('ja-JP')}件 / 読込 ${loadedCount.toLocaleString('ja-JP')}件`
                : `${loadedCount.toLocaleString('ja-JP')}件を表示`}
            </p>
          </div>

          {hasMore && (
            <div className="mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 sm:mx-6">
              件数が多いため、先頭200件までを表示しています。検索対象も現在読み込まれている範囲です。
            </div>
          )}

          <div role="tabpanel" aria-label={activeTab === 'upcoming' ? '次回配信予定' : '配信済み'}>
            {activeRows.length === 0 ? (
              <div className="border-t border-gray-100 px-4 py-10 text-center text-sm text-gray-500">
                {query.trim()
                  ? '検索条件に一致する友だちはいません。'
                  : activeTab === 'upcoming'
                    ? '次回配信が予定されている友だちはいません。'
                    : '送信記録はありません。'}
              </div>
            ) : activeTab === 'upcoming' ? (
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {visibleUpcoming.map((item) => (
                  <UpcomingRow
                    key={item.enrollmentId}
                    item={item}
                    scenarioIsActive={scenarioIsActive}
                    generatedAt={data.generatedAt}
                  />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {visibleSent.map((item) => <SentRow key={item.id} item={item} />)}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 text-xs leading-5 text-gray-600 sm:px-6">
            {activeTab === 'upcoming' ? (
              <p>
                予定時刻は送信処理の基準時刻です。処理は5分間隔のため、混雑状況などにより実際の送信が数分遅れる場合があります。「配信処理待ち」「再処理待ち」は、送信失敗を断定する表示ではありません。
              </p>
            ) : (
              <p>
                「配信済み」は、本システムにLINE送信成功の記録がある状態です。相手の端末への到達や既読を保証するものではありません。「送信記録」が複数回でも、再送事故とは限りません。
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
