import { describe, expect, test } from 'vitest';
import { resolveMessageSource } from './message-source.js';

describe('resolveMessageSource', () => {
  test('keeps an explicit booking source', () => {
    expect(resolveMessageSource({ direction: 'outgoing', source: 'event_booking' }))
      .toBe('event_booking');
  });

  test('infers historical automated messages before falling back to manual', () => {
    expect(resolveMessageSource({ direction: 'outgoing', scenario_step_id: 'step-1' }))
      .toBe('scenario');
    expect(resolveMessageSource({ direction: 'outgoing', broadcast_id: 'broadcast-1' }))
      .toBe('broadcast');
    expect(resolveMessageSource({ direction: 'outgoing', delivery_type: 'reply' }))
      .toBe('auto_reply');
    expect(resolveMessageSource({ direction: 'outgoing' })).toBe('manual');
  });

  test('classifies incoming messages as user messages', () => {
    expect(resolveMessageSource({ direction: 'incoming' })).toBe('user');
  });
});
