import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { buildSegmentQuery } from './segment-query.js';

// Vite cannot resolve the `node:sqlite` builtin, so load it at runtime.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

// Real SQLite so operator precedence is evaluated, not just string-matched.
function seed() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE friends (id TEXT, line_user_id TEXT, line_account_id TEXT, is_following INTEGER, metadata TEXT, ref_code TEXT, created_at TEXT);
    CREATE TABLE friend_tags (friend_id TEXT, tag_id TEXT);
    INSERT INTO friends VALUES
      ('a-tagged', 'U1', 'acc-a', 1, '{}', NULL, '1'),
      ('a-plain',  'U2', 'acc-a', 1, '{}', NULL, '2'),
      ('b-tagged', 'U3', 'acc-b', 1, '{}', NULL, '3'),
      ('b-ref',    'U4', 'acc-b', 1, '{}', 'flyer', '4');
    INSERT INTO friend_tags VALUES ('a-tagged', 'tag-1'), ('b-tagged', 'tag-1');
  `);
  return db;
}

describe('buildSegmentQuery account containment', () => {
  it('keeps an OR segment inside the sending account once the caller prepends it', () => {
    const { sql, bindings } = buildSegmentQuery({
      operator: 'OR',
      rules: [{ type: 'tag_exists', value: 'tag-1' }, { type: 'ref_code', value: 'flyer' }],
    });
    // Same prefixing the broadcast / segment-send callers do.
    const scoped = sql.replace('WHERE', 'WHERE f.line_account_id = ? AND');
    const rows = seed().prepare(scoped).all('acc-a', ...(bindings as string[])) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['a-tagged']);
  });

  it('still matches every rule of an OR segment within the account', () => {
    const { sql, bindings } = buildSegmentQuery({
      operator: 'OR',
      rules: [{ type: 'tag_exists', value: 'tag-1' }, { type: 'ref_code', value: 'flyer' }],
    });
    const scoped = sql.replace('WHERE', 'WHERE f.line_account_id = ? AND');
    const rows = seed().prepare(scoped).all('acc-b', ...(bindings as string[])) as Array<{ id: string }>;
    expect(rows.map((r) => r.id).sort()).toEqual(['b-ref', 'b-tagged']);
  });
});
