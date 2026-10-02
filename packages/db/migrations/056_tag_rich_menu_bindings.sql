-- Migration 056: Persist account-scoped tag to rich-menu display bindings.
-- A friend can have only one rich menu linked at a time, so each tag resolves
-- to at most one rich-menu group within a LINE account.

CREATE TABLE IF NOT EXISTS tag_rich_menu_bindings (
  account_id         TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  tag_id             TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  rich_menu_group_id TEXT NOT NULL REFERENCES rich_menu_groups(id) ON DELETE CASCADE,
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  PRIMARY KEY (account_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_rich_menu_bindings_group
  ON tag_rich_menu_bindings (rich_menu_group_id);

CREATE INDEX IF NOT EXISTS idx_tag_rich_menu_bindings_active
  ON tag_rich_menu_bindings (account_id, is_active, tag_id);
