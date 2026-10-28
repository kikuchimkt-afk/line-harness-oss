CREATE TABLE IF NOT EXISTS event_weekly_slot_rules (
 event_id TEXT PRIMARY KEY REFERENCES events(id),
 weekly_windows TEXT NOT NULL CHECK(json_valid(weekly_windows)),
 horizon_days INTEGER NOT NULL DEFAULT 28 CHECK(horizon_days BETWEEN 1 AND 90),
 capacity INTEGER NOT NULL DEFAULT 1 CHECK(capacity>=1),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1))
);
