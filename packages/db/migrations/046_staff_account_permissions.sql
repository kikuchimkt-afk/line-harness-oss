-- Staff members can be restricted to one or more LINE accounts.
-- No rows for a non-owner staff member means "legacy unrestricted" so existing
-- installations do not lock current admins out after the migration.

CREATE TABLE IF NOT EXISTS staff_account_permissions (
  staff_id        TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  line_account_id TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  PRIMARY KEY (staff_id, line_account_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_account_permissions_account
  ON staff_account_permissions(line_account_id);
