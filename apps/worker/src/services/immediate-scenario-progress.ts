import {
  advanceFriendScenario,
  completeFriendScenario,
  computeNextDeliveryAt,
  type DeliveryMode,
} from '@line-crm/db';

interface ImmediateScenarioStep {
  step_order: number;
  delay_minutes: number;
  offset_days: number | null;
  offset_minutes: number | null;
  delivery_time: string | null;
}

interface FinalizeImmediateScenarioDeliveryInput {
  enrollmentId: string;
  deliveryMode: DeliveryMode;
  deliveredStep: ImmediateScenarioStep;
  nextStep: ImmediateScenarioStep | null;
  enrolledAt: Date;
  deliveredAt: Date;
}

/**
 * Move an enrollment forward after an immediate LINE send has succeeded and
 * been written to messages_log. Without this transition, the cron worker sees
 * the original step as still due and can send it a second time.
 */
export async function finalizeImmediateScenarioDelivery(
  db: D1Database,
  input: FinalizeImmediateScenarioDeliveryInput,
): Promise<void> {
  if (!input.nextStep) {
    await completeFriendScenario(db, input.enrollmentId);
    return;
  }

  const nextDeliveryDate = computeNextDeliveryAt(
    { delivery_mode: input.deliveryMode },
    input.nextStep,
    {
      enrolledAt: input.enrolledAt,
      previousDeliveredAt: input.deliveredAt,
      now: input.deliveredAt,
    },
  );

  // Scenario scheduling represents a JST wall-clock value in Date, then
  // persists that clock with an explicit +09:00 suffix. Keep the same format
  // used by webhook.ts and the cron delivery path.
  const nextDeliveryAt = nextDeliveryDate.toISOString().slice(0, -1) + '+09:00';
  await advanceFriendScenario(
    db,
    input.enrollmentId,
    input.deliveredStep.step_order,
    nextDeliveryAt,
  );
}
