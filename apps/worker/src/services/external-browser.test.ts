import { describe, expect, test } from 'vitest';
import {
  appendOpenExternalBrowser,
  forceExternalBrowserForZoomUrls,
  isZoomUrl,
  prepareMessagesForLine,
} from '@line-crm/line-sdk';
import { autoTrackContent } from './auto-track.js';

describe('Zoom external browser links', () => {
  test('recognizes official Zoom hosts and rejects lookalike domains', () => {
    expect(isZoomUrl('https://us06web.zoom.us/j/83278744178')).toBe(true);
    expect(isZoomUrl('https://events.zoom.com/ev/abc')).toBe(true);
    expect(isZoomUrl('https://agency.zoomgov.com/j/123')).toBe(true);
    expect(isZoomUrl('https://zoom.us.evil.example/j/123')).toBe(false);
    expect(isZoomUrl('https://example.com/?next=https://zoom.us/j/123')).toBe(false);
  });

  test('adds the LINE external-browser parameter without breaking query or fragment', () => {
    expect(appendOpenExternalBrowser('https://us06web.zoom.us/j/123?pwd=abc#join'))
      .toBe('https://us06web.zoom.us/j/123?pwd=abc&openExternalBrowser=1#join');
    expect(appendOpenExternalBrowser('https://zoom.us/j/123?openExternalBrowser=0'))
      .toBe('https://zoom.us/j/123?openExternalBrowser=1');
  });

  test('changes only Zoom URLs in message text', () => {
    const text = [
      '会場: https://us06web.zoom.us/j/123?pwd=abc。',
      '資料: https://example.com/guide',
      '予約: https://liff.line.me/123?page=event',
    ].join('\n');

    expect(forceExternalBrowserForZoomUrls(text)).toBe([
      '会場: https://us06web.zoom.us/j/123?pwd=abc&openExternalBrowser=1。',
      '資料: https://example.com/guide',
      '予約: https://liff.line.me/123?page=event',
    ].join('\n'));
  });

  test('updates Zoom links in text and nested Flex actions', () => {
    const messages = prepareMessagesForLine([
      { type: 'text', text: 'Zoom https://zoom.us/j/123' },
      {
        type: 'flex',
        altText: '参加する',
        contents: {
          type: 'bubble',
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: { type: 'uri', label: 'Zoom', uri: 'https://us02web.zoom.us/j/456' },
              },
              {
                type: 'button',
                action: { type: 'uri', label: '予約', uri: 'https://example.com/book' },
              },
            ],
          },
        },
      },
    ]);

    expect(messages[0]).toEqual({
      type: 'text',
      text: 'Zoom https://zoom.us/j/123?openExternalBrowser=1',
    });
    expect(JSON.stringify(messages[1])).toContain(
      'https://us02web.zoom.us/j/456?openExternalBrowser=1',
    );
    expect(JSON.stringify(messages[1])).toContain('https://example.com/book');
  });

  test('auto tracking keeps Zoom links direct and external', async () => {
    const result = await autoTrackContent(
      {} as D1Database,
      'text',
      '参加URL https://us06web.zoom.us/j/123?pwd=abc',
      'https://worker.example.com',
    );

    expect(result).toEqual({
      messageType: 'text',
      content: '参加URL https://us06web.zoom.us/j/123?pwd=abc&openExternalBrowser=1',
    });
  });
});
