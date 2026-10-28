-- Read-only preflight for migrate-tokushima-presentation-to-ecc-events.sql.
-- This file contains SELECT/PRAGMA statements only and is safe to run against
-- production before the target account has been configured.

SELECT
  id,
  channel_id,
  name,
  is_active,
  CASE WHEN channel_access_token IS NOT NULL AND length(channel_access_token) > 0 THEN 1 ELSE 0 END AS has_messaging_token,
  CASE WHEN channel_secret IS NOT NULL AND length(channel_secret) > 0 THEN 1 ELSE 0 END AS has_messaging_secret,
  CASE WHEN login_channel_id IS NOT NULL AND length(login_channel_id) > 0 THEN 1 ELSE 0 END AS has_login_channel,
  CASE WHEN login_channel_secret IS NOT NULL AND length(login_channel_secret) > 0 THEN 1 ELSE 0 END AS has_login_secret,
  CASE WHEN liff_id IS NOT NULL AND length(liff_id) > 0 THEN 1 ELSE 0 END AS has_liff
FROM line_accounts
WHERE channel_id = '2011633364';

SELECT
  id,
  ref_code,
  tag_id,
  scenario_id,
  pool_id,
  is_active,
  run_account_friend_add_scenarios
FROM entry_routes
WHERE id = '7bb2e21c-3972-4bc1-86b6-a7218ee8618d';

SELECT
  s.id,
  s.line_account_id,
  s.trigger_type,
  s.delivery_mode,
  s.is_active,
  COUNT(ss.id) AS step_count
FROM scenarios s
LEFT JOIN scenario_steps ss ON ss.scenario_id = s.id
WHERE s.id = '88a7c223-059b-4ee2-bbe4-61cb8c05165f'
GROUP BY s.id;

SELECT
  COUNT(*) AS explicit_project_reply_count,
  SUM(CASE WHEN line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a' THEN 1 ELSE 0 END) AS on_expected_old_account
FROM auto_replies
WHERE id IN (
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

SELECT id, line_account_id, event_type, is_active, priority
FROM automations
WHERE id = '1a51f12a-a624-4d98-a346-0e158e7096ee';

SELECT
  e.id,
  e.line_account_id,
  e.is_published,
  e.requires_approval,
  e.waitlist_enabled,
  e.max_bookings_per_friend,
  COUNT(DISTINCT es.id) AS slot_count,
  COUNT(DISTINCT eb.id) AS booking_count
FROM events e
LEFT JOIN event_slots es ON es.event_id = e.id
LEFT JOIN event_bookings eb ON eb.event_id = e.id
WHERE e.id IN (
  '4efba7ae-6ff0-4963-b2d6-d638b583ee68',
  '4abc509c-ac26-4279-9810-b4bb273e0b70'
)
GROUP BY e.id
ORDER BY e.id;

SELECT id, event_id, slot_id, friend_id, status
FROM event_bookings
WHERE id = '26786a9e-102c-447f-95c4-c9091220923e';

SELECT tp.id, tp.slug, tp.active_account_id, tp.is_active,
       COUNT(pa.id) AS member_count,
       SUM(CASE WHEN pa.is_active = 1 THEN 1 ELSE 0 END) AS active_member_count
FROM traffic_pools tp
LEFT JOIN pool_accounts pa ON pa.pool_id = tp.id
WHERE tp.id = '797187dd-0dc6-46aa-bebc-8cbe3205a73e'
GROUP BY tp.id;

SELECT id, name, color
FROM tags
WHERE id = 'a5a4ccaf-7774-4af5-9d20-2c0a3ebd3c85';

-- All fixed target IDs must either be absent (first run) or belong to an
-- already-completed retry of this same migration.
SELECT 'traffic_pools' AS object_type, id
FROM traffic_pools
WHERE id = 'fbbfb4b8-89e1-482b-b68b-c8857f639ab0'
UNION ALL
SELECT 'scenarios', id
FROM scenarios
WHERE id = '041a4e2d-8942-4152-86aa-27f033e8388f'
UNION ALL
SELECT 'automations', id
FROM automations
WHERE id = '58e6ff3c-ea8a-42ed-b197-009aa6a81b92'
UNION ALL
SELECT 'events', id
FROM events
WHERE id IN (
  '87c62e99-cfe2-4b66-b2bf-220533a14ed7',
  '2b3d55bf-effe-4866-ab49-ecacd2d08303'
);

SELECT tp.id AS main_pool_id, pa.id AS membership_id, pa.is_active
FROM traffic_pools tp
JOIN pool_accounts pa ON pa.pool_id = tp.id
JOIN line_accounts la ON la.id = pa.line_account_id
WHERE tp.slug = 'main'
  AND la.channel_id = '2011633364';

PRAGMA foreign_key_check;
