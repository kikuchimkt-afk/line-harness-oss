ALTER TABLE form_submissions ADD COLUMN idempotency_key TEXT;
ALTER TABLE form_submissions ADD COLUMN tracked_link_id TEXT;
ALTER TABLE form_submissions ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (delivery_status IN ('pending', 'sent', 'failed', 'not_required'));
ALTER TABLE form_submissions ADD COLUMN delivery_retry_key TEXT;
ALTER TABLE form_submissions ADD COLUMN delivery_error TEXT;
ALTER TABLE form_submissions ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_form_submissions_idempotency
  ON form_submissions (form_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
