-- 2026秋冬 英語絵本イベント 北島中央教室追加: 非PII検証
-- setup-kitajima-picture-book-autumn-2026.sql の適用前・適用後のどちらでも実行できる。
-- 個人名、LINE user ID、電話番号、回答本文は出力しない。

-- フォーム構造と回答件数（回答内容は表示しない）
SELECT
  f.id,
  f.name,
  f.is_active,
  f.submit_count,
  json_valid(f.fields) AS fields_json_valid,
  json_array_length(f.fields) AS field_count,
  COALESCE((
    SELECT json_group_array(value)
    FROM json_each(json_extract(field.value, '$.options'))
  ), '[]') AS campus_options,
  (SELECT COUNT(*) FROM form_submissions fs WHERE fs.form_id = f.id) AS stored_submission_count
FROM forms f
LEFT JOIN json_each(f.fields) AS field
  ON json_extract(field.value, '$.name') = 'q6'
WHERE f.id = '35a30337-84ce-4ba7-916c-c5ee86a3a7dd';

-- イベント定義、会場選択肢、全予約枠数
SELECT
  e.id,
  e.name,
  e.venue_name,
  e.max_bookings_per_friend,
  e.is_published,
  json_valid(e.booking_form_fields) AS booking_fields_json_valid,
  json_extract(e.booking_form_fields, '$[0].id') AS campus_field_id,
  json_extract(e.booking_form_fields, '$[0].options') AS campus_options,
  (SELECT COUNT(*) FROM event_slots s WHERE s.event_id = e.id AND s.deleted_at IS NULL) AS total_slot_count,
  (SELECT COUNT(*) FROM event_bookings b WHERE b.event_id = e.id) AS total_booking_count
FROM events e
WHERE e.id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
ORDER BY e.sort_order;

-- 北島中央枠は各イベント9件、全件 active/capacity=3、指定時刻であること
SELECT
  e.id AS event_id,
  e.name AS event_name,
  COUNT(*) AS kitajima_slot_count,
  SUM(CASE WHEN s.is_active = 1 THEN 1 ELSE 0 END) AS active_slot_count,
  SUM(CASE WHEN s.capacity = 3 THEN 1 ELSE 0 END) AS capacity_three_count,
  MIN(s.starts_at) AS first_slot_utc,
  MAX(s.starts_at) AS last_slot_utc,
  GROUP_CONCAT(substr(s.starts_at, 1, 10), ',') AS dates_utc
FROM events e
JOIN event_slots s ON s.event_id = e.id
WHERE e.id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
  AND s.deleted_at IS NULL
  AND json_valid(s.visibility_conditions) = 1
  AND EXISTS (
    SELECT 1
    FROM json_each(json_extract(s.visibility_conditions, '$.conditions[0].values'))
    WHERE value = '北島中央教室（北島町）'
  )
GROUP BY e.id, e.name
ORDER BY e.sort_order;

-- 固定UUID18件がすべて存在し、論理重複（同イベント・同時刻・北島中央）がないこと
SELECT
  COUNT(*) AS fixed_slot_id_count,
  COUNT(DISTINCT event_id || '|' || starts_at) AS distinct_event_time_count
FROM event_slots
WHERE id IN (
  'e374746e-16d3-4aad-8cdb-d2edf1aab9ea',
  'a3aa82cc-81f1-4158-a6d4-2c06a1dde84f',
  'aa1adbcb-7647-48ac-a72a-654b31436d68',
  '82efcb20-8c60-4641-8d9b-127763b57cc0',
  '1bd6a89d-fec1-4d54-a815-1537addaf5ec',
  'fb3687b7-66e9-4100-a096-25beedc70766',
  'e3fc4cd4-9a36-4b1d-9802-6fbaf509b508',
  '648397e2-a6cd-4e4e-b75d-6289c4a45608',
  'd035346e-d0bc-4437-ad5b-e4749830576a',
  '8b0eefbf-b133-4a1d-9bca-45c52ace1be5',
  'da30ef13-9813-4696-a8e6-c52d6b033d9e',
  '5a5a9ea2-8149-45f6-bd11-bfe7d2a479fe',
  'b5d4a4fa-db24-4c53-b6e8-0d8aa1778e9d',
  '17681b1f-f35e-405e-8711-eb06a0a0b03b',
  '407c6c6d-169a-4400-8e18-f8b452773068',
  'b1c4a4cc-9bd3-4a3a-ac5f-090935a8804b',
  '6713b2e0-4ff1-401d-8e32-77fe653e5e72',
  '2a5ad756-1c70-4395-ba1e-563744793f91'
);

SELECT
  event_id,
  starts_at,
  COUNT(*) AS duplicate_count
FROM event_slots
WHERE deleted_at IS NULL
  AND event_id IN (
    '887d5545-7b60-425d-9c24-91d36e84d1ed',
    'dec4cc02-3d28-41d0-a725-642a1364dafd'
  )
  AND visibility_conditions LIKE '%北島中央教室（北島町）%'
GROUP BY event_id, starts_at
HAVING COUNT(*) > 1;

-- 旧「2教室のみ」または午前一律の案内が残っていないこと（適用後はすべて0）
SELECT 'events' AS source, COUNT(*) AS stale_row_count
FROM events
WHERE id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
  AND (
    venue_name = 'ECCジュニア藍住教室／大学前教室（予約時に選択）'
    OR booking_form_fields NOT LIKE '%北島中央教室（北島町）%'
  )
UNION ALL
SELECT 'scenario_steps', COUNT(*)
FROM scenario_steps
WHERE id IN (
  'a84a5fa2-a5ae-4192-9344-ecf56f4700b9',
  'e7dddf55-7d63-4cd0-a725-6e165ae7772c'
)
  AND message_content NOT LIKE '%北島中央%'
UNION ALL
SELECT 'auto_replies', COUNT(*)
FROM auto_replies
WHERE id IN (
  '19fffe9c-288d-48e5-af8c-5dfae0f2ac3f',
  '56774ad3-d21d-4ddd-851f-315d46bbb73a',
  '3cdadf30-be52-4e04-af4c-38d8db37f137',
  '9ad98fd2-e278-45c5-9cb6-bce7e00ccef5'
)
  AND response_content NOT LIKE '%北島中央%';

-- 予約はステータス別件数だけを確認し、既存データが維持されていることを比較する。
SELECT event_id, status, COUNT(*) AS booking_count
FROM event_bookings
WHERE event_id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
GROUP BY event_id, status
ORDER BY event_id, status;
