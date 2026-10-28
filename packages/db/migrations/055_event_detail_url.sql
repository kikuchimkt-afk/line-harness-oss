-- Optional public lesson-detail / landing-page URL shown in event booking.
-- Existing events intentionally remain NULL until an administrator adds a URL.

ALTER TABLE events ADD COLUMN detail_url TEXT;
