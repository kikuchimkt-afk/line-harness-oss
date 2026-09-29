import { describe, expect, test } from 'vitest'
import type { ScenarioStep } from '@line-crm/shared'

import {
  recommendedManualStartStepId,
  stepsSkippedByManualStart,
  type ScenarioManualStartState,
} from './scenario-manual-start'

const steps = [
  { id: 'step-1', stepOrder: 1 },
  { id: 'step-3', stepOrder: 3 },
  { id: 'step-8', stepOrder: 8 },
] as ScenarioStep[]

function state(overrides: Partial<ScenarioManualStartState> = {}): ScenarioManualStartState {
  return {
    friend: { id: 'friend-1', displayName: 'テスト', pictureUrl: null, isFollowing: true },
    enrollment: null,
    currentNextStep: null,
    sentStepOrders: [],
    stateVersion: 'none',
    ...overrides,
  }
}

describe('recommendedManualStartStepId', () => {
  test('keeps the currently queued step for an active run', () => {
    expect(recommendedManualStartStepId(steps, state({
      currentNextStep: { id: 'step-3', stepOrder: 3, messageType: 'text' },
      sentStepOrders: [1],
    }))).toBe('step-3')
  })

  test('continues after the latest sent step when no run is active', () => {
    expect(recommendedManualStartStepId(steps, state({ sentStepOrders: [1] }))).toBe('step-3')
  })

  test('supports sparse step orders and safely falls back to the first step', () => {
    expect(recommendedManualStartStepId(steps, state({ sentStepOrders: [1, 3, 8] }))).toBe('step-1')
  })
})

describe('stepsSkippedByManualStart', () => {
  test('only reports earlier steps that have no successful send history', () => {
    expect(stepsSkippedByManualStart(steps, 'step-8', [1])).toEqual([3])
  })
})
