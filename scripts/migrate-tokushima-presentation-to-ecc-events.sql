-- Migrate the 2026 Tokushima elementary English presentation project from
-- the legacy Aikotoba LINE account to the dedicated ECC Events account.
--
-- This file is intentionally idempotent. It copies definitions only; it does
-- NOT copy friends, bookings, reminder jobs, delivery logs, or idempotency
-- keys. The existing booking/history rows therefore remain attached to the
-- legacy events and account until the separately reviewed cleanup file is run.
--
-- Required before execution:
--   1. line_accounts contains channel_id = '2011633364'.
--   2. That row has its Messaging credentials and LIFF fields configured.
--   3. The source objects below still match the preflight checks documented at
--      the end of this file.
--
-- Safety model:
--   * Every prepare INSERT is gated on a ready target account.
--   * All copied objects use fixed IDs, so retries cannot duplicate data.
--   * The public entry route is switched in the final statement only, and only
--     when all expected target counts are present.
--   * The new account is removed from the shared `main` pool before cutover.

-- ---------------------------------------------------------------------------
-- Constants (kept as comments because D1 SQL has no session variables)
-- ---------------------------------------------------------------------------
-- old account:       0797696f-e377-4132-bb17-77bc1db29b0a
-- new channel ID:    2011633364
-- shared tag:        a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85
-- old pool:          797187dd-0dc6-46aa-bebc-8cbe3205a73e
-- new pool:          fbbfb4b8-89e1-482b-b68b-c8857f639ab0
-- old scenario:      88a7c223-059b-4ee2-bbe4-61cb8c05165f
-- new scenario:      041a4e2d-8942-4152-86aa-27f033e8388f
-- entry route:       7bb2e21c-3972-4bc1-86b6-a7218ee8618d
-- old Aizumi event:  4efba7ae-6ff0-4963-b2d6-d638b583ee68
-- new Aizumi event:  87c62e99-cfe2-4b66-b2bf-220533a14ed7
-- old Univ event:    4abc509c-ac26-4279-9810-b4bb273e0b70
-- new Univ event:    2b3d55bf-effe-4866-ab49-ecacd2d08303
-- old handoff rule:  1a51f12a-a624-4d98-a346-0e158e7096ee
-- new handoff rule:  58e6ff3c-ea8a-42ed-b197-009aa6a81b92

-- ---------------------------------------------------------------------------
-- 1. Dedicated traffic pool. Do not let this account participate in `main`.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO traffic_pools (
  id, slug, name, active_account_id, is_active, created_at, updated_at
)
SELECT
  'fbbfb4b8-89e1-482b-b68b-c8857f639ab0',
  'tokushima-kids-english-2026-events',
  '2026小学生英語プレゼン大会｜ECCジュニアイベント専用',
  id,
  1,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
FROM line_accounts
WHERE channel_id = '2011633364'
  AND is_active = 1
  AND liff_id IS NOT NULL
  AND liff_id <> '';

UPDATE traffic_pools
SET active_account_id = (SELECT id FROM line_accounts WHERE channel_id = '2011633364'),
    name = '2026小学生英語プレゼン大会｜ECCジュニアイベント専用',
    is_active = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0'
  AND EXISTS (
    SELECT 1 FROM line_accounts
    WHERE channel_id = '2011633364'
      AND is_active = 1
      AND liff_id IS NOT NULL
      AND liff_id <> ''
  );

DELETE FROM pool_accounts
WHERE pool_id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0'
  AND line_account_id <> (SELECT id FROM line_accounts WHERE channel_id = '2011633364');

INSERT OR IGNORE INTO pool_accounts (
  id, pool_id, line_account_id, is_active, created_at
)
SELECT
  'db5d2afe-5b40-4d58-af26-978f0ea567a9',
  'fbbfb4b8-89e1-482b-b68b-c8857f639ab0',
  id,
  1,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
FROM line_accounts
WHERE channel_id = '2011633364'
  AND is_active = 1
  AND liff_id IS NOT NULL
  AND liff_id <> '';

UPDATE pool_accounts
SET is_active = 1
WHERE pool_id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0'
  AND line_account_id = (SELECT id FROM line_accounts WHERE channel_id = '2011633364');

-- POST /api/line-accounts auto-enrolls every new account into `main`.
-- Remove only this new account from that shared pool; leave all other accounts
-- and the main pool's active_account_id untouched.
DELETE FROM pool_accounts
WHERE line_account_id = (SELECT id FROM line_accounts WHERE channel_id = '2011633364')
  AND pool_id IN (SELECT id FROM traffic_pools WHERE slug = 'main')
  AND EXISTS (
    SELECT 1 FROM line_accounts
    WHERE channel_id = '2011633364'
      AND is_active = 1
      AND liff_id IS NOT NULL
      AND liff_id <> ''
  );

-- ---------------------------------------------------------------------------
-- 2. Scenario and its four steps. Keep inactive until the final guard passes.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO scenarios (
  id, name, description, trigger_type, trigger_tag_id, is_active,
  delivery_mode, created_at, updated_at, line_account_id
)
SELECT
  '041a4e2d-8942-4152-86aa-27f033e8388f',
  s.name,
  s.description,
  s.trigger_type,
  s.trigger_tag_id,
  0,
  s.delivery_mode,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  na.id
FROM scenarios s
JOIN line_accounts na ON na.channel_id = '2011633364'
WHERE s.id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f'
  AND s.line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND na.is_active = 1
  AND na.liff_id IS NOT NULL
  AND na.liff_id <> '';

INSERT OR IGNORE INTO scenario_steps (
  id, scenario_id, step_order, delay_minutes, message_type, message_content,
  offset_days, offset_minutes, delivery_time, template_id, on_reach_tag_id,
  created_at, condition_type, condition_value, next_step_on_false
)
SELECT
  CASE ss.id
    WHEN '53cfd84e-d642-4414-9e4d-36b308f991f1' THEN 'b4379977-af9b-470d-b985-9623f9cfd9ac'
    WHEN 'f9d564a0-63e7-465b-8b45-e2f70fac0107' THEN '90bef916-8036-415c-9fc5-bde9209b0b95'
    WHEN 'fc19b41c-eba8-4d96-973d-e83016386976' THEN '9f6e77ce-82ba-48bf-97be-cb884c12942f'
    WHEN '8249347f-7c17-4c35-9fbd-700d9ce1477b' THEN 'eaeeb609-0a21-4fa4-98b6-85001fa4241a'
  END,
  '041a4e2d-8942-4152-86aa-27f033e8388f',
  ss.step_order,
  ss.delay_minutes,
  ss.message_type,
  replace(
    replace(
      replace(ss.message_content,
        '2010714049-6L0KFjN7', na.liff_id),
      '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
      '87c62e99-cfe2-4b66-b2bf-220533a14ed7'),
    '4abc509c-ac26-4279-9810-b4bb273e0b70',
    '2b3d55bf-effe-4866-ab49-ecacd2d08303'),
  ss.offset_days,
  ss.offset_minutes,
  ss.delivery_time,
  ss.template_id,
  ss.on_reach_tag_id,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  ss.condition_type,
  ss.condition_value,
  ss.next_step_on_false
FROM scenario_steps ss
JOIN line_accounts na ON na.channel_id = '2011633364'
WHERE ss.scenario_id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f'
  AND ss.id IN (
    '53cfd84e-d642-4414-9e4d-36b308f991f1',
    'f9d564a0-63e7-465b-8b45-e2f70fac0107',
    'fc19b41c-eba8-4d96-973d-e83016386976',
    '8249347f-7c17-4c35-9fbd-700d9ce1477b'
  )
  AND na.is_active = 1
  AND na.liff_id IS NOT NULL
  AND na.liff_id <> '';

-- ---------------------------------------------------------------------------
-- 3. The exact 13 project auto replies. Never copy every reply on Aikotoba:
--    that account also owns unrelated campaigns.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO auto_replies (
  id, keyword, match_type, response_type, response_content, template_id,
  line_account_id, is_active, created_at
)
SELECT
  CASE ar.id
    WHEN '40415ad3-a9d7-4abd-baf7-b4e751b34ecf' THEN 'b59418b1-7daf-46ad-bd9b-e0f112e079db'
    WHEN '70460279-9ce0-4470-96d2-52b0b2b5735e' THEN '3cdfcac3-7c6c-4195-86fe-591021e08e2c'
    WHEN 'a05b985b-e5bb-495d-ad7f-4886f3abffbb' THEN '1e432eb0-d746-4d46-a79d-bb0ad43c5e32'
    WHEN '24e0f932-5e06-426e-9398-4a63e04c88f5' THEN 'cf9e9ac6-9f64-4183-bdd4-989edf54d6eb'
    WHEN '741a5c4e-1794-4fee-9ed9-4832fd56c1cf' THEN 'd48ab3e6-67a3-4ece-b208-70c21d1c967b'
    WHEN '452b277b-b217-43dc-a981-e630fcc814cf' THEN 'cdd602c0-2baa-4ab2-bf66-344acd1140c6'
    WHEN '3b52a655-2453-424d-8fe5-e996b36688a8' THEN '6426cdfa-f3ab-4025-aa59-151be5cb2069'
    WHEN '7137ace0-d1d1-4008-be3d-afd8ba1feeff' THEN '98de9061-d189-4986-9921-3d5330b7a1b9'
    WHEN '992ff4a0-826d-4c35-a6e1-0e0e44c8facf' THEN 'ed27031a-9456-4aa4-a80e-56786f6e55a3'
    WHEN '7cbeb80e-1331-44fa-8323-dca01a93d50d' THEN '34e18805-4659-4245-a7cf-79944c2e474a'
    WHEN '553aad0f-ab4b-494c-b621-9d49443292be' THEN '9a33855c-4b5d-40ab-9d84-4e812fe22c9b'
    WHEN '4aa2c2fb-1a98-4c44-8374-418a1bf418fc' THEN 'af7e1159-9bf0-4b28-972d-5b8d53696837'
    WHEN '6d07c527-0d40-4e6e-b0a9-0854bb060287' THEN '0626d145-2d0e-430a-a652-cb85c32c6be2'
  END,
  ar.keyword,
  ar.match_type,
  ar.response_type,
  replace(
    replace(
      replace(ar.response_content,
        '2010714049-6L0KFjN7', na.liff_id),
      '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
      '87c62e99-cfe2-4b66-b2bf-220533a14ed7'),
    '4abc509c-ac26-4279-9810-b4bb273e0b70',
    '2b3d55bf-effe-4866-ab49-ecacd2d08303'),
  ar.template_id,
  na.id,
  0,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
FROM auto_replies ar
JOIN line_accounts na ON na.channel_id = '2011633364'
WHERE ar.line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND ar.id IN (
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
  )
  AND na.is_active = 1
  AND na.liff_id IS NOT NULL
  AND na.liff_id <> '';

-- ---------------------------------------------------------------------------
-- 4. Human-handoff automation. Keep inactive until cutover.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO automations (
  id, name, description, event_type, conditions, actions, is_active, priority,
  created_at, updated_at, line_account_id
)
SELECT
  '58e6ff3c-ea8a-42ed-b197-009aa6a81b92',
  a.name,
  a.description,
  a.event_type,
  replace(
    replace(
      replace(a.conditions,
        '2010714049-6L0KFjN7', na.liff_id),
      '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
      '87c62e99-cfe2-4b66-b2bf-220533a14ed7'),
    '4abc509c-ac26-4279-9810-b4bb273e0b70',
    '2b3d55bf-effe-4866-ab49-ecacd2d08303'),
  replace(
    replace(
      replace(a.actions,
        '2010714049-6L0KFjN7', na.liff_id),
      '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
      '87c62e99-cfe2-4b66-b2bf-220533a14ed7'),
    '4abc509c-ac26-4279-9810-b4bb273e0b70',
    '2b3d55bf-effe-4866-ab49-ecacd2d08303'),
  0,
  a.priority,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  na.id
FROM automations a
JOIN line_accounts na ON na.channel_id = '2011633364'
WHERE a.id = '1a51f12a-a624-4d98-a346-0e158e7096ee'
  AND a.line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND na.is_active = 1
  AND na.liff_id IS NOT NULL
  AND na.liff_id <> '';

-- ---------------------------------------------------------------------------
-- 5. Clone two event definitions. Keep unpublished until cutover.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO events (
  id, line_account_id, name, venue_name, venue_url, image_url, description,
  description_centered, max_bookings_per_friend, requires_approval,
  cancel_deadline_hours_before, reminder_day_before_enabled,
  reminder_hours_before, is_published, folder_id, sort_order, deleted_at,
  created_at, updated_at, target_type, account_ids, dedup_priority,
  failed_account_ids, confirmation_message_extra, reminder_message_extra,
  og_title, og_description, og_image_url, booking_form_fields, waitlist_enabled
)
SELECT
  CASE e.id
    WHEN '4efba7ae-6ff0-4963-b2d6-d638b583ee68' THEN '87c62e99-cfe2-4b66-b2bf-220533a14ed7'
    WHEN '4abc509c-ac26-4279-9810-b4bb273e0b70' THEN '2b3d55bf-effe-4866-ab49-ecacd2d08303'
  END,
  na.id,
  e.name,
  e.venue_name,
  e.venue_url,
  e.image_url,
  e.description,
  e.description_centered,
  e.max_bookings_per_friend,
  e.requires_approval,
  e.cancel_deadline_hours_before,
  e.reminder_day_before_enabled,
  e.reminder_hours_before,
  0,
  e.folder_id,
  e.sort_order,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  'single',
  NULL,
  NULL,
  NULL,
  e.confirmation_message_extra,
  e.reminder_message_extra,
  e.og_title,
  e.og_description,
  e.og_image_url,
  e.booking_form_fields,
  e.waitlist_enabled
FROM events e
JOIN line_accounts na ON na.channel_id = '2011633364'
WHERE e.line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND e.id IN (
    '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
    '4abc509c-ac26-4279-9810-b4bb273e0b70'
  )
  AND na.is_active = 1
  AND na.liff_id IS NOT NULL
  AND na.liff_id <> '';

-- Aizumi: 9 Saturday slots.
INSERT OR IGNORE INTO event_slots (
  id, event_id, starts_at, ends_at, capacity, is_active, sort_order,
  deleted_at, created_at, updated_at, visibility_conditions
)
SELECT
  CASE es.id
    WHEN '461367fe-8103-4272-b688-95de09061f63' THEN 'e11cddcd-4616-4138-ba85-8ba980dfaa39'
    WHEN 'a262f873-8fd0-4c93-9d19-6c4676d3d83d' THEN '46e0f373-d475-49e9-9495-85e77e69e6c0'
    WHEN '8b10c6f3-0acf-4cd2-831c-c20e1028a370' THEN 'baf81503-c90d-474e-8db4-aa7ce86c599b'
    WHEN '25b7fdd5-6be7-40aa-ad4c-74b21b6a788a' THEN '4551c8bd-e354-4179-a208-70eea2cf1f94'
    WHEN '8b539f3e-0441-408d-a586-4d7a32cf19ed' THEN '8bcc67b8-4fb2-4963-b304-65c7133a9cf9'
    WHEN 'b4bc1023-828d-426e-a31d-8b930f49417c' THEN 'aadca99a-ecbc-40b1-8e3f-bd5d6c4e5936'
    WHEN 'f38b1566-c4ff-4ba1-855a-e8a56d8662bd' THEN '465873fc-759c-4332-b93f-9902e2ae6598'
    WHEN '8188e705-1d85-4c4a-aed0-4e7b2c16ea5c' THEN '3aa5773e-3352-4f33-bb4f-e4819dc6752b'
    WHEN '4e7234be-42c3-44f9-8fcf-453b45ec2437' THEN '95969e4b-0cf6-48ff-8f5e-9eb34c3a3a39'
  END,
  '87c62e99-cfe2-4b66-b2bf-220533a14ed7',
  es.starts_at,
  es.ends_at,
  es.capacity,
  es.is_active,
  es.sort_order,
  es.deleted_at,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  es.visibility_conditions
FROM event_slots es
WHERE es.event_id = '4efba7ae-6ff0-4963-b2d6-d638b583ee68'
  AND es.id IN (
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
  AND EXISTS (SELECT 1 FROM events WHERE id = '87c62e99-cfe2-4b66-b2bf-220533a14ed7');

-- University-front classroom: 8 Sunday slots.
INSERT OR IGNORE INTO event_slots (
  id, event_id, starts_at, ends_at, capacity, is_active, sort_order,
  deleted_at, created_at, updated_at, visibility_conditions
)
SELECT
  CASE es.id
    WHEN '921802eb-44c0-4659-94ae-e7a9dd2d6d78' THEN '8f72b62e-08fe-4201-aadc-d0c4317d6db0'
    WHEN 'ae507b8b-9191-4f9e-b086-ea9938273f23' THEN 'cab170a2-f10a-4671-ad8f-3b6f877e6a97'
    WHEN '2836a963-b231-40c1-8298-fb057a990f82' THEN '1291e17e-32fa-4459-9572-2e8c1f549479'
    WHEN '28d23b42-d084-46e6-add3-acc0789b3c89' THEN 'c3a9d655-e097-44f8-8586-07ccc256759c'
    WHEN '1d802e61-f061-4dbe-81e5-6a08fdd5c3d3' THEN '9a96fa30-6d3e-43f4-a528-522a2a1d4d1c'
    WHEN '6cbeefed-0609-486a-a557-14168c62d78f' THEN '82250711-a158-4bb7-9c7f-a4169a4220de'
    WHEN '855f6990-f1fc-4f84-99c8-a378a41edce4' THEN '03a25a2e-66c8-4fec-9c4e-564b90bcfefd'
    WHEN 'ca23af9d-f72a-4753-8bd5-232f23756e9a' THEN 'fd1e22e4-38a9-4470-8c57-8b57c381fc3b'
  END,
  '2b3d55bf-effe-4866-ab49-ecacd2d08303',
  es.starts_at,
  es.ends_at,
  es.capacity,
  es.is_active,
  es.sort_order,
  es.deleted_at,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  es.visibility_conditions
FROM event_slots es
WHERE es.event_id = '4abc509c-ac26-4279-9810-b4bb273e0b70'
  AND es.id IN (
    '921802eb-44c0-4659-94ae-e7a9dd2d6d78',
    'ae507b8b-9191-4f9e-b086-ea9938273f23',
    '2836a963-b231-40c1-8298-fb057a990f82',
    '28d23b42-d084-46e6-add3-acc0789b3c89',
    '1d802e61-f061-4dbe-81e5-6a08fdd5c3d3',
    '6cbeefed-0609-486a-a557-14168c62d78f',
    '855f6990-f1fc-4f84-99c8-a378a41edce4',
    'ca23af9d-f72a-4753-8bd5-232f23756e9a'
  )
  AND EXISTS (SELECT 1 FROM events WHERE id = '2b3d55bf-effe-4866-ab49-ecacd2d08303');

-- ---------------------------------------------------------------------------
-- 6. Activate prepared objects only when every expected row is present.
-- ---------------------------------------------------------------------------
UPDATE scenarios
SET is_active = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = '041a4e2d-8942-4152-86aa-27f033e8388f'
  AND (SELECT COUNT(*) FROM scenario_steps WHERE scenario_id = '041a4e2d-8942-4152-86aa-27f033e8388f') = 4
  AND (SELECT COUNT(*) FROM auto_replies WHERE line_account_id = (SELECT id FROM line_accounts WHERE channel_id = '2011633364') AND id IN (
    'b59418b1-7daf-46ad-bd9b-e0f112e079db','3cdfcac3-7c6c-4195-86fe-591021e08e2c','1e432eb0-d746-4d46-a79d-bb0ad43c5e32','cf9e9ac6-9f64-4183-bdd4-989edf54d6eb','d48ab3e6-67a3-4ece-b208-70c21d1c967b','cdd602c0-2baa-4ab2-bf66-344acd1140c6','6426cdfa-f3ab-4025-aa59-151be5cb2069','98de9061-d189-4986-9921-3d5330b7a1b9','ed27031a-9456-4aa4-a80e-56786f6e55a3','34e18805-4659-4245-a7cf-79944c2e474a','9a33855c-4b5d-40ab-9d84-4e812fe22c9b','af7e1159-9bf0-4b28-972d-5b8d53696837','0626d145-2d0e-430a-a652-cb85c32c6be2'
  )) = 13
  AND (SELECT COUNT(*) FROM event_slots WHERE event_id = '87c62e99-cfe2-4b66-b2bf-220533a14ed7') = 9
  AND (SELECT COUNT(*) FROM event_slots WHERE event_id = '2b3d55bf-effe-4866-ab49-ecacd2d08303') = 8
  AND (SELECT COUNT(*) FROM pool_accounts WHERE pool_id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0' AND is_active = 1) = 1
  AND EXISTS (SELECT 1 FROM automations WHERE id = '58e6ff3c-ea8a-42ed-b197-009aa6a81b92');

UPDATE auto_replies
SET is_active = 1
WHERE id IN (
  'b59418b1-7daf-46ad-bd9b-e0f112e079db','3cdfcac3-7c6c-4195-86fe-591021e08e2c','1e432eb0-d746-4d46-a79d-bb0ad43c5e32','cf9e9ac6-9f64-4183-bdd4-989edf54d6eb','d48ab3e6-67a3-4ece-b208-70c21d1c967b','cdd602c0-2baa-4ab2-bf66-344acd1140c6','6426cdfa-f3ab-4025-aa59-151be5cb2069','98de9061-d189-4986-9921-3d5330b7a1b9','ed27031a-9456-4aa4-a80e-56786f6e55a3','34e18805-4659-4245-a7cf-79944c2e474a','9a33855c-4b5d-40ab-9d84-4e812fe22c9b','af7e1159-9bf0-4b28-972d-5b8d53696837','0626d145-2d0e-430a-a652-cb85c32c6be2'
)
  AND EXISTS (SELECT 1 FROM scenarios WHERE id = '041a4e2d-8942-4152-86aa-27f033e8388f' AND is_active = 1);

UPDATE automations
SET is_active = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = '58e6ff3c-ea8a-42ed-b197-009aa6a81b92'
  AND EXISTS (SELECT 1 FROM scenarios WHERE id = '041a4e2d-8942-4152-86aa-27f033e8388f' AND is_active = 1);

UPDATE events
SET is_published = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN (
  '87c62e99-cfe2-4b66-b2bf-220533a14ed7',
  '2b3d55bf-effe-4866-ab49-ecacd2d08303'
)
  AND EXISTS (SELECT 1 FROM scenarios WHERE id = '041a4e2d-8942-4152-86aa-27f033e8388f' AND is_active = 1);

-- ---------------------------------------------------------------------------
-- 7. Atomic public cutover (the final mutation in this file).
-- ---------------------------------------------------------------------------
UPDATE entry_routes
SET pool_id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0',
    scenario_id = '041a4e2d-8942-4152-86aa-27f033e8388f',
    tag_id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85',
    run_account_friend_add_scenarios = 0,
    is_active = 1,
    updated_at = datetime('now')
WHERE id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d'
  AND ref_code = 'tokushima-kids-english-2026'
  AND tag_id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85'
  AND (
    pool_id = '797187dd-0dc6-46aa-bebc-8cbe3205a73e'
    OR pool_id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0'
  )
  AND (
    scenario_id IS NULL
    OR scenario_id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f'
    OR scenario_id = '041a4e2d-8942-4152-86aa-27f033e8388f'
  )
  AND EXISTS (
    SELECT 1 FROM line_accounts
    WHERE channel_id = '2011633364'
      AND is_active = 1
      AND liff_id IS NOT NULL
      AND liff_id <> ''
  )
  AND EXISTS (SELECT 1 FROM scenarios WHERE id = '041a4e2d-8942-4152-86aa-27f033e8388f' AND is_active = 1)
  AND EXISTS (SELECT 1 FROM automations WHERE id = '58e6ff3c-ea8a-42ed-b197-009aa6a81b92' AND is_active = 1)
  AND (SELECT COUNT(*) FROM auto_replies WHERE line_account_id = (SELECT id FROM line_accounts WHERE channel_id = '2011633364') AND is_active = 1 AND id IN (
    'b59418b1-7daf-46ad-bd9b-e0f112e079db','3cdfcac3-7c6c-4195-86fe-591021e08e2c','1e432eb0-d746-4d46-a79d-bb0ad43c5e32','cf9e9ac6-9f64-4183-bdd4-989edf54d6eb','d48ab3e6-67a3-4ece-b208-70c21d1c967b','cdd602c0-2baa-4ab2-bf66-344acd1140c6','6426cdfa-f3ab-4025-aa59-151be5cb2069','98de9061-d189-4986-9921-3d5330b7a1b9','ed27031a-9456-4aa4-a80e-56786f6e55a3','34e18805-4659-4245-a7cf-79944c2e474a','9a33855c-4b5d-40ab-9d84-4e812fe22c9b','af7e1159-9bf0-4b28-972d-5b8d53696837','0626d145-2d0e-430a-a652-cb85c32c6be2'
  )) = 13
  AND (SELECT COUNT(*) FROM event_slots WHERE event_id = '87c62e99-cfe2-4b66-b2bf-220533a14ed7') = 9
  AND (SELECT COUNT(*) FROM event_slots WHERE event_id = '2b3d55bf-effe-4866-ab49-ecacd2d08303') = 8
  AND (SELECT COUNT(*) FROM event_bookings WHERE event_id IN ('87c62e99-cfe2-4b66-b2bf-220533a14ed7','2b3d55bf-effe-4866-ab49-ecacd2d08303')) = 0
  AND (SELECT COUNT(*) FROM pool_accounts WHERE pool_id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0' AND is_active = 1) = 1;

-- ---------------------------------------------------------------------------
-- Read-only verification queries (safe to run separately after execution)
-- ---------------------------------------------------------------------------
-- SELECT id, name, channel_id, is_active, login_channel_id, liff_id
-- FROM line_accounts WHERE channel_id = '2011633364';
--
-- SELECT er.id, er.ref_code, er.tag_id, er.scenario_id, er.pool_id, er.is_active,
--        er.run_account_friend_add_scenarios
-- FROM entry_routes er WHERE er.id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d';
--
-- SELECT tp.id, tp.slug, tp.active_account_id, tp.is_active,
--        COUNT(pa.id) AS active_members
-- FROM traffic_pools tp
-- LEFT JOIN pool_accounts pa ON pa.pool_id = tp.id AND pa.is_active = 1
-- WHERE tp.id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0'
-- GROUP BY tp.id;
--
-- SELECT s.id, s.line_account_id, s.is_active, COUNT(ss.id) AS steps
-- FROM scenarios s LEFT JOIN scenario_steps ss ON ss.scenario_id = s.id
-- WHERE s.id = '041a4e2d-8942-4152-86aa-27f033e8388f'
-- GROUP BY s.id;
--
-- SELECT e.id, e.line_account_id, e.is_published, e.requires_approval,
--        e.waitlist_enabled, COUNT(es.id) AS slots
-- FROM events e LEFT JOIN event_slots es ON es.event_id = e.id
-- WHERE e.id IN ('87c62e99-cfe2-4b66-b2bf-220533a14ed7','2b3d55bf-effe-4866-ab49-ecacd2d08303')
-- GROUP BY e.id ORDER BY e.id;
--
-- -- Legacy history invariant: this must still report the existing old booking.
-- SELECT eb.id, eb.event_id, eb.slot_id, eb.friend_id, eb.status
-- FROM event_bookings eb
-- WHERE eb.id = '26786a9e-102c-447f-95c4-c9091220923e';
--
-- PRAGMA foreign_key_check;
