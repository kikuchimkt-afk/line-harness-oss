-- Durable desired-state queue for per-friend rich-menu assignments.
-- One row per friend prevents older campaign tags from winning during retries.

CREATE TABLE IF NOT EXISTS rich_menu_assignments (
  friend_id            TEXT PRIMARY KEY REFERENCES friends (id) ON DELETE CASCADE,
  line_account_id      TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  automation_id        TEXT REFERENCES automations (id) ON DELETE SET NULL,
  desired_rich_menu_id TEXT NOT NULL,
  source               TEXT NOT NULL DEFAULT 'automation'
                       CHECK (source IN ('automation', 'manual', 'backfill')),
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'retry_wait', 'processing', 'applied', 'failed_permanent')),
  retry_count          INTEGER NOT NULL DEFAULT 0,
  max_retries          INTEGER NOT NULL DEFAULT 5,
  next_attempt_at      TEXT,
  last_attempt_at      TEXT,
  applied_at           TEXT,
  verified_at          TEXT,
  last_error           TEXT,
  generation           INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_rich_menu_assignments_due
  ON rich_menu_assignments (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_rich_menu_assignments_account_status
  ON rich_menu_assignments (line_account_id, status);

CREATE INDEX IF NOT EXISTS idx_rich_menu_assignments_verify
  ON rich_menu_assignments (status, verified_at);

CREATE INDEX IF NOT EXISTS idx_rich_menu_assignments_automation
  ON rich_menu_assignments (automation_id, status);
