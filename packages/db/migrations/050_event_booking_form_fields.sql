-- Migration 050: Event booking custom form fields
-- Event definitions can now hold a small JSON form schema, and each booking
-- stores the submitted answers separately from the legacy free-form note.

ALTER TABLE events ADD COLUMN booking_form_fields TEXT NOT NULL DEFAULT '[]';
ALTER TABLE event_bookings ADD COLUMN form_answers TEXT NOT NULL DEFAULT '{}';
