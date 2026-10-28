import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendByLineUserId: vi.fn(),
  getLineAccountById: vi.fn(),
  getStripeEvents: vi.fn(),
  getStripeEventByStripeId: vi.fn(),
  createStripeEvent: vi.fn(),
  jstNow: vi.fn(() => '2026-10-28T12:00:00.000+09:00'),
}));
vi.mock('@line-crm/db', () => dbMocks);

const { meetCallback } = await import('./meet-callback.js');
const { stripe } = await import('./stripe.js');

const SECRET = 'whsec_test_secret';
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function sign(body: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

const meetBody = JSON.stringify({
  session_id: 's1', scenario_id: 'sc1', line_user_id: 'U-target', status: 'completed',
  transcripts: [{ question_text: 'Q', transcript: 'injected text' }], completed_at: '2026-10-28',
});
const stripeBody = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } });

function postMeet(env: Record<string, unknown>, headers: Record<string, string> = {}, body = meetBody) {
  return meetCallback.request('https://worker.example.com/api/meet-callback', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
  }, { DB: {}, ...env }, ctx);
}

function postStripe(env: Record<string, unknown>, headers: Record<string, string> = {}, body = stripeBody) {
  return stripe.request('https://worker.example.com/api/integrations/stripe/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
  }, { DB: {}, ...env }, ctx);
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/meet-callback', () => {
  it.each([undefined, '', '   '])('is disabled (503) when MEET_CALLBACK_SECRET is %j', async (secret) => {
    const res = await postMeet({ MEET_CALLBACK_SECRET: secret });
    expect(res.status).toBe(503);
    expect(dbMocks.getFriendByLineUserId).not.toHaveBeenCalled();
  });

  it('rejects a missing, forged, tampered or stale signature without touching the DB', async () => {
    const env = { MEET_CALLBACK_SECRET: SECRET };
    const stale = await sign(meetBody, SECRET, Math.floor(Date.now() / 1000) - 301);
    const forged = await sign(meetBody, 'other-secret');
    const tampered = await sign(meetBody.replace('injected', 'original'));
    for (const header of [undefined, forged, tampered, stale, 't=1,v1=zz']) {
      const res = await postMeet(env, header ? { 'X-Meet-Signature': header } : {});
      expect(res.status).toBe(401);
    }
    expect(dbMocks.getFriendByLineUserId).not.toHaveBeenCalled();
  });

  it('accepts a valid signature and validates the payload shape', async () => {
    const bad = JSON.stringify({ line_user_id: 'U-target', transcripts: 'nope' });
    const res = await postMeet({ MEET_CALLBACK_SECRET: SECRET }, { 'X-Meet-Signature': await sign(bad) }, bad);
    expect(res.status).toBe(400);
    expect(dbMocks.getFriendByLineUserId).not.toHaveBeenCalled();
  });

  it('does not fall back to the default token when the friend account has none', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue({ id: 'f1', line_account_id: 'acc-1' });
    dbMocks.getLineAccountById.mockResolvedValue(null);
    const db = { prepare: () => { const s = { bind: () => s, all: async () => ({ results: [] }) }; return s; } };
    const res = await postMeet(
      { MEET_CALLBACK_SECRET: SECRET, DB: db, LINE_CHANNEL_ACCESS_TOKEN: 'default-token' },
      { 'X-Meet-Signature': await sign(meetBody) },
    );
    expect(res.status).toBe(503);
  });
});

describe('POST /api/integrations/stripe/webhook', () => {
  it('is disabled (503) when STRIPE_WEBHOOK_SECRET is unset instead of skipping verification', async () => {
    const res = await postStripe({});
    expect(res.status).toBe(503);
    expect(dbMocks.createStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature', async () => {
    const res = await postStripe({ STRIPE_WEBHOOK_SECRET: SECRET }, { 'Stripe-Signature': await sign(stripeBody, 'other') });
    expect(res.status).toBe(401);
    expect(dbMocks.getStripeEventByStripeId).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed event (including during key rotation)', async () => {
    dbMocks.getStripeEventByStripeId.mockResolvedValue({ id: 'already' });
    const rotated = `${await sign(stripeBody, 'old-secret')},v1=${(await sign(stripeBody)).split('v1=')[1]}`;
    const res = await postStripe({ STRIPE_WEBHOOK_SECRET: SECRET }, { 'Stripe-Signature': rotated });
    expect(res.status).toBe(200);
    expect(dbMocks.getStripeEventByStripeId).toHaveBeenCalledWith({}, 'evt_1');
  });

  it('rejects a signed but malformed event', async () => {
    const bad = JSON.stringify({ id: 'evt_2', type: 'x', data: {} });
    const res = await postStripe({ STRIPE_WEBHOOK_SECRET: SECRET }, { 'Stripe-Signature': await sign(bad) }, bad);
    expect(res.status).toBe(400);
  });
});
