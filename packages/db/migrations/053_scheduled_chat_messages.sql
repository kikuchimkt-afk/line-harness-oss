CREATE TABLE IF NOT EXISTS scheduled_chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  line_account_id TEXT,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'flex')),
  content TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  notification_disabled INTEGER NOT NULL DEFAULT 0 CHECK (notification_disabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'failed_permanent', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE CASCADE,
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_chat_messages_due
  ON scheduled_chat_messages(status, scheduled_at);
