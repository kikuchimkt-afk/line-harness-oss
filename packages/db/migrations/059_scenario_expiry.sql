-- Optional campaign boundary; existing scenarios keep their current behavior.
ALTER TABLE scenarios ADD COLUMN expires_at TEXT;
