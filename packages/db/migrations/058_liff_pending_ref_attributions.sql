-- Hold only verified, account-scoped entry-route attribution before follow.
-- Timestamps are Unix milliseconds (UTC), not JST strings. No ID token is kept.
CREATE TABLE IF NOT EXISTS liff_pending_ref_attributions (
  line_account_id TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  entry_route_id TEXT NOT NULL REFERENCES entry_routes(id) ON DELETE CASCADE,
  ref_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  PRIMARY KEY (line_account_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_liff_pending_ref_expiry
  ON liff_pending_ref_attributions(expires_at);
