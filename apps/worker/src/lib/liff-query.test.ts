import { describe, expect, it } from 'vitest';
import { createLiffQueryReader } from './liff-query.js';

const reader = (query: Record<string, string>) => createLiffQueryReader((key) => query[key]);

describe('createLiffQueryReader', () => {
  it('recovers parameters that LIFF moved into liff.state', () => {
    const q = reader({ 'liff.state': '/?ref=winter-flyer&utm_campaign=冬期講習2026#top' });
    expect(q('ref')).toBe('winter-flyer');
    expect(q('utm_campaign')).toBe('冬期講習2026');
    expect(q('missing')).toBe('');
  });

  it('prefers an explicit direct value, even an empty one', () => {
    expect(reader({ ref: 'direct', 'liff.state': '?ref=state' })('ref')).toBe('direct');
    expect(reader({ ref: '', 'liff.state': '?ref=state' })('ref')).toBe('');
  });

  it('ignores the fragment and absolute or protocol-relative state values', () => {
    expect(reader({ 'liff.state': '/page#?ref=hidden' })('ref')).toBe('');
    expect(reader({ 'liff.state': 'https://evil.example/?ref=x' })('ref')).toBe('');
    expect(reader({ 'liff.state': '//evil.example/?ref=x' })('ref')).toBe('');
  });
});
