import { Hono } from 'hono';
import type { Env } from '../index.js';

const accountSettings = new Hono<Env>();

const TEST_RECIPIENTS_KEY = 'test_recipients';
const INCOMING_NOTICE_RECIPIENTS_KEY = 'incoming_notice_recipients';

type FriendRecipientRow = {
  id: string;
  display_name: string | null;
  picture_url: string | null;
};

function jstIsoNow(): string {
  return new Date(Date.now() + 9 * 60 * 60_000).toISOString().replace('Z', '+09:00');
}

function parseFriendIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function getFriendRecipients(db: D1Database, accountId: string, key: string) {
  const row = await db
    .prepare(`SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?`)
    .bind(accountId, key)
    .first<{ value: string }>();

  const friendIds = parseFriendIds(row?.value);
  if (friendIds.length === 0) return [];

  const placeholders = friendIds.map(() => '?').join(',');
  const friends = await db
    .prepare(
      `SELECT id, display_name, picture_url
       FROM friends
       WHERE line_account_id = ?
         AND id IN (${placeholders})`,
    )
    .bind(accountId, ...friendIds)
    .all<FriendRecipientRow>();

  const byId = new Map(friends.results.map((f) => [f.id, f]));
  return friendIds
    .map((id) => byId.get(id))
    .filter((f): f is FriendRecipientRow => Boolean(f))
    .map((f) => ({
      id: f.id,
      displayName: f.display_name ?? '名前なし',
      pictureUrl: f.picture_url,
    }));
}

async function saveFriendRecipients(db: D1Database, accountId: string, key: string, friendIds: string[]) {
  const uniqueIds = [...new Set(friendIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const id = crypto.randomUUID();
  const now = jstIsoNow();
  const value = JSON.stringify(uniqueIds);

  await db
    .prepare(
      `INSERT INTO account_settings (id, line_account_id, key, value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (line_account_id, key) DO UPDATE SET value = ?, updated_at = ?`,
    )
    .bind(id, accountId, key, value, now, now, value, now)
    .run();
}

// GET /api/account-settings/test-recipients?accountId=xxx
accountSettings.get('/api/account-settings/test-recipients', async (c) => {
  const accountId = c.req.query('accountId');
  if (!accountId) return c.json({ success: false, error: 'accountId required' }, 400);

  return c.json({ success: true, data: await getFriendRecipients(c.env.DB, accountId, TEST_RECIPIENTS_KEY) });
});

// PUT /api/account-settings/test-recipients
accountSettings.put('/api/account-settings/test-recipients', async (c) => {
  const body = await c.req.json<{ accountId: string; friendIds: string[] }>();
  if (!body.accountId) return c.json({ success: false, error: 'accountId required' }, 400);

  await saveFriendRecipients(c.env.DB, body.accountId, TEST_RECIPIENTS_KEY, body.friendIds ?? []);

  return c.json({ success: true });
});

// GET /api/account-settings/incoming-notice-recipients?accountId=xxx
accountSettings.get('/api/account-settings/incoming-notice-recipients', async (c) => {
  const accountId = c.req.query('accountId');
  if (!accountId) return c.json({ success: false, error: 'accountId required' }, 400);

  return c.json({
    success: true,
    data: await getFriendRecipients(c.env.DB, accountId, INCOMING_NOTICE_RECIPIENTS_KEY),
  });
});

// PUT /api/account-settings/incoming-notice-recipients
accountSettings.put('/api/account-settings/incoming-notice-recipients', async (c) => {
  const body = await c.req.json<{ accountId: string; friendIds: string[] }>();
  if (!body.accountId) return c.json({ success: false, error: 'accountId required' }, 400);

  await saveFriendRecipients(c.env.DB, body.accountId, INCOMING_NOTICE_RECIPIENTS_KEY, body.friendIds ?? []);

  return c.json({ success: true });
});

export { accountSettings };
