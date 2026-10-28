import { describe, expect, test } from 'vitest'

import {
  filterByDisplayName,
  formatJstDateTime,
  messageTypeLabel,
  upcomingStatePresentation,
} from './scenario-delivery-status'

describe('scenario delivery status helpers', () => {
  test('formats timestamps explicitly in Japan time', () => {
    expect(formatJstDateTime('2026-09-29T09:05:00.000Z')).toBe('2026/09/29 18:05')
    expect(formatJstDateTime('2026-09-29T18:05:00.000')).toBe('2026/09/29 18:05')
    expect(formatJstDateTime('2026-09-29 18:05:00')).toBe('2026/09/29 18:05')
    expect(formatJstDateTime('2026-09-29T18:05:00+09:00')).toBe('2026/09/29 18:05')
    expect(formatJstDateTime('invalid')).toBe('日時を確認')
  })

  test('uses the scenario active flag before enrollment status', () => {
    expect(upcomingStatePresentation({
      scenarioIsActive: false,
      status: 'active',
      nextDeliveryAt: '2026-09-30T00:00:00.000Z',
      generatedAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
    })).toEqual({ label: 'シナリオ停止中', tone: 'gray' })
  })

  test.each([
    ['paused', '2026-09-30T00:00:00.000Z', '2026-09-29T00:00:00.000Z', '一時停止中', 'gray'],
    ['delivering', '2026-09-30T00:00:00.000Z', '2026-09-28T23:57:00.000Z', '送信処理中', 'blue'],
    ['delivering', '2026-09-30T00:00:00.000Z', '2026-09-28T23:50:00.000Z', '再処理待ち', 'amber'],
    ['active', '2026-09-28T00:00:00.000Z', '2026-09-29T00:00:00.000Z', '配信処理待ち', 'amber'],
    ['active', '2026-09-30T00:00:00.000Z', '2026-09-29T00:00:00.000Z', '配信予定', 'green'],
    ['completed', '2026-09-30T00:00:00.000Z', '2026-09-29T00:00:00.000Z', '状態を確認', 'red'],
  ])('maps %s to an accurate operator-facing label', (status, nextDeliveryAt, updatedAt, label, tone) => {
    expect(upcomingStatePresentation({
      scenarioIsActive: true,
      status,
      nextDeliveryAt,
      generatedAt: '2026-09-29T00:00:00.000Z',
      updatedAt,
    })).toEqual({ label, tone })
  })

  test('filters locally by display name and ignores surrounding whitespace', () => {
    const rows = [
      { displayName: '犬伏 伶乃' },
      { displayName: 'ベストワンコ' },
    ]
    expect(filterByDisplayName(rows, '  ワンコ ')).toEqual([{ displayName: 'ベストワンコ' }])
    expect(filterByDisplayName(rows, '')).toBe(rows)
  })

  test('shows known message types in Japanese without hiding unknown values', () => {
    expect(messageTypeLabel('text')).toBe('テキスト')
    expect(messageTypeLabel('image')).toBe('画像')
    expect(messageTypeLabel('flex')).toBe('Flex')
    expect(messageTypeLabel('video')).toBe('video')
  })
})
