-- Hard-delete only the legacy Aikotoba data for the 2026 Tokushima
-- elementary English presentation project.
--
-- IMPORTANT:
--   * This script is intentionally tied to the production IDs audited on
--     2026-09-22. Run the guard immediately before the cleanup.
--   * The first SELECT deliberately raises a malformed-JSON error when any
--     invariant has drifted. Do not remove or bypass that failure.
--   * The deletes are also scoped by immutable IDs, account IDs, and FK
--     checks. Never replace them with a broad line_account_id delete.
--   * If execution is interrupted, stop and re-audit from a D1 time-travel
--     bookmark. The initial exact-count guard is not intended for blind retry.
--
-- Preserved by design:
--   * both LINE account rows and every friend row;
--   * the shared tag definition;
--   * the current public entry route, pool, scenario, and their history;
--   * the two current ECC Events events, all 17 current slots, and all current
--     ECC Events auto replies;
--   * all unrelated Aikotoba events, replies, routes, messages, and tags.

-- ---------------------------------------------------------------------------
-- Audited constants
-- ---------------------------------------------------------------------------
-- legacy account:       0797696f-e377-4132-bb17-77bc1db29b0a / 2010709514
-- ECC Events account:   d2e21719-b3d3-4130-a760-b6ec7700fc87 / 2011633364
-- shared tag:           a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85
-- current public route: 7bb2e21c-3972-4bc1-86b6-a7218ee8618d
-- current pool:         b745a18b-64dd-40de-9db6-8ac3f59fbc52
-- current scenario:     3fb7f618-cc7c-4d10-b752-d23fccabe426
-- migration-only route: e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21
-- old Aizumi event:     4efba7ae-6ff0-4963-b2d6-d638b583ee68
-- old Univ event:       4abc509c-ac26-4279-9810-b4bb273e0b70
-- new Aizumi event:     0ee01c75-3647-40a3-b40b-0d66edf2359f
-- new Univ event:       0b993dea-5d8c-4256-9783-36a33574c2e7
-- legacy test booking:  26786a9e-102c-447f-95c4-c9091220923e
-- legacy test friend:   dec1e981-3455-467f-8a09-c019fc12af97

-- ---------------------------------------------------------------------------
-- 0. Fail closed if production no longer matches the audited snapshot.
--
-- json_extract() on the invalid JSON literal is the D1-compatible abort. The
-- CASE expression evaluates it only when at least one invariant is false.
-- Expected result: cleanup_guard = 1.
-- ---------------------------------------------------------------------------
SELECT CASE WHEN (
  -- Both accounts still have the audited immutable identities.
  EXISTS (
    SELECT 1 FROM line_accounts
    WHERE id = '0797696f-e377-4132-bb17-77bc1db29b0a'
      AND channel_id = '2010709514'
      AND is_active = 1
  )
  AND EXISTS (
    SELECT 1 FROM line_accounts
    WHERE id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
      AND channel_id = '2011633364'
      AND is_active = 1
  )

  -- The live LP route is fully pinned to the dedicated ECC Events stack.
  AND EXISTS (
    SELECT 1 FROM entry_routes
    WHERE id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d'
      AND ref_code = 'tokushima-kids-english-2026'
      AND tag_id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85'
      AND scenario_id = '3fb7f618-cc7c-4d10-b752-d23fccabe426'
      AND pool_id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
      AND is_active = 1
      AND run_account_friend_add_scenarios = 0
  )
  AND EXISTS (
    SELECT 1 FROM scenarios
    WHERE id = '3fb7f618-cc7c-4d10-b752-d23fccabe426'
      AND line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
      AND is_active = 1
  )
  AND (SELECT COUNT(*) FROM scenario_steps
       WHERE scenario_id = '3fb7f618-cc7c-4d10-b752-d23fccabe426') = 4
  AND EXISTS (
    SELECT 1 FROM traffic_pools
    WHERE id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
      AND active_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
      AND is_active = 1
  )
  AND (SELECT COUNT(*) FROM pool_accounts
       WHERE pool_id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
         AND line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
         AND is_active = 1) = 1
  AND (SELECT COUNT(*) FROM pool_accounts
       WHERE pool_id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
         AND is_active = 1) = 1

  -- The shared tag definition must survive this cleanup.
  AND EXISTS (
    SELECT 1 FROM tags
    WHERE id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85'
      AND name = '2026小学生英語プレゼン大会LP経由'
  )

  -- Current ECC Events objects are complete and contain no UAT bookings.
  AND (SELECT COUNT(*) FROM events
       WHERE id IN (
         '0ee01c75-3647-40a3-b40b-0d66edf2359f',
         '0b993dea-5d8c-4256-9783-36a33574c2e7'
       )
         AND line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
         AND is_published = 1
         AND deleted_at IS NULL) = 2
  AND (SELECT COUNT(*) FROM event_slots
       WHERE event_id IN (
         '0ee01c75-3647-40a3-b40b-0d66edf2359f',
         '0b993dea-5d8c-4256-9783-36a33574c2e7'
       )) = 17
  AND (SELECT COUNT(*) FROM event_bookings
       WHERE event_id IN (
         '0ee01c75-3647-40a3-b40b-0d66edf2359f',
         '0b993dea-5d8c-4256-9783-36a33574c2e7'
       )) = 0

  -- All 13 current ECC Events replies must remain present and active.
  AND (SELECT COUNT(*) FROM auto_replies
       WHERE line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
         AND is_active = 1
         AND id IN (
           '0e7bb5d2-5809-4a7b-8014-f869950a147f',
           '671e46b2-65da-4e6f-b88b-b6780074396f',
           'adc9c036-65e9-49d4-95a8-9ba5b5067357',
           '2a2b3f61-aef6-4b84-bd1e-6530a6b0e9d9',
           '8b1faff4-5ea8-4f81-98c0-cbc0dcab33f0',
           '35bab3bd-4524-4204-a9da-075b6bc84ba6',
           '1fe2c048-95eb-46a5-b16e-3592faf6060b',
           'd63dd3d5-4a47-4cc4-b7c9-b5c567866826',
           'b92aec8b-b1a3-4f76-8746-f47f4df7b345',
           'edd4660b-9876-430f-95a4-1c4b3c3f5e77',
           'd6b88f1c-aad0-4495-b995-85a2b92e3f5e',
           'cef5e3f9-eb5c-45d5-8434-a925d385cd28',
           '62873475-6fb0-4890-abcb-47b1a433283f'
         )) = 13

  -- The legacy events are already soft-deleted and have exactly 17 known
  -- slots plus the single cancelled test booking.
  AND (SELECT COUNT(*) FROM events
       WHERE id IN (
         '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
         '4abc509c-ac26-4279-9810-b4bb273e0b70'
       )
         AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
         AND deleted_at IS NOT NULL) = 2
  AND (SELECT COUNT(*) FROM event_slots
       WHERE event_id IN (
         '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
         '4abc509c-ac26-4279-9810-b4bb273e0b70'
       )) = 17
  AND (SELECT COUNT(*) FROM event_slots
       WHERE id IN (
         '921802eb-44c0-4659-94ae-e7a9dd2d6d78',
         'ae507b8b-9191-4f9e-b086-ea9938273f23',
         '2836a963-b231-40c1-8298-fb057a990f82',
         '28d23b42-d084-46e6-add3-acc0789b3c89',
         '1d802e61-f061-4dbe-81e5-6a08fdd5c3d3',
         '6cbeefed-0609-486a-a557-14168c62d78f',
         '855f6990-f1fc-4f84-99c8-a378a41edce4',
         'ca23af9d-f72a-4753-8bd5-232f23756e9a',
         '461367fe-8103-4272-b688-95de09061f63',
         'a262f873-8fd0-4c93-9d19-6c4676d3d83d',
         '8b10c6f3-0acf-4cd2-831c-c20e1028a370',
         '25b7fdd5-6be7-40aa-ad4c-74b21b6a788a',
         '8b539f3e-0441-408d-a586-4d7a32cf19ed',
         'b4bc1023-828d-426e-a31d-8b930f49417c',
         'f38b1566-c4ff-4ba1-855a-e8a56d8662bd',
         '8188e705-1d85-4c4a-aed0-4e7b2c16ea5c',
         '4e7234be-42c3-44f9-8fcf-453b45ec2437'
       )
         AND event_id IN (
           '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
           '4abc509c-ac26-4279-9810-b4bb273e0b70'
         )) = 17
  AND (SELECT COUNT(*) FROM event_bookings
       WHERE event_id IN (
         '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
         '4abc509c-ac26-4279-9810-b4bb273e0b70'
       )) = 1
  AND EXISTS (
    SELECT 1 FROM event_bookings
    WHERE id = '26786a9e-102c-447f-95c4-c9091220923e'
      AND event_id = '4efba7ae-6ff0-4963-b2d6-d638b583ee68'
      AND slot_id = '8b539f3e-0441-408d-a586-4d7a32cf19ed'
      AND friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
      AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
      AND status = 'cancelled'
  )
  AND (SELECT COUNT(*) FROM event_booking_reminders
       WHERE booking_id = '26786a9e-102c-447f-95c4-c9091220923e') = 0
  AND (SELECT COUNT(*) FROM event_booking_decision_notifications
       WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
         AND event_id IN (
           '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
           '4abc509c-ac26-4279-9810-b4bb273e0b70'
         )) = 0
  AND (SELECT COUNT(*) FROM event_booking_idempotency_keys
       WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
         AND response_status <> 0
         AND json_extract(
           CASE WHEN json_valid(response_body) THEN response_body ELSE '{}' END,
           '$.id'
         ) = '26786a9e-102c-447f-95c4-c9091220923e') = 0

  -- Only the exact test conversation pair is eligible for removal.
  AND EXISTS (
    SELECT 1 FROM messages_log
    WHERE id = 'a209a4c9-7353-4533-b7b0-aa2685f8557a'
      AND friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
      AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
      AND direction = 'incoming'
      AND source = 'user'
      AND content = 'プレゼン大会練習'
  )
  AND EXISTS (
    SELECT 1 FROM messages_log
    WHERE id = 'e71f7eae-328d-4697-906e-aa225f84600f'
      AND friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
      AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
      AND direction = 'outgoing'
      AND source = 'auto_reply'
      AND instr(content, '4efba7ae-6ff0-4963-b2d6-d638b583ee68') > 0
      AND instr(content, '4abc509c-ac26-4279-9810-b4bb273e0b70') > 0
  )
  AND (SELECT COUNT(*) FROM messages_log
       WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
         AND (
           scenario_step_id IN (
             '53cfd84e-d642-4414-9e4d-36b308f991f1',
             'f9d564a0-63e7-465b-8b45-e2f70fac0107',
             'fc19b41c-eba8-4d96-973d-e83016386976',
             '8249347f-7c17-4c35-9fbd-700d9ce1477b'
           )
           OR instr(content, '4efba7ae-6ff0-4963-b2d6-d638b583ee68') > 0
           OR instr(content, '4abc509c-ac26-4279-9810-b4bb273e0b70') > 0
           OR instr(content, 'tokushima-elementary-english-presentation-2026.vercel.app') > 0
           OR instr(content, '徳島県小学生英語プレゼンテーション') > 0
           OR instr(content, 'プレゼン大会') > 0
           OR instr(content, '暗誦大会') > 0
         )) = 2

  -- Remove only the two historical Aikotoba attribution rows. Keep the
  -- current route and every ECC Events attribution row.
  AND (SELECT COUNT(*) FROM ref_tracking rt
       JOIN friends f ON f.id = rt.friend_id
       WHERE rt.entry_route_id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d'
         AND rt.ref_code = 'tokushima-kids-english-2026'
         AND f.line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a') = 2
  AND (SELECT COUNT(*) FROM ref_tracking
       WHERE id IN (
         'f3f419fb-fc0d-4d0e-a1e0-f535d266b48f',
         '700bf715-a1d3-424e-a874-6c40fb7982ca'
       )
         AND friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
         AND entry_route_id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d'
         AND ref_code = 'tokushima-kids-english-2026') = 2

  -- The migration-only route is referenced only by the 13 legacy replies.
  AND EXISTS (
    SELECT 1 FROM entry_routes
    WHERE id = 'e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21'
      AND ref_code = 'tokushima-kids-english-2026-aikotoba'
      AND tag_id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85'
      AND scenario_id = '3fb7f618-cc7c-4d10-b752-d23fccabe426'
      AND pool_id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
      AND is_active = 1
  )
  AND (SELECT COUNT(*) FROM ref_tracking
       WHERE entry_route_id = 'e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21') = 0
  AND (SELECT COUNT(*) FROM auto_replies
       WHERE instr(response_content, 'tokushima-kids-english-2026-aikotoba') > 0) = 13
  AND (SELECT COUNT(*) FROM messages_log
       WHERE instr(content, 'tokushima-kids-english-2026-aikotoba') > 0) = 0
  AND (SELECT COUNT(*) FROM scenario_steps
       WHERE instr(message_content, 'tokushima-kids-english-2026-aikotoba') > 0) = 0
  AND (SELECT COUNT(*) FROM automations
       WHERE instr(COALESCE(conditions, ''), 'tokushima-kids-english-2026-aikotoba') > 0
          OR instr(COALESCE(actions, ''), 'tokushima-kids-english-2026-aikotoba') > 0) = 0
  AND (SELECT COUNT(*) FROM broadcasts
       WHERE instr(message_content, 'tokushima-kids-english-2026-aikotoba') > 0) = 0

  -- The old friend and one project tag assignment are test data. Neither the
  -- friend row nor the shared tag row is deleted.
  AND EXISTS (
    SELECT 1 FROM friends
    WHERE id = 'dec1e981-3455-467f-8a09-c019fc12af97'
      AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  )
  AND (SELECT COUNT(*) FROM friend_tags
       WHERE friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
         AND tag_id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85') = 1

  -- Exact 13 legacy replies, no account-wide wildcard.
  AND (SELECT COUNT(*) FROM auto_replies
       WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
         AND id IN (
           '40415ad3-a9d7-4abd-baf7-b4e751b34ecf',
           '70460279-9ce0-4470-96d2-52b0b2b5735e',
           'a05b985b-e5bb-495d-ad7f-4886f3abffbb',
           '24e0f932-5e06-426e-9398-4a63e04c88f5',
           '741a5c4e-1794-4fee-9ed9-4832fd56c1cf',
           '452b277b-b217-43dc-a981-e630fcc814cf',
           '3b52a655-2453-424d-8fe5-e996b36688a8',
           '7137ace0-d1d1-4008-be3d-afd8ba1feeff',
           '992ff4a0-826d-4c35-a6e1-0e0e44c8facf',
           '7cbeb80e-1331-44fa-8323-dca01a93d50d',
           '553aad0f-ab4b-494c-b621-9d49443292be',
           '4aa2c2fb-1a98-4c44-8374-418a1bf418fc',
           '6d07c527-0d40-4e6e-b0a9-0854bb060287'
         )) = 13

  -- These legacy definitions were removed earlier. If they reappear, stop.
  AND NOT EXISTS (SELECT 1 FROM scenarios
                  WHERE id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f')
  AND NOT EXISTS (SELECT 1 FROM scenario_steps
                  WHERE id IN (
                    '53cfd84e-d642-4414-9e4d-36b308f991f1',
                    'f9d564a0-63e7-465b-8b45-e2f70fac0107',
                    'fc19b41c-eba8-4d96-973d-e83016386976',
                    '8249347f-7c17-4c35-9fbd-700d9ce1477b'
                  )
                     OR scenario_id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f')
  AND NOT EXISTS (SELECT 1 FROM friend_scenarios
                  WHERE scenario_id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f')
  AND NOT EXISTS (SELECT 1 FROM automations
                  WHERE id = '1a51f12a-a624-4d98-a346-0e158e7096ee')
  AND NOT EXISTS (SELECT 1 FROM traffic_pools
                  WHERE id = '797187dd-0dc6-46aa-bebc-8cbe3205a73e')
  AND NOT EXISTS (SELECT 1 FROM pool_accounts
                  WHERE pool_id = '797187dd-0dc6-46aa-bebc-8cbe3205a73e')
)
THEN 1
ELSE json_extract('ABORT_CLEANUP_GUARD_FAILED', '$')
END AS cleanup_guard;

-- ---------------------------------------------------------------------------
-- 1. Event-booking children, the single cancelled test booking, and the exact
--    17 legacy slots/events. All NO ACTION FKs are removed child-first.
-- ---------------------------------------------------------------------------
DELETE FROM event_booking_reminders
WHERE booking_id = '26786a9e-102c-447f-95c4-c9091220923e';

DELETE FROM event_booking_decision_notifications
WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND event_id IN (
    '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
    '4abc509c-ac26-4279-9810-b4bb273e0b70'
  );

-- This table has no booking FK. Scope completed caches through the exact
-- response booking UUID while the booking still exists.
DELETE FROM event_booking_idempotency_keys
WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND response_status <> 0
  AND json_extract(
    CASE WHEN json_valid(response_body) THEN response_body ELSE '{}' END,
    '$.id'
  ) = '26786a9e-102c-447f-95c4-c9091220923e';

DELETE FROM event_bookings
WHERE id = '26786a9e-102c-447f-95c4-c9091220923e'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND event_id = '4efba7ae-6ff0-4963-b2d6-d638b583ee68'
  AND slot_id = '8b539f3e-0441-408d-a586-4d7a32cf19ed'
  AND friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
  AND status = 'cancelled';

DELETE FROM event_slots
WHERE id IN (
    '921802eb-44c0-4659-94ae-e7a9dd2d6d78',
    'ae507b8b-9191-4f9e-b086-ea9938273f23',
    '2836a963-b231-40c1-8298-fb057a990f82',
    '28d23b42-d084-46e6-add3-acc0789b3c89',
    '1d802e61-f061-4dbe-81e5-6a08fdd5c3d3',
    '6cbeefed-0609-486a-a557-14168c62d78f',
    '855f6990-f1fc-4f84-99c8-a378a41edce4',
    'ca23af9d-f72a-4753-8bd5-232f23756e9a',
    '461367fe-8103-4272-b688-95de09061f63',
    'a262f873-8fd0-4c93-9d19-6c4676d3d83d',
    '8b10c6f3-0acf-4cd2-831c-c20e1028a370',
    '25b7fdd5-6be7-40aa-ad4c-74b21b6a788a',
    '8b539f3e-0441-408d-a586-4d7a32cf19ed',
    'b4bc1023-828d-426e-a31d-8b930f49417c',
    'f38b1566-c4ff-4ba1-855a-e8a56d8662bd',
    '8188e705-1d85-4c4a-aed0-4e7b2c16ea5c',
    '4e7234be-42c3-44f9-8fcf-453b45ec2437'
  )
  AND event_id IN (
    '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
    '4abc509c-ac26-4279-9810-b4bb273e0b70'
  )
  AND NOT EXISTS (
    SELECT 1 FROM event_bookings b WHERE b.slot_id = event_slots.id
  );

DELETE FROM events
WHERE id IN (
    '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
    '4abc509c-ac26-4279-9810-b4bb273e0b70'
  )
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND deleted_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM event_slots s WHERE s.event_id = events.id)
  AND NOT EXISTS (SELECT 1 FROM event_bookings b WHERE b.event_id = events.id)
  AND NOT EXISTS (
    SELECT 1 FROM event_booking_decision_notifications n
    WHERE n.event_id = events.id
  );

-- ---------------------------------------------------------------------------
-- 2. Exact test conversation and historical legacy-account attribution.
-- ---------------------------------------------------------------------------
DELETE FROM messages_log
WHERE id IN (
    'a209a4c9-7353-4533-b7b0-aa2685f8557a',
    'e71f7eae-328d-4697-906e-aa225f84600f'
  )
  AND friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

DELETE FROM ref_tracking
WHERE id IN (
    'f3f419fb-fc0d-4d0e-a1e0-f535d266b48f',
    '700bf715-a1d3-424e-a874-6c40fb7982ca'
  )
  AND friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
  AND entry_route_id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d'
  AND ref_code = 'tokushima-kids-english-2026';

DELETE FROM friend_tags
WHERE friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
  AND tag_id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85'
  AND EXISTS (
    SELECT 1 FROM friends
    WHERE id = 'dec1e981-3455-467f-8a09-c019fc12af97'
      AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  );

-- ---------------------------------------------------------------------------
-- 3. Exact 13 legacy replies. The other 56 Aikotoba replies and all ECC
--    Events replies remain untouched.
-- ---------------------------------------------------------------------------
DELETE FROM auto_replies
WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND id IN (
    '40415ad3-a9d7-4abd-baf7-b4e751b34ecf',
    '70460279-9ce0-4470-96d2-52b0b2b5735e',
    'a05b985b-e5bb-495d-ad7f-4886f3abffbb',
    '24e0f932-5e06-426e-9398-4a63e04c88f5',
    '741a5c4e-1794-4fee-9ed9-4832fd56c1cf',
    '452b277b-b217-43dc-a981-e630fcc814cf',
    '3b52a655-2453-424d-8fe5-e996b36688a8',
    '7137ace0-d1d1-4008-be3d-afd8ba1feeff',
    '992ff4a0-826d-4c35-a6e1-0e0e44c8facf',
    '7cbeb80e-1331-44fa-8323-dca01a93d50d',
    '553aad0f-ab4b-494c-b621-9d49443292be',
    '4aa2c2fb-1a98-4c44-8374-418a1bf418fc',
    '6d07c527-0d40-4e6e-b0a9-0854bb060287'
  );

-- ---------------------------------------------------------------------------
-- 4. Migration-only route. The public LP route 7bb2e21c... is retained.
-- ---------------------------------------------------------------------------
DELETE FROM entry_routes
WHERE id = 'e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21'
  AND ref_code = 'tokushima-kids-english-2026-aikotoba'
  AND scenario_id = '3fb7f618-cc7c-4d10-b752-d23fccabe426'
  AND pool_id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
  AND NOT EXISTS (
    SELECT 1 FROM ref_tracking
    WHERE entry_route_id = 'e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21'
  )
  AND NOT EXISTS (
    SELECT 1 FROM auto_replies
    WHERE instr(response_content, 'tokushima-kids-english-2026-aikotoba') > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM messages_log
    WHERE instr(content, 'tokushima-kids-english-2026-aikotoba') > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM scenario_steps
    WHERE instr(message_content, 'tokushima-kids-english-2026-aikotoba') > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM automations
    WHERE instr(COALESCE(conditions, ''), 'tokushima-kids-english-2026-aikotoba') > 0
       OR instr(COALESCE(actions, ''), 'tokushima-kids-english-2026-aikotoba') > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM broadcasts
    WHERE instr(message_content, 'tokushima-kids-english-2026-aikotoba') > 0
  );

-- ---------------------------------------------------------------------------
-- 5. Fail closed if cleanup or preservation checks did not finish exactly.
-- Expected result: cleanup_postcheck = 1 and no FK rows.
-- ---------------------------------------------------------------------------
SELECT CASE WHEN (
  (SELECT COUNT(*) FROM events
   WHERE id IN (
     '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
     '4abc509c-ac26-4279-9810-b4bb273e0b70'
   )) = 0
  AND (SELECT COUNT(*) FROM event_slots
       WHERE id IN (
         '921802eb-44c0-4659-94ae-e7a9dd2d6d78',
         'ae507b8b-9191-4f9e-b086-ea9938273f23',
         '2836a963-b231-40c1-8298-fb057a990f82',
         '28d23b42-d084-46e6-add3-acc0789b3c89',
         '1d802e61-f061-4dbe-81e5-6a08fdd5c3d3',
         '6cbeefed-0609-486a-a557-14168c62d78f',
         '855f6990-f1fc-4f84-99c8-a378a41edce4',
         'ca23af9d-f72a-4753-8bd5-232f23756e9a',
         '461367fe-8103-4272-b688-95de09061f63',
         'a262f873-8fd0-4c93-9d19-6c4676d3d83d',
         '8b10c6f3-0acf-4cd2-831c-c20e1028a370',
         '25b7fdd5-6be7-40aa-ad4c-74b21b6a788a',
         '8b539f3e-0441-408d-a586-4d7a32cf19ed',
         'b4bc1023-828d-426e-a31d-8b930f49417c',
         'f38b1566-c4ff-4ba1-855a-e8a56d8662bd',
         '8188e705-1d85-4c4a-aed0-4e7b2c16ea5c',
         '4e7234be-42c3-44f9-8fcf-453b45ec2437'
       )) = 0
  AND NOT EXISTS (SELECT 1 FROM event_bookings
                  WHERE id = '26786a9e-102c-447f-95c4-c9091220923e')
  AND NOT EXISTS (SELECT 1 FROM messages_log
                  WHERE id IN (
                    'a209a4c9-7353-4533-b7b0-aa2685f8557a',
                    'e71f7eae-328d-4697-906e-aa225f84600f'
                  ))
  AND NOT EXISTS (SELECT 1 FROM ref_tracking
                  WHERE id IN (
                    'f3f419fb-fc0d-4d0e-a1e0-f535d266b48f',
                    '700bf715-a1d3-424e-a874-6c40fb7982ca'
                  ))
  AND NOT EXISTS (SELECT 1 FROM friend_tags
                  WHERE friend_id = 'dec1e981-3455-467f-8a09-c019fc12af97'
                    AND tag_id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85')
  AND NOT EXISTS (SELECT 1 FROM auto_replies
                  WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
                    AND id IN (
                      '40415ad3-a9d7-4abd-baf7-b4e751b34ecf',
                      '70460279-9ce0-4470-96d2-52b0b2b5735e',
                      'a05b985b-e5bb-495d-ad7f-4886f3abffbb',
                      '24e0f932-5e06-426e-9398-4a63e04c88f5',
                      '741a5c4e-1794-4fee-9ed9-4832fd56c1cf',
                      '452b277b-b217-43dc-a981-e630fcc814cf',
                      '3b52a655-2453-424d-8fe5-e996b36688a8',
                      '7137ace0-d1d1-4008-be3d-afd8ba1feeff',
                      '992ff4a0-826d-4c35-a6e1-0e0e44c8facf',
                      '7cbeb80e-1331-44fa-8323-dca01a93d50d',
                      '553aad0f-ab4b-494c-b621-9d49443292be',
                      '4aa2c2fb-1a98-4c44-8374-418a1bf418fc',
                      '6d07c527-0d40-4e6e-b0a9-0854bb060287'
                    ))
  AND NOT EXISTS (SELECT 1 FROM entry_routes
                  WHERE id = 'e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21')

  -- Preservation assertions.
  AND EXISTS (SELECT 1 FROM line_accounts
              WHERE id = '0797696f-e377-4132-bb17-77bc1db29b0a')
  AND EXISTS (SELECT 1 FROM line_accounts
              WHERE id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87')
  AND EXISTS (SELECT 1 FROM friends
              WHERE id = 'dec1e981-3455-467f-8a09-c019fc12af97')
  AND EXISTS (SELECT 1 FROM tags
              WHERE id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85')
  AND EXISTS (SELECT 1 FROM entry_routes
              WHERE id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d'
                AND scenario_id = '3fb7f618-cc7c-4d10-b752-d23fccabe426'
                AND pool_id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
                AND is_active = 1)
  AND EXISTS (SELECT 1 FROM scenarios
              WHERE id = '3fb7f618-cc7c-4d10-b752-d23fccabe426'
                AND line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
                AND is_active = 1)
  AND (SELECT COUNT(*) FROM scenario_steps
       WHERE scenario_id = '3fb7f618-cc7c-4d10-b752-d23fccabe426') = 4
  AND EXISTS (SELECT 1 FROM traffic_pools
              WHERE id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
                AND active_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
                AND is_active = 1)
  AND (SELECT COUNT(*) FROM pool_accounts
       WHERE pool_id = 'b745a18b-64dd-40de-9db6-8ac3f59fbc52'
         AND line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
         AND is_active = 1) = 1
  AND (SELECT COUNT(*) FROM events
       WHERE id IN (
         '0ee01c75-3647-40a3-b40b-0d66edf2359f',
         '0b993dea-5d8c-4256-9783-36a33574c2e7'
       )
         AND line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
         AND deleted_at IS NULL) = 2
  AND (SELECT COUNT(*) FROM event_slots
       WHERE event_id IN (
         '0ee01c75-3647-40a3-b40b-0d66edf2359f',
         '0b993dea-5d8c-4256-9783-36a33574c2e7'
       )) = 17
  AND (SELECT COUNT(*) FROM event_bookings
       WHERE event_id IN (
         '0ee01c75-3647-40a3-b40b-0d66edf2359f',
         '0b993dea-5d8c-4256-9783-36a33574c2e7'
       )) = 0
  AND (SELECT COUNT(*) FROM auto_replies
       WHERE line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87'
         AND is_active = 1
         AND id IN (
           '0e7bb5d2-5809-4a7b-8014-f869950a147f',
           '671e46b2-65da-4e6f-b88b-b6780074396f',
           'adc9c036-65e9-49d4-95a8-9ba5b5067357',
           '2a2b3f61-aef6-4b84-bd1e-6530a6b0e9d9',
           '8b1faff4-5ea8-4f81-98c0-cbc0dcab33f0',
           '35bab3bd-4524-4204-a9da-075b6bc84ba6',
           '1fe2c048-95eb-46a5-b16e-3592faf6060b',
           'd63dd3d5-4a47-4cc4-b7c9-b5c567866826',
           'b92aec8b-b1a3-4f76-8746-f47f4df7b345',
           'edd4660b-9876-430f-95a4-1c4b3c3f5e77',
           'd6b88f1c-aad0-4495-b995-85a2b92e3f5e',
           'cef5e3f9-eb5c-45d5-8434-a925d385cd28',
           '62873475-6fb0-4890-abcb-47b1a433283f'
         )) = 13
  AND NOT EXISTS (SELECT 1 FROM scenarios
                  WHERE id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f')
  AND NOT EXISTS (SELECT 1 FROM scenario_steps
                  WHERE id IN (
                    '53cfd84e-d642-4414-9e4d-36b308f991f1',
                    'f9d564a0-63e7-465b-8b45-e2f70fac0107',
                    'fc19b41c-eba8-4d96-973d-e83016386976',
                    '8249347f-7c17-4c35-9fbd-700d9ce1477b'
                  )
                     OR scenario_id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f')
  AND NOT EXISTS (SELECT 1 FROM friend_scenarios
                  WHERE scenario_id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f')
  AND NOT EXISTS (SELECT 1 FROM automations
                  WHERE id = '1a51f12a-a624-4d98-a346-0e158e7096ee')
  AND NOT EXISTS (SELECT 1 FROM traffic_pools
                  WHERE id = '797187dd-0dc6-46aa-bebc-8cbe3205a73e')
  AND NOT EXISTS (SELECT 1 FROM pool_accounts
                  WHERE pool_id = '797187dd-0dc6-46aa-bebc-8cbe3205a73e')
)
THEN 1
ELSE json_extract('ABORT_CLEANUP_POSTCHECK_FAILED', '$')
END AS cleanup_postcheck;

PRAGMA foreign_key_check;
