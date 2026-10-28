import { describe, expect, it, vi } from 'vitest';
import { normalizeExternalHttpsUrl, openWithLiffExternal } from './external-browser.js';

describe('normalizeExternalHttpsUrl', () => {
  it('accepts and normalizes a fully-qualified HTTPS URL', () => {
    expect(normalizeExternalHttpsUrl(' https://example.com/lesson?q=1 '))
      .toBe('https://example.com/lesson?q=1');
  });

  it.each([
    'http://example.com/lesson',
    'javascript:alert(1)',
    '/lesson',
    'not a url',
    '',
  ])('rejects an unsafe or incomplete URL: %s', (url) => {
    expect(normalizeExternalHttpsUrl(url)).toBeNull();
  });
});

describe('openWithLiffExternal', () => {
  it('asks LIFF to use the external browser inside LINE', () => {
    const openWindow = vi.fn();
    const opened = openWithLiffExternal('https://example.com/lesson', {
      isInClient: () => true,
      openWindow,
    });

    expect(opened).toBe(true);
    expect(openWindow).toHaveBeenCalledWith({
      url: 'https://example.com/lesson',
      external: true,
    });
  });

  it('lets the anchor handle navigation outside LINE', () => {
    const openWindow = vi.fn();
    const opened = openWithLiffExternal('https://example.com/lesson', {
      isInClient: () => false,
      openWindow,
    });

    expect(opened).toBe(false);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('falls back to the anchor when LIFF throws', () => {
    const opened = openWithLiffExternal('https://example.com/lesson', {
      isInClient: () => true,
      openWindow: () => { throw new Error('unavailable'); },
    });

    expect(opened).toBe(false);
  });
});
