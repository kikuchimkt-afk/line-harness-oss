import type { ScenarioStep } from '@line-crm/shared'

export type ScenarioManualStartFriend = {
  id: string
  displayName: string
  pictureUrl: string | null
  isFollowing: boolean
}

export type ScenarioManualStartEnrollment = {
  id: string
  status: 'active' | 'paused' | 'delivering'
  currentStepOrder: number
  startedAt: string
  nextDeliveryAt: string | null
  updatedAt: string
}

export type ScenarioManualStartStep = {
  id: string
  stepOrder: number
  messageType: string
}

export type ScenarioManualStartState = {
  friend: ScenarioManualStartFriend
  enrollment: ScenarioManualStartEnrollment | null
  currentNextStep: ScenarioManualStartStep | null
  sentStepOrders: number[]
  stateVersion: string
}

export type ScenarioStartFromStepResult = {
  action: 'created' | 'resumed' | 'repositioned'
  friend: ScenarioManualStartFriend
  enrollment: ScenarioManualStartEnrollment
  startStep: ScenarioManualStartStep
  sentStepOrders: number[]
  skippedStepOrders: number[]
  nextDeliveryAt: string
  deliveryTiming: 'configured' | 'next_cron'
  stateVersion: string
}

/**
 * Prefer the step that is already queued for an active run. If there is no
 * active run, place the cursor after the latest successful send so an operator
 * can naturally continue Step 1 -> Step 2 without re-sending Step 1.
 */
export function recommendedManualStartStepId(
  steps: ScenarioStep[],
  state: ScenarioManualStartState,
): string {
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)
  if (state.currentNextStep && sorted.some((step) => step.id === state.currentNextStep?.id)) {
    return state.currentNextStep.id
  }

  const latestSentOrder = state.sentStepOrders.length > 0
    ? Math.max(...state.sentStepOrders)
    : Number.NEGATIVE_INFINITY
  return sorted.find((step) => step.stepOrder > latestSentOrder)?.id ?? sorted[0]?.id ?? ''
}

export function stepsSkippedByManualStart(
  steps: ScenarioStep[],
  selectedStepId: string,
  sentStepOrders: number[],
): number[] {
  const selected = steps.find((step) => step.id === selectedStepId)
  if (!selected) return []
  const sent = new Set(sentStepOrders)
  return steps
    .filter((step) => step.stepOrder < selected.stepOrder && !sent.has(step.stepOrder))
    .map((step) => step.stepOrder)
    .sort((a, b) => a - b)
}

export function manualStartActionLabel(action: ScenarioStartFromStepResult['action']): string {
  if (action === 'created') return '新しく開始しました'
  if (action === 'resumed') return '一時停止を解除して再開しました'
  return '次に送るステップを変更しました'
}
