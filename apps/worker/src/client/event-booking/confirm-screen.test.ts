import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmScreen, type EventBookingContext } from './main.js';

describe('event booking confirmation identity', () => {
  it('shows only the LINE profile display name and never exposes internal identifiers', () => {
    const lineUserId = 'U_INTERNAL_LINE_USER_ID';
    const idToken = 'INTERNAL_ID_TOKEN';
    const friendUuid = '00000000-1111-2222-3333-444444444444';
    const ctx: EventBookingContext & { friendUuid: string } = {
      liffId: '2000000000-test',
      lineUserId,
      idToken,
      displayName: '山田 花子',
      friendUuid,
    };

    const html = renderToStaticMarkup(createElement(ConfirmScreen, {
      ctx,
      event: {
        id: 'event-1',
        name: '小学生英語プレゼン練習レッスン',
        venue_name: 'ECCジュニア藍住教室',
        venue_url: null,
        detail_url: null,
        image_url: null,
        description: null,
        description_centered: 0,
        max_bookings_per_friend: null,
        requires_approval: 1,
        waitlist_enabled: 1,
        cancel_deadline_hours_before: null,
        booking_form_fields: [],
      },
      slots: [{
        id: 'slot-1',
        event_id: 'event-1',
        starts_at: '2026-09-26T13:00:00+09:00',
        ends_at: '2026-09-26T14:00:00+09:00',
        capacity: 5,
        is_active: 1,
        active_count: 0,
        remaining: 5,
      }],
      initialAnswers: {},
      onBack: vi.fn(),
      onDone: vi.fn(),
    }));

    expect(html).toContain('LINE表示名');
    expect(html).toContain('山田 花子');
    expect(html.indexOf('LINE表示名')).toBeLessThan(html.indexOf('予約をリクエスト'));
    expect(html).not.toContain(lineUserId);
    expect(html).not.toContain(idToken);
    expect(html).not.toContain(friendUuid);
  });
});
