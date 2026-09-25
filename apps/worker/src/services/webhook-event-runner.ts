import type { WebhookEvent } from '@line-crm/line-sdk';

function sourceKey(event: WebhookEvent): string {
  const source = event.source;
  if (source.type === 'user') return `user:${source.userId}`;
  if (source.type === 'group') return `group:${source.groupId}`;
  if (source.type === 'room') return `room:${source.roomId}`;
  return `event:${event.webhookEventId}`;
}

/**
 * Process independent LINE users concurrently while preserving event order for
 * the same source. This keeps a 10-20 person event burst well inside the
 * waitUntil window without racing one person's follow/message sequence.
 */
export async function runWebhookEvents(
  events: WebhookEvent[],
  handler: (event: WebhookEvent) => Promise<void>,
  maxConcurrency = 5,
): Promise<void> {
  const bySource = new Map<string, WebhookEvent[]>();
  for (const event of events) {
    const key = sourceKey(event);
    const queue = bySource.get(key);
    if (queue) queue.push(event);
    else bySource.set(key, [event]);
  }

  const queues = [...bySource.values()];
  let nextQueue = 0;
  const workerCount = Math.min(Math.max(1, maxConcurrency), queues.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextQueue;
      nextQueue += 1;
      const queue = queues[index];
      if (!queue) return;
      for (const event of queue) await handler(event);
    }
  }));
}
