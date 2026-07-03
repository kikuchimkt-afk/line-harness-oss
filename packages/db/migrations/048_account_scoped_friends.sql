-- Allow the same LINE user to exist independently in multiple official accounts.
-- Older schema had UNIQUE(line_user_id), which caused webhook/LIFF activity on
-- one account to move the friend record away from another account.

PRAGMA foreign_keys = OFF;

CREATE TABLE friends_new (
  id                    TEXT PRIMARY KEY,
  line_user_id          TEXT NOT NULL,
  display_name          TEXT,
  picture_url           TEXT,
  status_message        TEXT,
  is_following          INTEGER NOT NULL DEFAULT 1,
  user_id               TEXT,
  ig_igsid              TEXT,
  score                 INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  ref_code              TEXT,
  metadata              TEXT NOT NULL DEFAULT '{}',
  line_account_id       TEXT REFERENCES line_accounts(id),
  first_tracked_link_id TEXT REFERENCES tracked_links (id) ON DELETE SET NULL,
  UNIQUE(line_account_id, line_user_id)
);

INSERT INTO friends_new (
  id,
  line_user_id,
  display_name,
  picture_url,
  status_message,
  is_following,
  user_id,
  ig_igsid,
  score,
  created_at,
  updated_at,
  ref_code,
  metadata,
  line_account_id,
  first_tracked_link_id
)
SELECT
  id,
  line_user_id,
  display_name,
  picture_url,
  status_message,
  is_following,
  user_id,
  ig_igsid,
  score,
  created_at,
  updated_at,
  ref_code,
  metadata,
  line_account_id,
  first_tracked_link_id
FROM friends;

DROP TABLE friends;
ALTER TABLE friends_new RENAME TO friends;

CREATE INDEX IF NOT EXISTS idx_friends_ig_igsid ON friends (ig_igsid);
CREATE INDEX IF NOT EXISTS idx_friends_line_user_id ON friends (line_user_id);
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends (user_id);
CREATE INDEX IF NOT EXISTS idx_friends_account_line_user_id ON friends (line_account_id, line_user_id);

PRAGMA foreign_keys = ON;
