ALTER TABLE event_slots
ADD COLUMN visibility_conditions TEXT CHECK (visibility_conditions IS NULL OR json_valid(visibility_conditions));
