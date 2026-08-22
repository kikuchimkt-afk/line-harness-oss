import { describe, expect, it } from 'vitest';
import { resolveLineAccountIdForLoginChannel } from './liff-account-resolution.js';

describe('resolveLineAccountIdForLoginChannel', () => {
  const accounts = [
    { id: 'account-bestone', login_channel_id: 'login-bestone' },
    { id: 'account-eiken', login_channel_id: 'login-eiken' },
  ];

  it('verified Login Channel ID に紐づくアカウントだけを返す', () => {
    expect(resolveLineAccountIdForLoginChannel(accounts, 'login-eiken')).toBe('account-eiken');
  });

  it('未登録の Login Channel ID は従来互換用の null を返す', () => {
    expect(resolveLineAccountIdForLoginChannel(accounts, 'login-default')).toBeNull();
  });

  it('検証済み Login Channel ID がない場合は null を返す', () => {
    expect(resolveLineAccountIdForLoginChannel(accounts, null)).toBeNull();
  });
});
