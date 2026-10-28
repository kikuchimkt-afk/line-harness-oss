import { describe, expect, test } from 'vitest';
import {
  isBeforeEventWaitlistCutoff,
  promoteEventWaitlist,
} from './event-booking-waitlist.js';

interface Booking {
  id: string;
  slot_id: string;
  status: string;
  requested_at: string;
  promoted_at?: string | null;
}

function waitlistDb(input: {
  capacity: number | null;
  startsAt: string;
  waitlistEnabled?: number;
  cutoffHours?: number | null;
  bookings: Booking[];
}): D1Database {
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first<T>() {
          if (sql.includes('FROM event_slots s')) {
            return {
              capacity: input.capacity,
              starts_at: input.startsAt,
              waitlist_enabled: input.waitlistEnabled ?? 1,
              cancel_deadline_hours_before: input.cutoffHours ?? 48,
            } as T;
          }
          if (sql.includes("status = 'waitlisted'") && sql.includes('ORDER BY requested_at')) {
            const [slotId] = bound as [string];
            const next = input.bookings
              .filter((booking) => booking.slot_id === slotId && booking.status === 'waitlisted')
              .sort((a, b) => a.requested_at.localeCompare(b.requested_at) || a.id.localeCompare(b.id))[0];
            return (next ? { id: next.id } : null) as T | null;
          }
          if (sql.includes('COUNT(*) AS c')) {
            const [slotId] = bound as [string];
            const c = input.bookings.filter(
              (booking) =>
                booking.slot_id === slotId &&
                (booking.status === 'requested' || booking.status === 'confirmed'),
            ).length;
            return { c } as T;
          }
          return null as T | null;
        },
        async run() {
          if (sql.includes("SET status = 'confirmed'")) {
            const [promotedAt, _decidedAt, _updatedAt, id, slotId, capacity] = bound as [
              string,
              string,
              string,
              string,
              string,
              number,
            ];
            const active = input.bookings.filter(
              (booking) =>
                booking.slot_id === slotId &&
                (booking.status === 'requested' || booking.status === 'confirmed'),
            ).length;
            const booking = input.bookings.find(
              (candidate) => candidate.id === id && candidate.status === 'waitlisted',
            );
            if (!booking || active >= capacity) return { meta: { changes: 0 } };
            booking.status = 'confirmed';
            booking.promoted_at = promotedAt;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('isBeforeEventWaitlistCutoff', () => {
  test('48時間前の境界までは繰り上げ可能で、境界ちょうどから不可', () => {
    const startsAt = '2026-09-10T10:00:00.000Z';
    expect(isBeforeEventWaitlistCutoff(startsAt, 48, new Date('2026-09-08T09:59:59.999Z'))).toBe(true);
    expect(isBeforeEventWaitlistCutoff(startsAt, 48, new Date('2026-09-08T10:00:00.000Z'))).toBe(false);
  });
});

describe('promoteEventWaitlist', () => {
  test('空席へ受付日時とidの順で先頭だけを繰り上げる', async () => {
    const bookings: Booking[] = [
      { id: 'confirmed', slot_id: 'slot-1', status: 'confirmed', requested_at: '2026-08-01T00:00:00Z' },
      { id: 'wait-2', slot_id: 'slot-1', status: 'waitlisted', requested_at: '2026-08-02T00:00:00Z' },
      { id: 'wait-1', slot_id: 'slot-1', status: 'waitlisted', requested_at: '2026-08-01T01:00:00Z' },
    ];
    const result = await promoteEventWaitlist(
      waitlistDb({
        capacity: 2,
        startsAt: '2026-09-10T10:00:00Z',
        bookings,
      }),
      { slotId: 'slot-1', now: new Date('2026-09-01T00:00:00Z') },
    );

    expect(result.promotedBookingIds).toEqual(['wait-1']);
    expect(bookings.find((booking) => booking.id === 'wait-1')?.status).toBe('confirmed');
    expect(bookings.find((booking) => booking.id === 'wait-2')?.status).toBe('waitlisted');
  });

  test('定員を増やした場合は空席数まで順番に繰り上げる', async () => {
    const bookings: Booking[] = [
      { id: 'confirmed', slot_id: 'slot-1', status: 'confirmed', requested_at: '2026-08-01T00:00:00Z' },
      { id: 'wait-1', slot_id: 'slot-1', status: 'waitlisted', requested_at: '2026-08-02T00:00:00Z' },
      { id: 'wait-2', slot_id: 'slot-1', status: 'waitlisted', requested_at: '2026-08-03T00:00:00Z' },
      { id: 'wait-3', slot_id: 'slot-1', status: 'waitlisted', requested_at: '2026-08-04T00:00:00Z' },
    ];
    const result = await promoteEventWaitlist(
      waitlistDb({ capacity: 3, startsAt: '2026-09-10T10:00:00Z', bookings }),
      { slotId: 'slot-1', now: new Date('2026-09-01T00:00:00Z') },
    );

    expect(result.promotedBookingIds).toEqual(['wait-1', 'wait-2']);
    expect(bookings.find((booking) => booking.id === 'wait-3')?.status).toBe('waitlisted');
  });

  test('48時間の締切後は空席があっても繰り上げない', async () => {
    const bookings: Booking[] = [
      { id: 'wait-1', slot_id: 'slot-1', status: 'waitlisted', requested_at: '2026-08-01T00:00:00Z' },
    ];
    const result = await promoteEventWaitlist(
      waitlistDb({ capacity: 1, startsAt: '2026-09-10T10:00:00Z', bookings }),
      { slotId: 'slot-1', now: new Date('2026-09-08T10:00:00Z') },
    );

    expect(result).toEqual({ promotedBookingIds: [], reason: 'cutoff_passed' });
    expect(bookings[0].status).toBe('waitlisted');
  });
});
