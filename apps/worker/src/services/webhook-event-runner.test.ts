import { describe, expect, test } from 'vitest';
import type { WebhookEvent } from '@line-crm/line-sdk';
import { runWebhookEvents } from './webhook-event-runner.js';

function followEvent(userId: string, id: string): WebhookEvent {
  return {
    type: 'follow',
    replyToken: `reply-${id}`,
    timestamp: Date.now(),
    source: { type: 'user', userId },
    webhookEventId: id,
    deliveryContext: { isRedelivery: false },
    mode: 'active',
  };
}

describe('runWebhookEvents', () => {
  test('handles a 20-person burst with bounded concurrency', async () => {
    const events = Array.from({ length: 20 }, (_, index) => followEvent(`U-${index}`, `event-${index}`));
    let active = 0;
    let maxActive = 0;
    let completed = 0;

    await runWebhookEvents(events, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      completed += 1;
    }, 5);

    expect(completed).toBe(20);
    expect(maxActive).toBe(5);
  });

  test('preserves order and avoids overlap for one user', async () => {
    const events = [
      followEvent('U-same', 'event-1'),
      followEvent('U-other', 'event-2'),
      followEvent('U-same', 'event-3'),
    ];
    const sameUserTimeline: string[] = [];

    await runWebhookEvents(events, async (event) => {
      if (event.source.type !== 'user' || event.source.userId !== 'U-same') return;
      sameUserTimeline.push(`start:${event.webhookEventId}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
      sameUserTimeline.push(`end:${event.webhookEventId}`);
    }, 5);

    expect(sameUserTimeline).toEqual([
      'start:event-1',
      'end:event-1',
      'start:event-3',
      'end:event-3',
    ]);
  });
});
