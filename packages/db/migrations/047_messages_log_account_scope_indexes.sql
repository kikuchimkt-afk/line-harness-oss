-- Speed up account-scoped chat history and inbox queries.
CREATE INDEX IF NOT EXISTS idx_messages_log_account_friend_created
  ON messages_log (line_account_id, friend_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chats_account_friend_created
  ON chats (line_account_id, friend_id, created_at);
