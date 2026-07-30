export interface TimelineMessage {
  direction: 'incoming' | 'outgoing'
}

export type OutgoingMessageStatus = 'sent' | 'replied'

export function getOutgoingMessageStatuses(
  messages: readonly TimelineMessage[],
): Array<OutgoingMessageStatus | null> {
  const statuses = new Array<OutgoingMessageStatus | null>(messages.length).fill(null)
  let hasLaterIncomingMessage = false

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.direction === 'incoming') {
      hasLaterIncomingMessage = true
      continue
    }
    statuses[index] = hasLaterIncomingMessage ? 'replied' : 'sent'
  }

  return statuses
}

export function outgoingMessageStatusText(status: OutgoingMessageStatus): string {
  return status === 'replied' ? '返信あり' : '送信済み'
}

export function outgoingMessageStatusDescription(status: OutgoingMessageStatus): string {
  if (status === 'replied') {
    return 'この送信後に相手から返信がありました。LINEではメッセージごとの既読状態を取得できません。'
  }
  return 'LINEへの送信は完了しています。LINEではメッセージごとの既読状態を取得できません。'
}
