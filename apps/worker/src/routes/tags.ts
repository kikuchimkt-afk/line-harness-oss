import { Hono } from 'hono';
import { getTags, createTag, updateTag, deleteTag } from '@line-crm/db';
import type { Tag as DbTag } from '@line-crm/db';
import type { Env } from '../index.js';

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
    await deleteTag(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/tags/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { tags };
