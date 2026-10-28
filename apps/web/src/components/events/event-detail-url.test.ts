import { describe, expect, test } from 'vitest'
import { normalizeEventDetailUrl, validateEventDetailUrl } from './event-detail-url.js'

describe('validateEventDetailUrl', () => {
  test('accepts an HTTPS absolute URL', () => {
    expect(validateEventDetailUrl('https://example.com/lesson?from=line')).toBeNull()
  })

  test.each([
    'http://example.com/lesson',
    '/lesson',
    'example.com/lesson',
    'https://',
    'https://user:password@example.com/lesson',
  ])('rejects a non-HTTPS or incomplete URL: %s', (value) => {
    expect(validateEventDetailUrl(value)).toBe(
      'レッスン詳細ページ URL は https:// から始まる完全な URL を入力してください',
    )
  })

  test('allows an empty optional value', () => {
    expect(validateEventDetailUrl(null)).toBeNull()
    expect(validateEventDetailUrl('  ')).toBeNull()
  })
})

describe('normalizeEventDetailUrl', () => {
  test('trims the value before saving', () => {
    expect(normalizeEventDetailUrl('  https://example.com/lesson  ')).toBe('https://example.com/lesson')
  })

  test('stores blank input as null', () => {
    expect(normalizeEventDetailUrl('  ')).toBeNull()
  })
})
