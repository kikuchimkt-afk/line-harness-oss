-- Event booking waitlist support.
-- Existing events remain unchanged until waitlist_enabled is turned on.

ALTER TABLE events ADD COLUMN waitlist_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (waitlist_enabled IN (0, 1));

-- SQLite cannot extend an existing CHECK constraint in place, so rebuild the
-- booking table while preserving every column added by later migrations.
-- event_booking_reminders is rebuilt in the same transaction because it has a
-- foreign key to event_bookings. Dropping the child first keeps D1's mandatory
-- foreign-key enforcement valid throughout the imported transaction.

CREATE TABLE event_bookings_new (
  id                    TEXT PRIMARY KEY,
  line_account_id       TEXT NOT NULL,
  event_id              TEXT NOT NULL,
  slot_id               TEXT NOT NULL,
  friend_id             TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('requested','waitlisted','confirmed','rejected','cancelled','expired','no_show','attended')),
  customer_note         TEXT,
  internal_note         TEXT,
  requested_at          TEXT NOT NULL,
  promoted_at           TEXT,
  decided_at            TEXT,
  decided_by_staff_id   TEXT,
  cancelled_at          TEXT,
  cancelled_by          TEXT CHECK (cancelled_by IN ('friend','admin','system')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  identity_key          TEXT,
  form_answers          TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (slot_id) REFERENCES event_slots(id),
  FOREIGN KEY (friend_id) REFERENCES friends(id)
);

INSERT INTO event_bookings_new (
  id, line_account_id, event_id, slot_id, friend_id, status,
  customer_note, internal_note, requested_at, promoted_at, decided_at,
  decided_by_staff_id, cancelled_at, cancelled_by, created_at, updated_at,
  identity_key, form_answers
)
SELECT
  id, line_account_id, event_id, slot_id, friend_id, status,
  customer_note, internal_note, requested_at, NULL, decided_at,
  decided_by_staff_id, cancelled_at, cancelled_by, created_at, updated_at,
  identity_key, form_answers
FROM event_bookings;

CREATE TABLE event_booking_reminders_new (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('day_before','hours_before')),
  scheduled_at  TEXT NOT NULL,
  sent_at       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','failed_permanent','cancelled')),
  retry_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  FOREIGN KEY (booking_id) REFERENCES event_bookings_new(id)
);

INSERT INTO event_booking_reminders_new (
  id, booking_id, kind, scheduled_at, sent_at, status, retry_count, last_error
)
SELECT
  id, booking_id, kind, scheduled_at, sent_at, status, retry_count, last_error
FROM event_booking_reminders;

DROP TABLE event_booking_reminders;
DROP TABLE event_bookings;
ALTER TABLE event_bookings_new RENAME TO event_bookings;
ALTER TABLE event_booking_reminders_new RENAME TO event_booking_reminders;

CREATE INDEX IF NOT EXISTS idx_event_bookings_account_status_event
  ON event_bookings (line_account_id, status, event_id);
CREATE INDEX IF NOT EXISTS idx_event_bookings_slot_status
  ON event_bookings (slot_id, status);
CREATE INDEX IF NOT EXISTS idx_event_bookings_friend_requested
  ON event_bookings (friend_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_bookings_identity_status
  ON event_bookings (event_id, identity_key, status);
CREATE INDEX IF NOT EXISTS idx_event_bookings_waitlist_fifo
  ON event_bookings (slot_id, status, requested_at, id);
CREATE INDEX IF NOT EXISTS idx_event_booking_reminders_status_scheduled
  ON event_booking_reminders (status, scheduled_at);
