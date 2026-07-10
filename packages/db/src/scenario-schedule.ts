import type { DeliveryMode } from './scenarios.js';

export interface ScenarioRow {
  delivery_mode: DeliveryMode;
}

export interface StepRow {
  delay_minutes: number;
  offset_days: number | null;
  offset_minutes: number | null;
  delivery_time: string | null;
}

export interface ScheduleContext {
  /** friend_scenarios.started_at (JST) を Date に変換したもの */
  enrolledAt: Date;
  /** 前ステップ配信完了時刻 (relative mode で使用)。初回は enrolledAt と同じ */
  previousDeliveredAt: Date;
  /** 現在時刻 (JST)。absolute_time mode の過去時刻 clamp に使用 */
  now: Date;
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function setClockTime(date: Date, deliveryTime: string | null): Date {
  const target = new Date(date);
  const [h, m] = (deliveryTime ?? '00:00').split(':').map(Number);
  target.setHours(h, m, 0, 0);
  return target;
}

function scheduledClockTimeAfter(
  base: Date,
  days: number,
  deliveryTime: string | null,
  now: Date,
): Date {
  let target = setClockTime(addDays(base, days), deliveryTime);

  // 「0日後 17:00」を選んだが、前ステップが20:00に配信された場合など、
  // 指定時刻が前ステップより前になると即時配信になってしまう。次の同時刻へ送る。
  if (target <= base) {
    target = addDays(target, 1);
  }

  return target < now ? now : target;
}

/**
 * 次配信時刻を計算する。delivery_mode に応じて 3 通りの計算を切り替える。
 *
 * - relative: previousDeliveredAt + delay_minutes.
 *   offset_days + delivery_time が入っているステップは「前ステップ配信後 N 日後の HH:MM」。
 * - elapsed: enrolledAt + (offset_days*1440 + offset_minutes) 分
 * - absolute_time: enrolledAt + offset_days 日後の delivery_time。過去なら now に丸める。
 */
export function computeNextDeliveryAt(
  scenario: ScenarioRow,
  step: StepRow,
  context: ScheduleContext,
): Date {
  switch (scenario.delivery_mode) {
    case 'relative':
      if (step.offset_days != null && step.delivery_time) {
        return scheduledClockTimeAfter(
          context.previousDeliveredAt,
          step.offset_days,
          step.delivery_time,
          context.now,
        );
      }
      return addMinutes(context.previousDeliveredAt, step.delay_minutes ?? 0);

    case 'elapsed':
      return addMinutes(
        context.enrolledAt,
        (step.offset_days ?? 0) * 1440 + (step.offset_minutes ?? 0),
      );

    case 'absolute_time': {
      const target = setClockTime(addDays(context.enrolledAt, step.offset_days ?? 0), step.delivery_time);
      return target < context.now ? context.now : target;
    }
  }
}
