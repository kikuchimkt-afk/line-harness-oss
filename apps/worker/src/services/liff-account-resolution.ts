import type { LineAccount } from '@line-crm/db';

type LoginScopedAccount = Pick<LineAccount, 'id' | 'login_channel_id'>;

/**
 * Resolve the LINE account that issued a verified LIFF ID token.
 *
 * A LINE user ID is shared across Official Accounts under the same provider,
 * so it is not sufficient to select a friends row by line_user_id alone.
 * The ID token audience (Login Channel ID) pins the request to the Official
 * Account configured for that Login Channel.
 */
export function resolveLineAccountIdForLoginChannel(
  accounts: LoginScopedAccount[],
  verifiedLoginChannelId: string | null,
): string | null {
  if (!verifiedLoginChannelId) return null;
  return accounts.find((account) => account.login_channel_id === verifiedLoginChannelId)?.id ?? null;
}
