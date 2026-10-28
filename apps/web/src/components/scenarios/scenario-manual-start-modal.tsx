'use client'

import type { Friend, ScenarioStep, DeliveryMode } from '@line-crm/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api, type FriendListItem } from '@/lib/api'
import { formatJstDateTime, messageTypeLabel } from '@/lib/scenario-delivery-status'
import {
  manualStartActionLabel,
  recommendedManualStartStepId,
  stepsSkippedByManualStart,
  type ScenarioManualStartState,
  type ScenarioStartFromStepResult,
} from '@/lib/scenario-manual-start'

type Phase = 'select' | 'confirm' | 'result'
type DeliveryTiming = 'configured' | 'next_cron'

function friendName(friend: Pick<Friend, 'displayName'>): string {
  return friend.displayName.trim() || '名前未設定'
}

function Avatar({ friend }: { friend: Pick<Friend, 'displayName' | 'pictureUrl'> }) {
  if (friend.pictureUrl) {
    return <img src={friend.pictureUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  }
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-50 text-sm font-semibold text-pink-700">
      {friendName(friend).slice(0, 1)}
    </span>
  )
}

function scheduleLabel(mode: DeliveryMode | undefined, step: ScenarioStep): string {
  if (mode === 'elapsed') {
    const totalMinutes = (step.offsetDays ?? 0) * 1440 + (step.offsetMinutes ?? 0)
    if (totalMinutes === 0) return '開始時点'
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60
    return `開始から${days ? `${days}日` : ''}${hours ? `${hours}時間` : ''}${minutes ? `${minutes}分` : ''}後`
  }
  if (mode === 'absolute_time') {
    return `開始から${step.offsetDays ?? 0}日後 ${step.deliveryTime ?? '00:00'}`
  }
  if (step.offsetDays != null && step.deliveryTime) {
    return `前の処理から${step.offsetDays}日後 ${step.deliveryTime}`
  }
  if (step.delayMinutes === 0) return '前の処理後すぐ'
  if (step.delayMinutes < 60) return `前の処理から${step.delayMinutes}分後`
  const hours = Math.floor(step.delayMinutes / 60)
  const minutes = step.delayMinutes % 60
  return `前の処理から${hours}時間${minutes ? `${minutes}分` : ''}後`
}

function StepOption({
  step,
  deliveryMode,
  checked,
  sent,
  onChange,
}: {
  step: ScenarioStep
  deliveryMode: DeliveryMode | undefined
  checked: boolean
  sent: boolean
  onChange: () => void
}) {
  return (
    <label className={`block cursor-pointer rounded-xl border p-3 transition ${checked ? 'border-pink-400 bg-pink-50/60 ring-2 ring-pink-100' : 'border-gray-200 bg-white hover:border-pink-200'}`}>
      <span className="flex items-start gap-3">
        <input
          type="radio"
          name="manual-start-step"
          checked={checked}
          onChange={onChange}
          className="mt-1 h-4 w-4 border-gray-300 text-pink-600 focus:ring-pink-400"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">ステップ {step.stepOrder}</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{messageTypeLabel(step.messageType)}</span>
            {sent && <span className="rounded bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">送信記録あり</span>}
          </span>
          <span className="mt-1 block text-xs text-gray-500">{scheduleLabel(deliveryMode, step)}</span>
        </span>
      </span>
    </label>
  )
}

export default function ScenarioManualStartModal({
  scenarioId,
  scenarioName,
  scenarioIsActive,
  lineAccountId,
  deliveryMode,
  steps,
  onChanged,
}: {
  scenarioId: string
  scenarioName: string
  scenarioIsActive: boolean
  lineAccountId: string | null
  deliveryMode: DeliveryMode | undefined
  steps: ScenarioStep[]
  onChanged?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('select')
  const [search, setSearch] = useState('')
  const [friends, setFriends] = useState<FriendListItem[]>([])
  const [friendLoading, setFriendLoading] = useState(false)
  const [friendError, setFriendError] = useState('')
  const [selectedFriend, setSelectedFriend] = useState<FriendListItem | null>(null)
  const [startState, setStartState] = useState<ScenarioManualStartState | null>(null)
  const [stateLoading, setStateLoading] = useState(false)
  const [selectedStepId, setSelectedStepId] = useState('')
  const [deliveryTiming, setDeliveryTiming] = useState<DeliveryTiming>('next_cron')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ScenarioStartFromStepResult | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.stepOrder - b.stepOrder),
    [steps],
  )
  const selectedStep = sortedSteps.find((step) => step.id === selectedStepId) ?? null
  const sentOrders = useMemo(() => new Set(startState?.sentStepOrders ?? []), [startState?.sentStepOrders])
  const skippedOrders = useMemo(
    () => stepsSkippedByManualStart(sortedSteps, selectedStepId, startState?.sentStepOrders ?? []),
    [sortedSteps, selectedStepId, startState?.sentStepOrders],
  )
  const cannotOperate = !scenarioIsActive || sortedSteps.length === 0
  const deliveryInProgress = startState?.enrollment?.status === 'delivering'

  useEffect(() => setMounted(true), [])

  const close = useCallback(() => {
    if (submitting) return
    setOpen(false)
  }, [submitting])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, open])

  useEffect(() => {
    if (!open || phase !== 'select') return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setFriendLoading(true)
      setFriendError('')
      api.friends.list({
        accountId: lineAccountId ?? undefined,
        search: search.trim() || undefined,
        includeTags: false,
        includeChatStatus: false,
        limit: 50,
        sort: 'recent',
      })
        .then((response) => {
          if (cancelled) return
          if (response.success) setFriends(response.data.items)
          else setFriendError(response.error || '友だちを取得できませんでした')
        })
        .catch((loadError) => {
          if (!cancelled) setFriendError(loadError instanceof Error ? loadError.message : '友だちを取得できませんでした')
        })
        .finally(() => {
          if (!cancelled) setFriendLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [lineAccountId, open, phase, search])

  const openModal = () => {
    setPhase('select')
    setSearch('')
    setFriends([])
    setSelectedFriend(null)
    setStartState(null)
    setSelectedStepId('')
    setDeliveryTiming('next_cron')
    setSubmitError('')
    setResult(null)
    setOpen(true)
  }

  const selectFriend = async (friend: FriendListItem) => {
    if (!friend.isFollowing) return
    setSelectedFriend(friend)
    setStartState(null)
    setSelectedStepId('')
    setSubmitError('')
    setStateLoading(true)
    try {
      const response = await api.scenarios.manualStartState(scenarioId, friend.id)
      if (!response.success) {
        setSubmitError(response.error || '現在のシナリオ状態を確認できませんでした')
        return
      }
      setStartState(response.data)
      setSelectedStepId(recommendedManualStartStepId(sortedSteps, response.data))
    } catch (loadError) {
      setSubmitError(loadError instanceof Error ? loadError.message : '現在のシナリオ状態を確認できませんでした')
    } finally {
      setStateLoading(false)
    }
  }

  const submit = async () => {
    if (!selectedFriend || !selectedStep || !startState || deliveryInProgress) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await api.scenarios.startFromStep(scenarioId, {
        friendId: selectedFriend.id,
        stepId: selectedStep.id,
        deliveryTiming,
        expectedStateVersion: startState.stateVersion,
      })
      if (!response.success) {
        setSubmitError(response.error || '開始位置を変更できませんでした')
        setPhase('select')
        return
      }
      setResult(response.data)
      setPhase('result')
      onChanged?.()
    } catch (submitFailure) {
      const message = submitFailure instanceof Error
        ? `${submitFailure.message}。最新状態を読み直して、もう一度確認してください。`
        : '開始位置を変更できませんでした。最新状態を読み直してください。'
      setPhase('select')
      await selectFriend(selectedFriend)
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const modal = open && (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/45 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-manual-start-title"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-pink-100 bg-pink-50/60 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-pink-700">MANUAL SCENARIO START</p>
            <h2 id="scenario-manual-start-title" className="mt-1 text-lg font-semibold text-gray-900">
              友だちを指定して途中から開始
            </h2>
            <p className="mt-1 text-xs text-gray-600">{scenarioName}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            disabled={submitting}
            aria-label="閉じる"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-white disabled:opacity-40"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-6">
          {phase === 'select' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                選んだステップより前は、この操作では送信しません。過去の送信履歴は消さず、次に処理する位置だけを変更します。
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="min-w-0 rounded-xl border border-gray-200 p-4">
                  <label htmlFor="manual-start-friend-search" className="text-sm font-semibold text-gray-900">1. 友だちを選択</label>
                  <div className="relative mt-3">
                    <input
                      id="manual-start-friend-search"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="LINE表示名で検索"
                      className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                    />
                    {friendLoading && <span className="absolute right-3 top-3 text-xs text-gray-400">検索中...</span>}
                  </div>
                  {lineAccountId == null && (
                    <p className="mt-2 text-xs leading-5 text-amber-700">全アカウント共通シナリオです。選んだ友だちが所属するLINEアカウントから配信します。</p>
                  )}
                  {friendError && <p className="mt-3 text-xs text-red-600" role="alert">{friendError}</p>}
                  <ul className="mt-3 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
                    {!friendLoading && friends.length === 0 && (
                      <li className="px-3 py-8 text-center text-sm text-gray-500">該当する友だちはいません</li>
                    )}
                    {friends.map((friend) => {
                      const selected = selectedFriend?.id === friend.id
                      return (
                        <li key={friend.id}>
                          <button
                            type="button"
                            onClick={() => void selectFriend(friend)}
                            disabled={!friend.isFollowing}
                            className={`flex min-h-[58px] w-full items-center gap-3 px-3 py-2 text-left transition ${selected ? 'bg-pink-50' : 'hover:bg-gray-50'} disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <Avatar friend={friend} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900">{friendName(friend)}</span>
                              <span className="text-xs text-gray-500">{friend.isFollowing ? '友だち追加中' : 'ブロック・解除済み'}</span>
                            </span>
                            {selected && <span className="text-sm font-semibold text-pink-700">選択中</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <div className="min-w-0 rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">2. 次に送るステップを選択</h3>
                  {!selectedFriend ? (
                    <div className="mt-3 rounded-lg bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">先に友だちを選んでください</div>
                  ) : stateLoading ? (
                    <div className="mt-3 rounded-lg bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">現在の進行状況を確認しています...</div>
                  ) : startState ? (
                    <div className="mt-3 space-y-4">
                      <div className="rounded-lg bg-gray-50 px-3 py-3 text-xs leading-5 text-gray-700">
                        {startState.enrollment ? (
                          <>
                            <p><span className="font-semibold">現在の状態:</span> {startState.enrollment.status === 'paused' ? '一時停止中' : startState.enrollment.status === 'delivering' ? '配信処理中' : '進行中'}</p>
                            <p><span className="font-semibold">現在の次回:</span> {startState.currentNextStep ? `ステップ ${startState.currentNextStep.stepOrder}` : '完了位置'}</p>
                          </>
                        ) : (
                          <p>現在進行中の登録はありません。選んだステップから新しく開始します。</p>
                        )}
                        {startState.sentStepOrders.length > 0 && (
                          <p><span className="font-semibold">送信記録:</span> ステップ {startState.sentStepOrders.join('、')}</p>
                        )}
                      </div>

                      {deliveryInProgress && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                          現在LINEへの配信処理中です。重複送信を防ぐため、処理完了後に最新状態へ更新してから操作してください。
                        </div>
                      )}

                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {sortedSteps.map((step) => (
                          <StepOption
                            key={step.id}
                            step={step}
                            deliveryMode={deliveryMode}
                            checked={selectedStepId === step.id}
                            sent={sentOrders.has(step.stepOrder)}
                            onChange={() => setSelectedStepId(step.id)}
                          />
                        ))}
                      </div>

                      <fieldset className="space-y-2">
                        <legend className="text-xs font-semibold text-gray-700">開始タイミング</legend>
                        <label className={`block cursor-pointer rounded-lg border p-3 ${deliveryTiming === 'next_cron' ? 'border-pink-300 bg-pink-50/50' : 'border-gray-200'}`}>
                          <span className="flex gap-2">
                            <input type="radio" name="delivery-timing" checked={deliveryTiming === 'next_cron'} onChange={() => setDeliveryTiming('next_cron')} />
                            <span>
                              <span className="block text-sm font-medium text-gray-900">次の配信処理から開始</span>
                              <span className="mt-0.5 block text-xs text-gray-500">通常5分以内に、選んだステップの処理を開始します。</span>
                            </span>
                          </span>
                        </label>
                        <label className={`block cursor-pointer rounded-lg border p-3 ${deliveryTiming === 'configured' ? 'border-pink-300 bg-pink-50/50' : 'border-gray-200'}`}>
                          <span className="flex gap-2">
                            <input type="radio" name="delivery-timing" checked={deliveryTiming === 'configured'} onChange={() => setDeliveryTiming('configured')} />
                            <span>
                              <span className="block text-sm font-medium text-gray-900">ステップ設定の時刻で予約</span>
                              <span className="mt-0.5 block text-xs text-gray-500">現在のシナリオ開始時刻とステップの待ち時間から予定を再計算します。</span>
                            </span>
                          </span>
                        </label>
                      </fieldset>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg bg-red-50 px-4 py-4 text-sm text-red-700">{submitError || '進行状況を取得できませんでした'}</div>
                  )}
                </div>
              </div>

              {submitError && startState && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{submitError}</div>}

              <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={close} className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">キャンセル</button>
                <button
                  type="button"
                  onClick={() => { setSubmitError(''); setPhase('confirm') }}
                  disabled={!selectedFriend || !selectedStep || !startState || stateLoading || deliveryInProgress}
                  className="min-h-[44px] rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  内容を確認
                </button>
              </div>
            </div>
          )}

          {phase === 'confirm' && selectedFriend && selectedStep && startState && (
            <div className="mx-auto max-w-xl space-y-5">
              <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-5">
                <p className="text-sm font-semibold text-gray-900">この内容で開始位置を設定します</p>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                  <dt className="text-gray-500">友だち</dt>
                  <dd className="font-semibold text-gray-900">{friendName(selectedFriend)}</dd>
                  <dt className="text-gray-500">開始位置</dt>
                  <dd className="font-semibold text-gray-900">ステップ {selectedStep.stepOrder}（{messageTypeLabel(selectedStep.messageType)}）</dd>
                  <dt className="text-gray-500">開始タイミング</dt>
                  <dd className="font-semibold text-gray-900">{deliveryTiming === 'next_cron' ? '次の配信処理（通常5分以内）' : 'ステップ設定の時刻'}</dd>
                  <dt className="text-gray-500">現在の状態</dt>
                  <dd className="text-gray-900">{startState.enrollment ? (startState.enrollment.status === 'paused' ? '一時停止中（再開します）' : '進行中（位置を変更します）') : '未登録（新しく開始します）'}</dd>
                </dl>
              </div>

              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <p className="font-semibold">送信範囲を確認してください</p>
                <p>ステップ {selectedStep.stepOrder} より前は、この操作では送信しません。既存の送信履歴は残ります。</p>
                {skippedOrders.length > 0 && <p>未送信のままスキップされるステップ: {skippedOrders.join('、')}</p>}
                {sentOrders.has(selectedStep.stepOrder) && (
                  <p className="font-semibold text-red-700">選んだステップには過去の送信記録があります。開始すると同じステップが再度配信される可能性があります。</p>
                )}
              </div>

              {submitError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{submitError}</div>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setPhase('select')} disabled={submitting} className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">戻って修正</button>
                <button type="button" onClick={() => void submit()} disabled={submitting} className="min-h-[44px] rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-wait disabled:opacity-50">
                  {submitting ? '設定中...' : `ステップ ${selectedStep.stepOrder} から開始`}
                </button>
              </div>
            </div>
          )}

          {phase === 'result' && result && (
            <div className="mx-auto max-w-xl py-4 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</span>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{manualStartActionLabel(result.action)}</h3>
              <p className="mt-2 text-sm text-gray-600">{friendName(result.friend)}さんは、ステップ {result.startStep.stepOrder} が次の対象です。</p>
              <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-left text-sm">
                <p className="text-gray-500">次回の処理予定</p>
                <p className="mt-1 font-semibold text-gray-900">{formatJstDateTime(result.nextDeliveryAt)} JST</p>
                <p className="mt-2 text-xs leading-5 text-gray-500">画面内でLINE送信は行っていません。既存の配信処理が予定時刻に重複を防ぎながら実行します。</p>
              </div>
              <button type="button" onClick={close} className="mt-6 min-h-[44px] rounded-lg bg-pink-600 px-6 py-2 text-sm font-semibold text-white hover:bg-pink-700">閉じる</button>
            </div>
          )}
        </div>
      </section>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={cannotOperate}
        title={!scenarioIsActive ? '無効なシナリオでは開始位置を変更できません' : sortedSteps.length === 0 ? 'ステップを追加してください' : undefined}
        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        <span aria-hidden="true">＋</span>
        友だちを指定して途中から開始
      </button>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  )
}
