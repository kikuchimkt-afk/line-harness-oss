import { describe, expect, test } from 'vitest'
import { getOutgoingMessageStatuses } from './outgoing-message-status.js'

describe('getOutgoingMessageStatuses', () => {
  test('does not add a delivery status to incoming messages', () => {
    const messages = [{ direction: 'incoming' as const }]

    expect(getOutgoingMessageStatuses(messages)).toEqual([null])
  })

  test('marks an outgoing message as sent when no reply follows it', () => {
    const messages = [
      { direction: 'incoming' as const },
      { direction: 'outgoing' as const },
    ]

    expect(getOutgoingMessageStatuses(messages)).toEqual([null, 'sent'])
  })

  test('marks an outgoing message as replied when a later incoming message exists', () => {
    const messages = [
      { direction: 'outgoing' as const },
      { direction: 'outgoing' as const },
      { direction: 'incoming' as const },
    ]

    expect(getOutgoingMessageStatuses(messages)).toEqual(['replied', 'replied', null])
  })

  test('does not treat a reply before the outgoing message as a later reply', () => {
    const messages = [
      { direction: 'incoming' as const },
      { direction: 'outgoing' as const },
    ]

    expect(getOutgoingMessageStatuses(messages)).toEqual([null, 'sent'])
  })
})
