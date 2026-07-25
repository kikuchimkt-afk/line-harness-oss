interface MessageSourceFields {
  direction?: unknown;
  source?: unknown;
  broadcast_id?: unknown;
  scenario_step_id?: unknown;
  delivery_type?: unknown;
}

export function resolveMessageSource(message: MessageSourceFields): string {
  if (typeof message.source === 'string' && message.source.trim()) {
    return message.source;
  }
  if (message.direction === 'incoming') return 'user';
  if (message.scenario_step_id) return 'scenario';
  if (message.broadcast_id || message.delivery_type === 'test') return 'broadcast';
  if (message.delivery_type === 'reply') return 'auto_reply';
  return 'manual';
}
