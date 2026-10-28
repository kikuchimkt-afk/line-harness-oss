import { describe, expect, test } from 'vitest'
import {
  buildPhoneUri,
  isPhoneActionData,
  normalizePhoneNumber,
  phoneInputFromActionData,
} from './phone-action.js'

describe('rich menu phone action', () => {
  test('converts a formatted Japanese phone number to a tel URI', () => {
    expect(buildPhoneUri('088-600-8922')).toBe('tel:0886008922')
  })

  test('supports full-width digits and an international number', () => {
    expect(normalizePhoneNumber('＋８１ ９０－１２３４－５６７８'))
      .toBe('+819012345678')
  })

  test('rejects incomplete and non-numeric values', () => {
    expect(buildPhoneUri('088-12')).toBeNull()
    expect(buildPhoneUri('088-ABC-8922')).toBeNull()
  })

  test('restores phone input from existing tel URI actions', () => {
    const data = { uri: 'tel:0886008922' }
    expect(isPhoneActionData(data)).toBe(true)
    expect(phoneInputFromActionData(data)).toBe('0886008922')
  })
})
