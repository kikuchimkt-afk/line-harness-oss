import { Hono } from 'hono';
import { getTags, createTag, updateTag, deleteTag } from '@line-crm/db';
import type { Tag as DbTag } from '@line-crm/db';
import type { Env } from '../index.js';
import { isBlockTagName } from '../services/friend-block-policy.js';

const tags = new Hono<Env>();
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function serializeTag(row: DbTag) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

// GET /api/tags - list all tags
tags.get('/api/tags', async (c) => {
  try {
    const items = await getTags(c.env.DB);
    return c.json({ success: true, data: items.map(serializeTag) });
  } catch (err) {
    console.error('GET /api/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/tags - create tag
tags.post('/api/tags', async (c) => {
  try {
    const body = await c.req.json<{ name: string; color?: string }>();

    const name = body.name?.trim();
    if (!name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }
    if (body.color && !HEX_COLOR_RE.test(body.color)) {
      return c.json({ success: false, error: 'color must be #RRGGBB' }, 400);
    }

    const tag = await createTag(c.env.DB, {
      name,
      color: body.color,
    });

    return c.json({ success: true, data: serializeTag(tag) }, 201);
  } catch (err) {
    console.error('POST /api/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/tags/:id - update tag
tags.put('/api/tags/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; color?: string }>();
    const updates: { name?: string; color?: string } = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return c.json({ success: false, error: 'name is required' }, 400);
      const current = await c.env.DB.prepare('SELECT name FROM tags WHERE id = ?').bind(id).first<{ name: string }>();
      if (!current) return c.json({ success: false, error: 'Tag not found' }, 404);
      // The name is the authoritative control signal. Renaming in either
      // direction would bypass each friend's explicit block/unblock workflow.
      if ((isBlockTagName(current.name) && name !== current.name) ||
          (!isBlockTagName(current.name) && isBlockTagName(name))) {
        return c.json({ success: false, code: 'BLOCK_TAG_PROTECTED', error: '「ブロック」は機能に連動するタグのため、名前を変更できません。' }, 403);
      }
      updates.name = name;
    }
    if (body.color !== undefined) {
      if (!HEX_COLOR_RE.test(body.color)) {
        return c.json({ success: false, error: 'color must be #RRGGBB' }, 400);
      }
      updates.color = body.color;
    }

    const tag = await updateTag(c.env.DB, id, updates);
    if (!tag) return c.json({ success: false, error: 'Tag not found' }, 404);

    return c.json({ success: true, data: serializeTag(tag) });
  } catch (err) {
    console.error('PUT /api/tags/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/tags/:id - delete tag
tags.delete('/api/tags/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const current = await c.env.DB.prepare('SELECT name FROM tags WHERE id = ?').bind(id).first<{ name: string }>();
    if (isBlockTagName(current?.name)) {
      return c.json({ success: false, code: 'BLOCK_TAG_PROTECTED', error: '「ブロック」タグは削除できません。解除は友だちのプロフィールから行ってください。' }, 403);
    }
    await deleteTag(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/tags/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { tags };
