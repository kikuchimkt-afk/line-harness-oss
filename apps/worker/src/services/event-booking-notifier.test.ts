import { describe, expect, test } from 'vitest';
import { renderEventNotificationText } from './event-booking-notifier.js';

const baseCtx = {
  eventName: 'AAA説明会',
  startsAtJst: '2026-06-01 10:00',
  venueName: '渋谷ベース',
  venueUrl: 'https://maps.example/x',
};

describe('renderEventNotificationText', () => {
  test('受付（承認待ち）', () => {
    const text = renderEventNotificationText('received_pending', baseCtx);
    expect(text).toContain('イベント申込みを受け付けました');
    expect(text).toContain('AAA説明会');
    expect(text).toContain('2026-06-01 10:00');
    expect(text).toContain('運営の承認をお待ちください');
    expect(text).toContain('渋谷ベース');
  });

  test('受付（即時確定）', () => {
    const text = renderEventNotificationText('received_confirmed', baseCtx);
    expect(text).toContain('予約が確定しました');
    expect(text).toContain('変更・キャンセルは予約履歴画面');
  });

  test('キャンセル待ち受付は順位と48時間期限を案内する', () => {
    const text = renderEventNotificationText('waitlisted', {
      ...baseCtx,
      waitlistPosition: 2,
      cancelDeadlineHoursBefore: 48,
    });
    expect(text).toContain('キャンセル待ちを受け付けました');
    expect(text).toContain('現在の順番: 2番目');
    expect(text).toContain('開始48時間前まで');
    expect(text).toContain('受付順に本予約へ自動で繰り上がります');
  });

  test('自動繰り上げは本予約確定とキャンセル期限を案内する', () => {
    const text = renderEventNotificationText('waitlist_promoted', {
      ...baseCtx,
      cancelDeadlineHoursBefore: 48,
    });
    expect(text).toContain('本予約へ繰り上がりました');
    expect(text).toContain('この予約は確定しています');
    expect(text).toContain('キャンセルは開始48時間前まで');
  });

  test('受付メッセージに予約履歴URLを含められる', () => {
    const text = renderEventNotificationText('received_confirmed', {
      ...baseCtx,
      bookingHistoryUrl: 'https://liff.line.me/2000000000-abc?page=event-me',
    });
    expect(text).toContain('予約履歴はこちら');
    expect(text).toContain('https://liff.line.me/2000000000-abc?page=event-me');
    expect(text).not.toContain('面談予約はこちら');
  });

  test('複数日程は1通の中でまとめて表示できる', () => {
    const text = renderEventNotificationText('received_pending', {
      ...baseCtx,
      startsAtJstList: ['2026-06-01 10:00', '2026-06-02 10:00'],
      bookingHistoryUrl: 'https://liff.line.me/2000000000-abc?page=event-me',
    });
    expect(text).toContain('日時:\n・2026-06-01 10:00\n・2026-06-02 10:00');
    expect(text).toContain('予約履歴はこちら');
  });

  test('後追い承認確定', () => {
    const text = renderEventNotificationText('confirmed', baseCtx);
    expect(text).toContain('予約が確定しました');
  });

  test('後追い承認時に運営コメントとURLを追加できる', () => {
    const text = renderEventNotificationText('confirmed', {
      ...baseCtx,
      approvalComment: '事前にこちらをご確認ください。\nhttps://example.com/preparation',
    });
    expect(text).toContain('運営からのご案内:');
    expect(text).toContain('事前にこちらをご確認ください。');
    expect(text).toContain('https://example.com/preparation');
    expect(text.indexOf('運営からのご案内:')).toBeLessThan(
      text.indexOf('変更・キャンセルは予約履歴画面'),
    );
  });

  test('受付時は承認コメントを表示しない', () => {
    const text = renderEventNotificationText('received_pending', {
      ...baseCtx,
      approvalComment: '承認後だけ表示するコメント',
    });
    expect(text).not.toContain('承認後だけ表示するコメント');
  });

  test('拒否は固定文面（reason は含まない）', () => {
    const text = renderEventNotificationText('rejected', baseCtx);
    expect(text).toContain('お受けできませんでした');
    expect(text).not.toContain('reason');
  });

  test('運営キャンセル', () => {
    const text = renderEventNotificationText('cancelled_by_admin', baseCtx);
    expect(text).toContain('運営側でイベント予約をキャンセル');
    expect(text).toContain('LINE にてご連絡');
  });

  test('前日リマインダ', () => {
    const text = renderEventNotificationText('reminder_day_before', baseCtx);
    expect(text).toContain('明日イベントが開催');
  });

  test('開始 N 時間前リマインダ', () => {
    const text = renderEventNotificationText('reminder_hours_before', {
      ...baseCtx,
      hoursBefore: 2,
    });
    expect(text).toContain('まもなくイベント開始');
    expect(text).toContain('あと 2 時間');
  });

  test('venue が無くてもクラッシュしない', () => {
    const text = renderEventNotificationText('received_pending', {
      eventName: 'X',
      startsAtJst: '2026-06-01 10:00',
    });
    expect(text).toContain('X');
    expect(text).not.toContain('会場:');
  });

  test('venue_url のみ無ければ URL 行が出ない', () => {
    const text = renderEventNotificationText('confirmed', {
      eventName: 'X',
      startsAtJst: '2026-06-01 10:00',
      venueName: '渋谷',
    });
    expect(text).toContain('会場: 渋谷');
    expect(text).not.toContain('https://');
  });
});
