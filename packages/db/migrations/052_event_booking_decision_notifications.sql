CREATE TABLE IF NOT EXISTS event_booking_decision_notifications (
  id                     TEXT PRIMARY KEY,
  line_account_id        TEXT NOT NULL,
  event_id               TEXT NOT NULL,
  friend_id              TEXT NOT NULL,
  kind                   TEXT NOT NULL CHECK (kind IN ('confirmed','rejected')),
  context_json           TEXT NOT NULL CHECK (json_valid(context_json)),
  scheduled_at           TEXT NOT NULL,
  notification_disabled  INTEGER NOT NULL DEFAULT 0 CHECK (notification_disabled IN (0, 1)),
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','sent','failed','failed_permanent','cancelled')),
  retry_count            INTEGER NOT NULL DEFAULT 0,
  sent_at                TEXT,
  last_error             TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (friend_id) REFERENCES friends(id)
);

CREATE INDEX IF NOT EXISTS idx_event_booking_decision_notifications_due
  ON event_booking_decision_notifications (status, scheduled_at);
