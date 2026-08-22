import { describe, expect, it } from 'vitest';
import { buildDirectFormUrl } from './direct-form-url.js';

describe('buildDirectFormUrl', () => {
  it('申込導線をフォームページへ変換し、LIFF・流入情報を保持する', () => {
    const result = buildDirectFormUrl(
      'https://example.com/?liffId=2011208604-KwiGeUqO&form=form-1&ref=eiken-intensive-application',
      'form-1',
    );
    const url = new URL(result);

    expect(url.searchParams.get('form')).toBeNull();
    expect(url.searchParams.get('page')).toBe('form');
    expect(url.searchParams.get('id')).toBe('form-1');
    expect(url.searchParams.get('liffId')).toBe('2011208604-KwiGeUqO');
    expect(url.searchParams.get('ref')).toBe('eiken-intensive-application');
  });
});
