'use client'

import type { ScenarioStep } from '@line-crm/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '@/lib/api'
import {
  formatJstDateTime,
  messageTypeLabel,
  type ScenarioUpcomingDelivery,
} from '@/lib/scenario-delivery-status'
import {
  stepsSkippedByManualStart,
  type ScenarioManualStartState,
} from '@/lib/scenario-manual-start'
import {
  jstScheduleInputFromStored,
  scenarioScheduleHasChanges,
  scenarioScheduleNeedsAcknowledgement,
  validateJstScheduleInput,
  type ScenarioScheduleUpdateResult,
} from '@/lib/scenario-schedule-edit'

type Phase = 'edit' | 'confirm' | 'result'

function friendName(item: ScenarioUpcomingDelivery): string {
  return item.displayName.trim() || '名前未設定'
}

export default function ScenarioScheduleEditModal({
  scenarioId,
  scenarioName,
  steps,
  item,
  onClose,
  onChanged,
}: {
  scenarioId: string
  scenarioName: string
  steps: ScenarioStep[]
  item: ScenarioUpcomingDelivery | null
  onClose: () => void
  onChanged: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [phase, setPhase] = useState<Phase>('edit')
  const [stateLoading, setStateLoading] = useState(false)
  const [startState, setStartState] = useState<ScenarioManualStartState | null>(null)
  const [selectedStepId, setSelectedStepId] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [acknowledgedRisks, setAcknowledgedRisks] = useState(false)
  const [result, setResult] = useState<ScenarioScheduleUpdateResult | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const requestSequence = useRef(0)
  const stepsRef = useRef<ScenarioStep[]>([])
  const itemRef = useRef(item)
  const onCloseRef = useRef(onClose)

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.stepOrder - b.stepOrder),
    [steps],
  )
  stepsRef.current = sortedSteps
  itemRef.current = item
  onCloseRef.current = onClose
  const selectedStep = sortedSteps.find((step) => step.id === selectedStepId) ?? null
  const sentOrders = useMemo(() => new Set(startState?.sentStepOrders ?? []), [startState?.sentStepOrders])
  const skippedOrders = useMemo(
    () => stepsSkippedByManualStart(sortedSteps, selectedStepId, startState?.sentStepOrders ?? []),
    [selectedStepId, sortedSteps, startState?.sentStepOrders],
  )
  const needsAcknowledgement = scenarioScheduleNeedsAcknowledgement({
    selectedStepOrder: selectedStep?.stepOrder ?? null,
    sentStepOrders: sentOrders,
    skippedStepOrders: skippedOrders,
  })
  const scheduleValidation = validateJstScheduleInput(scheduleDate, scheduleTime)
  const currentInput = jstScheduleInputFromStored(startState?.enrollment?.nextDeliveryAt ?? item?.nextDeliveryAt)
  const currentStepOrder = startState?.currentNextStep?.stepOrder ?? item?.nextStepOrder
  const dirty = Boolean(startState && scenarioScheduleHasChanges({
    currentStepId: startState.currentNextStep?.id ?? '',
    nextStepId: selectedStepId,
    current: currentInput,
    next: { date: scheduleDate, time: scheduleTime },
  }))
  const minimumDate = jstScheduleInputFromStored(new Date().toISOString()).date

  useEffect(() => setMounted(true), [])

  const close = useCallback(() => {
    if (!submitting) onCloseRef.current()
  }, [submitting])

  const loadState = useCallback(async (target: ScenarioUpcomingDelivery) => {
    const requestId = ++requestSequence.current
    setPhase('edit')
    setStateLoading(true)
    setStartState(null)
    setSelectedStepId('')
    setError('')
    setAcknowledgedRisks(false)
    setResult(null)
    const input = jstScheduleInputFromStored(target.nextDeliveryAt)
    setScheduleDate(input.date)
    setScheduleTime(input.time)

    try {
      const response = await api.scenarios.manualStartState(scenarioId, target.friendId)
      if (requestId !== requestSequence.current) return
      if (!response.success) {
        setError(response.error || '現在の配信予定を取得できませんでした。')
        return
      }
      if (!response.data.enrollment || response.data.enrollment.id !== target.enrollmentId) {
        setError('配信予定が更新されています。一覧を更新してから、もう一度操作してください。')
        return
      }
      if (response.data.enrollment.status === 'delivering') {
        setError('現在LINEへの配信処理中です。処理完了後に最新情報へ更新してから編集してください。')
        return
      }
      setStartState(response.data)
      const currentStepId = response.data.currentNextStep?.id
        ?? stepsRef.current.find((step) => step.stepOrder === target.nextStepOrder)?.id
        ?? ''
      setSelectedStepId(currentStepId)
      const latestInput = jstScheduleInputFromStored(response.data.enrollment.nextDeliveryAt)
      setScheduleDate(latestInput.date)
      setScheduleTime(latestInput.time)
    } catch (loadError) {
      if (requestId === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : '現在の配信予定を取得できませんでした。')
      }
    } finally {
      if (requestId === requestSequence.current) setStateLoading(false)
    }
  }, [scenarioId])

  useEffect(() => {
    const target = itemRef.current
    if (!target) return
    void loadState(target)
    return () => {
      requestSequence.current += 1
    }
  }, [item?.enrollmentId, item?.friendId, loadState])

  useEffect(() => {
    if (!item) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    const overlay = overlayRef.current
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map((element) => ({
        element,
        wasInert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      }))
    for (const { element } of background) {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    }

    window.addEventListener('keydown', onKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      for (const { element, wasInert, ariaHidden } of background) {
        element.inert = wasInert
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      }
    }
  }, [close, item?.enrollmentId])

  const review = () => {
    setError('')
    if (!startState || !selectedStep) {
      setError('次に送るステップを選択してください。')
      return
    }
    const validation = validateJstScheduleInput(scheduleDate, scheduleTime)
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    setPhase('confirm')
  }

  const submit = async () => {
    if (!item || !startState || !startState.enrollment || !selectedStep) return
    const validation = validateJstScheduleInput(scheduleDate, scheduleTime)
    if (!validation.ok) {
      setError(validation.error)
      setPhase('edit')
      return
    }
    if (needsAcknowledgement && !acknowledgedRisks) {
      setError('再送またはステップのスキップに関する確認欄を選択してください。')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const response = await api.scenarios.updateDeliverySchedule(scenarioId, item.enrollmentId, {
        friendId: item.friendId,
        stepId: selectedStep.id,
        nextDeliveryAt: validation.iso,
        expectedStateVersion: startState.stateVersion,
        confirmPreviouslySent: sentOrders.has(selectedStep.stepOrder) && acknowledgedRisks,
      })
      if (!response.success) {
        setError(response.error || '配信予定を変更できませんでした。')
        setPhase('edit')
        return
      }
      setResult(response.data)
      setPhase('result')
      onChanged()
    } catch (submitError) {
      const message = submitError instanceof Error
        ? `${submitError.message} 最新の状態を読み直して、もう一度確認してください。`
        : '配信予定を変更できませんでした。最新の状態を読み直してください。'
      setPhase('edit')
      await loadState(item)
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted || !item) return null

  const modal = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/45 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !dirty) close()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-schedule-edit-title"
        aria-describedby="scenario-schedule-edit-description"
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-pink-100 bg-pink-50/60 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-pink-700">DELIVERY SCHEDULE</p>
            <h2 id="scenario-schedule-edit-title" className="mt-1 text-lg font-semibold text-gray-900">次回の配信予定を編集</h2>
            <p className="mt-1 text-xs text-gray-600">{scenarioName}</p>
            <p id="scenario-schedule-edit-description" className="sr-only">対象者の次に送るステップと配信日時を変更します。</p>
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
          {phase === 'edit' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">対象のお友だち</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{friendName(item)}</p>
                <p className="mt-1 text-xs text-gray-500">
                  現在: {formatJstDateTime(item.nextDeliveryAt)} JST ・ ステップ {item.nextStepOrder}
                </p>
              </div>

              {stateLoading ? (
                <div className="rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500" aria-live="polite">
                  最新の配信予定を確認しています...
                </div>
              ) : startState ? (
                <>
                  <div>
                    <label htmlFor="scenario-schedule-step" className="text-sm font-semibold text-gray-900">次に送るステップ</label>
                    <select
                      id="scenario-schedule-step"
                      value={selectedStepId}
                      onChange={(event) => {
                        setSelectedStepId(event.target.value)
                        setAcknowledgedRisks(false)
                      }}
                      className="mt-2 min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                    >
                      {sortedSteps.map((step) => (
                        <option key={step.id} value={step.id}>
                          ステップ {step.stepOrder} ・ {messageTypeLabel(step.messageType)}{sentOrders.has(step.stepOrder) ? '（送信記録あり）' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-900">次回の配信日時</legend>
                    <p className="mt-1 text-xs leading-5 text-gray-500">日本時間で指定します。実際の送信は5分間隔の処理により数分遅れる場合があります。</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium text-gray-600">
                        配信日
                        <input
                          type="date"
                          min={minimumDate}
                          value={scheduleDate}
                          onChange={(event) => setScheduleDate(event.target.value)}
                          className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                        />
                      </label>
                      <label className="text-xs font-medium text-gray-600">
                        配信時刻
                        <input
                          type="time"
                          step="60"
                          value={scheduleTime}
                          onChange={(event) => setScheduleTime(event.target.value)}
                          className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                        />
                      </label>
                    </div>
                    {scheduleDate && scheduleTime && !scheduleValidation.ok && (
                      <p className="mt-2 text-xs text-red-600" role="alert">{scheduleValidation.error}</p>
                    )}
                  </fieldset>

                  {selectedStep && sentOrders.has(selectedStep.stepOrder) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                      ステップ {selectedStep.stepOrder} には過去の送信記録があります。このステップを選ぶと再配信される可能性があります。
                    </div>
                  )}
                  {skippedOrders.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                      この変更で未送信のまま飛ばすステップ: {skippedOrders.join('、')}
                    </div>
                  )}
                </>
              ) : null}

              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}
              {startState && !dirty && !error && (
                <p className="text-right text-xs text-gray-500">日時または次のステップを変更すると確認へ進めます。</p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={close} className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">キャンセル</button>
                <button
                  type="button"
                  onClick={review}
                  disabled={stateLoading || !startState || !selectedStep || !scheduleValidation.ok || !dirty}
                  className="min-h-[44px] rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  変更内容を確認
                </button>
              </div>
            </div>
          )}

          {phase === 'confirm' && selectedStep && scheduleValidation.ok && (
            <div className="space-y-5">
              <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-5">
                <p className="text-sm font-semibold text-gray-900">この内容で次回予定を変更します</p>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                  <dt className="text-gray-500">友だち</dt>
                  <dd className="font-semibold text-gray-900">{friendName(item)}</dd>
                  <dt className="text-gray-500">次のステップ</dt>
                  <dd className="font-semibold text-gray-900">ステップ {currentStepOrder} → {selectedStep.stepOrder}</dd>
                  <dt className="text-gray-500">配信日時</dt>
                  <dd className="font-semibold text-gray-900">
                    <span className="block text-xs font-normal text-gray-500">変更前: {currentInput.date} {currentInput.time} JST</span>
                    <span className="mt-1 block">変更後: {scheduleDate} {scheduleTime} JST</span>
                  </dd>
                </dl>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                この操作ではLINEをすぐに送信しません。保存後、指定時刻以降の配信処理で送信されます。
              </div>
              {sentOrders.has(selectedStep.stepOrder) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900">
                  送信済みのステップを選択しています。同じ内容が再配信される可能性があります。
                </div>
              )}
              {skippedOrders.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  未送信のまま飛ばすステップ: {skippedOrders.join('、')}
                </div>
              )}
              {needsAcknowledgement && (
                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                  <input
                    type="checkbox"
                    checked={acknowledgedRisks}
                    onChange={(event) => setAcknowledgedRisks(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-pink-600"
                  />
                  <span>送信済み内容が再送される、または未送信ステップがスキップされる可能性を確認しました。</span>
                </label>
              )}
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setPhase('edit')} disabled={submitting} className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">戻って修正</button>
                <button type="button" onClick={() => void submit()} disabled={submitting || (needsAcknowledgement && !acknowledgedRisks)} className="min-h-[44px] rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? '変更中...' : 'この予定に変更'}
                </button>
              </div>
            </div>
          )}

          {phase === 'result' && result && (
            <div className="mx-auto max-w-lg py-4 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</span>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">配信予定を変更しました</h3>
              <p className="mt-2 text-sm text-gray-600">{friendName(item)}さんの次回予定を保存しました。</p>
              <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-left text-sm">
                <p className="text-gray-500">次回の処理予定</p>
                <p className="mt-1 font-semibold text-gray-900">{formatJstDateTime(result.enrollment.nextDeliveryAt)} JST</p>
                <p className="mt-1 text-xs text-gray-500">ステップ {result.nextStep.stepOrder} ・ {messageTypeLabel(result.nextStep.messageType)}</p>
                <p className="mt-3 text-xs leading-5 text-gray-500">画面内でLINE送信は行っていません。既存の配信処理が予定時刻に重複を防ぎながら実行します。</p>
              </div>
              <button type="button" onClick={close} className="mt-6 min-h-[44px] rounded-lg bg-pink-600 px-6 py-2 text-sm font-semibold text-white hover:bg-pink-700">閉じる</button>
            </div>
          )}
        </div>
      </section>
    </div>
  )

  return createPortal(modal, document.body)
}
