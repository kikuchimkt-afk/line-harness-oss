import { getFriendByLineUserId, getLineAccounts, type Friend } from '@line-crm/db';

/** Customer identity comes from LINE verification, never body friendId. */
export async function resolveFormCallerFriend(
  db: D1Database,
  authorization: string | undefined,
  defaultLoginChannelId?: string,
): Promise<{ friend: Friend | null; authenticated: boolean }> {
  if (!authorization?.startsWith('Bearer ')) return { friend: null, authenticated: false };
  const token = authorization.slice(7).trim();
  if (!token) return { friend: null, authenticated: false };
  const accounts = (await getLineAccounts(db)).filter((account) => account.is_active === 1);
  const candidates = [...new Set([
    ...(defaultLoginChannelId ? [defaultLoginChannelId] : []),
    ...accounts.map((account) => account.login_channel_id).filter((id): id is string => !!id),
  ])];
  for (const channelId of candidates) {
    const account = accounts.find((candidate) => candidate.login_channel_id === channelId);
    if (!account) continue;
    const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: token, client_id: channelId }),
    });
    if (!response.ok) continue;
    const verified = await response.json() as { sub?: string };
    if (!verified.sub) continue;
    return { friend: await getFriendByLineUserId(db, verified.sub, account.id), authenticated: true };
  }
  return { friend: null, authenticated: false };
}
