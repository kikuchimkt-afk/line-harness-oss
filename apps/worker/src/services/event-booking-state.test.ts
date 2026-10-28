import { describe, expect, test } from 'vitest';
import { canTransition, nextStatus, transitionsFrom, type EventBookingAction } from './event-booking-state.js';

describe('canTransition', () => {
  test('requested → confirmed via confirm', () => {
    expect(canTransition('requested', 'confirm')).toBe(true);
  });
  test('requested → rejected via reject', () => {
    expect(canTransition('requested', 'reject')).toBe(true);
  });
  test('requested → expired via expire', () => {
    expect(canTransition('requested', 'expire')).toBe(true);
  });
  test('requested → cancelled via cancel (admin force)', () => {
    expect(canTransition('requested', 'cancel')).toBe(true);
  });
  test('confirmed → cancelled via cancel', () => {
    expect(canTransition('confirmed', 'cancel')).toBe(true);
  });
  test('confirmed → attended via mark_attended', () => {
    expect(canTransition('confirmed', 'mark_attended')).toBe(true);
  });
  test('confirmed → no_show via mark_no_show', () => {
    expect(canTransition('confirmed', 'mark_no_show')).toBe(true);
  });
  test('rejected is terminal', () => {
    expect(canTransition('rejected', 'confirm')).toBe(false);
    expect(canTransition('rejected', 'cancel')).toBe(false);
  });
  test('expired is terminal', () => {
    expect(canTransition('expired', 'confirm')).toBe(false);
  });
  test('cancelled is terminal', () => {
    expect(canTransition('cancelled', 'confirm')).toBe(false);
    expect(canTransition('cancelled', 'cancel')).toBe(false);
  });
  test('attended can be restored to confirmed after an operator mistake', () => {
    expect(canTransition('attended', 'cancel')).toBe(false);
    expect(canTransition('attended', 'restore_confirmed')).toBe(true);
  });
  test('waitlisted → cancelled / expired', () => {
    expect(canTransition('waitlisted', 'cancel')).toBe(true);
    expect(canTransition('waitlisted', 'expire')).toBe(true);
    expect(canTransition('waitlisted', 'confirm')).toBe(false);
  });
  test('no_show can be restored to confirmed after an operator mistake', () => {
    expect(canTransition('no_show', 'cancel')).toBe(false);
    expect(canTransition('no_show', 'restore_confirmed')).toBe(true);
  });
});

describe('nextStatus', () => {
  test('returns correct next state for valid transition', () => {
    expect(nextStatus('requested', 'confirm')).toBe('confirmed');
    expect(nextStatus('requested', 'reject')).toBe('rejected');
    expect(nextStatus('waitlisted', 'cancel')).toBe('cancelled');
    expect(nextStatus('waitlisted', 'expire')).toBe('expired');
    expect(nextStatus('confirmed', 'cancel')).toBe('cancelled');
    expect(nextStatus('confirmed', 'mark_attended')).toBe('attended');
    expect(nextStatus('confirmed', 'mark_no_show')).toBe('no_show');
    expect(nextStatus('attended', 'restore_confirmed')).toBe('confirmed');
    expect(nextStatus('no_show', 'restore_confirmed')).toBe('confirmed');
  });
  test('throws for invalid transition', () => {
    expect(() => nextStatus('rejected', 'confirm')).toThrow(/Invalid transition/);
    expect(() => nextStatus('cancelled', 'cancel')).toThrow(/Invalid transition/);
  });
});

describe('transitionsFrom', () => {
  test('requested allows confirm / reject / expire / cancel', () => {
    const actions: EventBookingAction[] = transitionsFrom('requested');
    expect(actions.sort()).toEqual(['cancel', 'confirm', 'expire', 'reject']);
  });
  test('confirmed allows cancel / mark_attended / mark_no_show', () => {
    const actions = transitionsFrom('confirmed');
    expect(actions.sort()).toEqual(['cancel', 'mark_attended', 'mark_no_show']);
  });
  test('non-correctable terminal states return empty array', () => {
    expect(transitionsFrom('rejected')).toEqual([]);
    expect(transitionsFrom('expired')).toEqual([]);
    expect(transitionsFrom('cancelled')).toEqual([]);
  });
  test('waitlisted allows cancel / expire', () => {
    expect(transitionsFrom('waitlisted').sort()).toEqual(['cancel', 'expire']);
  });
  test('attendance states allow restoring confirmed', () => {
    expect(transitionsFrom('attended')).toEqual(['restore_confirmed']);
    expect(transitionsFrom('no_show')).toEqual(['restore_confirmed']);
  });
});
