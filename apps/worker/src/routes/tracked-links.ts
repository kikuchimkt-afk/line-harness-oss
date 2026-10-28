import { Hono } from 'hono';
import {
  getTrackedLinks,
  getTrackedLinkById,
  createTrackedLink,
  updateTrackedLink,
  deleteTrackedLink,
  recordLinkClick,
  getLinkClicks,
  getFriendByLineUserId,
} from '@line-crm/db';
import { enrollFriendInScenario } from '@line-crm/db';
import type { TrackedLink } from '@line-crm/db';
import type { Env } from '../index.js';
import { attachTagAndFireSideEffects } from '../services/friend-tag-attach.js';
import { isFriendBlocked } from '../services/friend-block-policy.js';

const trackedLinks = new Hono<Env>();

function isHttpDestination(value: unknown): value is string {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function serializeTrackedLink(row: TrackedLink, baseUrl: string) {
  const trackingUrl = `${baseUrl}/t/${row.id}`;
  return {
    id: row.id,
    name: row.name,
    originalUrl: row.original_url,
    trackingUrl,
    tagId: row.tag_id,
    scenarioId: row.scenario_id,
    introTemplateId: row.intro_template_id,
    rewardTemplateId: row.reward_template_id,
    isActive: Boolean(row.is_active),
    clickCount: row.click_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getBaseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// GET /api/tracked-links — list all
trackedLinks.get('/api/tracked-links', async (c) => {
  try {
    const items = await getTrackedLinks(c.env.DB);
    const base = getBaseUrl(c);
    return c.json({ success: true, data: items.map((item) => serializeTrackedLink(item, base)) });
  } catch (err) {
    console.error('GET /api/tracked-links error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/tracked-links/:id — get single with click details
trackedLinks.get('/api/tracked-links/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const link = await getTrackedLinkById(c.env.DB, id);
    if (!link) {
      return c.json({ success: false, error: 'Tracked link not found' }, 404);
    }
    const clicks = await getLinkClicks(c.env.DB, id);
    const base = getBaseUrl(c);
    return c.json({
      success: true,
      data: {
        ...serializeTrackedLink(link, base),
        clicks: clicks.map((click) => ({
          id: click.id,
          friendId: click.friend_id,
          friendDisplayName: click.friend_display_name,
          clickedAt: click.clicked_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/tracked-links — create
trackedLinks.post('/api/tracked-links', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      originalUrl: string;
      tagId?: string | null;
      scenarioId?: string | null;
      introTemplateId?: string | null;
      rewardTemplateId?: string | null;
    }>();

    if (!body || typeof body.name !== 'string' || !body.name.trim() || !body.originalUrl) {
      return c.json({ success: false, error: 'name and originalUrl are required' }, 400);
    }
    if (!isHttpDestination(body.originalUrl)) {
      return c.json({ success: false, error: 'originalUrl must be a valid http or https URL' }, 400);
    }

    const link = await createTrackedLink(c.env.DB, {
      name: body.name,
      originalUrl: body.originalUrl,
      tagId: body.tagId ?? null,
      scenarioId: body.scenarioId ?? null,
      introTemplateId: body.introTemplateId ?? null,
      rewardTemplateId: body.rewardTemplateId ?? null,
    });

    const base = getBaseUrl(c);
    return c.json({ success: true, data: serializeTrackedLink(link, base) }, 201);
  } catch (err) {
    console.error('POST /api/tracked-links error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/tracked-links/:id — update mutable fields
trackedLinks.patch('/api/tracked-links/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      tagId?: string | null;
      scenarioId?: string | null;
      introTemplateId?: string | null;
      rewardTemplateId?: string | null;
      isActive?: boolean;
    }>();

    const link = await updateTrackedLink(c.env.DB, id, body);
    if (!link) {
      return c.json({ success: false, error: 'Tracked link not found' }, 404);
    }
    const base = getBaseUrl(c);
    return c.json({ success: true, data: serializeTrackedLink(link, base) });
  } catch (err) {
    console.error('PATCH /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/tracked-links/:id
trackedLinks.delete('/api/tracked-links/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const link = await getTrackedLinkById(c.env.DB, id);
    if (!link) {
      return c.json({ success: false, error: 'Tracked link not found' }, 404);
    }
    await deleteTrackedLink(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Domains where Universal Links should be used (JS redirect instead of 302)
const APP_LINK_DOMAINS = new Set([
  'x.com',
  'twitter.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'facebook.com',
  'github.com',
]);

function isAppLinkDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return APP_LINK_DOMAINS.has(hostname);
  } catch {
    return false;
  }
}

// Android app package names for intent:// deep links
const ANDROID_PACKAGES: Record<string, string> = {
  'x.com': 'com.twitter.android',
  'twitter.com': 'com.twitter.android',
  'instagram.com': 'com.instagram.android',
  'youtube.com': 'com.google.android.youtube',
  'youtu.be': 'com.google.android.youtube',
  'tiktok.com': 'com.zhiliaoapp.musically',
  'facebook.com': 'com.facebook.katana',
  'github.com': 'com.github.android',
};

function getAndroidPackage(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return ANDROID_PACKAGES[hostname] ?? null;
  } catch {
    return null;
  }
}

function serializeInlineScriptString(value: string): string {
  // JSON escapes JS string delimiters, but HTML still recognizes </script>
  // inside a string. Escape '<' before embedding JSON in a script element.
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildAppRedirectHtml(destinationUrl: string): string {
  const destinationJson = serializeInlineScriptString(destinationUrl);
  const destinationAttribute = destinationUrl
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const androidPackage = getAndroidPackage(destinationUrl);
  // intent://path#Intent;scheme=https;package=com.xxx;S.browser_fallback_url=https://...;end
  const intentUrl = androidPackage
    ? `intent://${destinationUrl.replace(/^https?:\/\//i, '')}#Intent;scheme=https;package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(destinationUrl)};end`
    : null;
  const intentJson = serializeInlineScriptString(intentUrl ?? '');

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redirecting...</title>
<style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;color:#64748b;background:#f8fafc}p{font-size:14px}</style>
</head><body>
<p>Opening app...</p>
<script>
(function(){
  var isAndroid = /Android/i.test(navigator.userAgent);
  if(isAndroid && ${intentJson}){
    window.location.href=${intentJson};
  } else {
    window.location.href=${destinationJson};
  }
})();
</script>
<noscript><meta http-equiv="refresh" content="0;url=${destinationAttribute}"></noscript>
</body></html>`;
}

// GET /t/:linkId — click tracking redirect (no auth, fast redirect)
trackedLinks.get('/t/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const lineUserId = c.req.query('lu') ?? null;
  let friendId = c.req.query('f') ?? null;

  // Look up the link first
  const link = await getTrackedLinkById(c.env.DB, linkId);

  if (!link || !link.is_active) {
    return c.json({ success: false, error: 'Link not found' }, 404);
  }
  // Also protect legacy and automatically created records. An allowed app
  // hostname does not make a javascript: (or other non-web) URL safe to open.
  if (!isHttpDestination(link.original_url)) {
    return c.json({ success: false, error: 'Invalid link destination' }, 400);
  }

  const useAppRedirect = isAppLinkDomain(link.original_url);

  // If no user ID yet, check if this is LINE's in-app browser → redirect to LIFF for identification
  // Skip LIFF redirect for app-link domains (they'll come from Safari via externalBrowser)
  const ua = c.req.header('user-agent') || '';
  const isLineApp = /\bLine\b/i.test(ua);
  if (!useAppRedirect && !lineUserId && !friendId && isLineApp && c.env.LIFF_URL) {
    const directUrl = `${c.env.WORKER_URL || new URL(c.req.url).origin}/t/${linkId}`;
    const liffRedirect = `${c.env.LIFF_URL}?redirect=${encodeURIComponent(directUrl)}`;
    return c.redirect(liffRedirect, 302);
  }

  // Resolve friendId from LINE user ID if provided
  if (!friendId && lineUserId) {
    const friend = await getFriendByLineUserId(c.env.DB, lineUserId);
    if (friend) {
      friendId = friend.id;
    }
  }

  // Run side-effects async (click recording, tag/scenario actions)
  const ctx = c.executionCtx as ExecutionContext;
  ctx.waitUntil(
    (async () => {
      try {
        if (friendId && await isFriendBlocked(c.env.DB, friendId)) return;
        // Record the click
        await recordLinkClick(c.env.DB, linkId, friendId);

        // Run automatic actions if a friend is identified
        if (friendId) {
          if (link.tag_id) {
            await attachTagAndFireSideEffects(c.env.DB, friendId, link.tag_id);
          }
          if (link.scenario_id && !(await isFriendBlocked(c.env.DB, friendId))) {
            await enrollFriendInScenario(c.env.DB, friendId, link.scenario_id);
          }
        }
      } catch (err) {
        console.error(`/t/${linkId} async tracking error:`, err);
      }
    })(),
  );

  // App-link domains: return HTML with JS redirect for Universal Link support
  if (useAppRedirect) {
    return c.html(buildAppRedirectHtml(link.original_url));
  }

  return c.redirect(link.original_url, 302);
});

export { trackedLinks };
