import { getLineAccountById, type Broadcast } from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';

export class BroadcastSenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BroadcastSenderError';
  }
}

/**
 * Resolve the LINE client a broadcast must be sent from. Fails closed: an
 * unknown, inactive or token-less sender never falls back to the default
 * channel token, which belongs to a different official account.
 * A NULL sender is supported only by the original, account-less installation.
 * (Backport of upstream 1c23b50.)
 */
export async function resolveBroadcastSender(
  db: D1Database,
  broadcast: Pick<Broadcast, 'id' | 'target_type'> & { line_account_id?: string | null },
  defaultClient: LineClient,
): Promise<LineClient> {
  // Dedup resolves and validates each selected sender inside its own executor.
  if ((broadcast.target_type as string) === 'multi-account-dedup') return defaultClient;
  let failure: BroadcastSenderError;
  try {
    if (broadcast.line_account_id != null) {
      const account = await getLineAccountById(db, broadcast.line_account_id);
      if (account && account.is_active === 1 && account.channel_access_token?.trim()) {
        return new LineClient(account.channel_access_token);
      }
      failure = new BroadcastSenderError('送信元アカウントが見つからないか、無効・未設定です。アカウント設定を確認してください。');
    } else {
      const registered = await db.prepare('SELECT id FROM line_accounts LIMIT 1').first<{ id: string }>();
      if (!registered) return defaultClient;
      failure = new BroadcastSenderError('送信元が未指定のため停止しました。送信元と配信状況を確認してください。');
    }
  } catch {
    failure = new BroadcastSenderError('送信元情報を確認できないため、配信を停止しました。時間をおいて確認してください。');
  }
  console.error(`[broadcast-sender] ${broadcast.id}: ${failure.message}`);
  throw failure;
}
