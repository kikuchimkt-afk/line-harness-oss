-- 英語絵本イベントLPの流入タグが新規付与された友だちへ、
-- 秋イベント用リッチメニューを自動表示する。
--
-- This script is idempotent: the fixed automation id is updated on rerun.
-- Apply only after the Worker version that supports tag action matching and
-- LINE account/token resolution has been deployed.

INSERT INTO automations (
  id,
  name,
  description,
  event_type,
  conditions,
  actions,
  line_account_id,
  is_active,
  priority,
  created_at,
  updated_at
)
SELECT
  'b62d4a74-9acc-44c6-9541-10eb976b069a',
  '英語絵本LP流入｜専用リッチメニュー表示',
  '英語絵本イベントLPの流入タグが新規付与された方へ、秋イベント用リッチメニューを表示します。',
  'tag_change',
  '{"tag_id":"8b69ede5-74f4-464b-82f4-642418725e16","action":"add"}',
  '[{"type":"switch_rich_menu","params":{"richMenuId":"richmenu-efaed2af0fc5cada7002923887b3cc0a"}}]',
  '0797696f-e377-4132-bb17-77bc1db29b0a',
  1,
  100,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE EXISTS (
  SELECT 1
  FROM line_accounts
  WHERE id = '0797696f-e377-4132-bb17-77bc1db29b0a'
    AND is_active = 1
)
AND EXISTS (
  SELECT 1
  FROM tags
  WHERE id = '8b69ede5-74f4-464b-82f4-642418725e16'
    AND name = '2026秋冬・英語絵本イベントチラシ経由'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  event_type = excluded.event_type,
  conditions = excluded.conditions,
  actions = excluded.actions,
  line_account_id = excluded.line_account_id,
  is_active = excluded.is_active,
  priority = excluded.priority,
  updated_at = excluded.updated_at;

SELECT
  id,
  name,
  event_type,
  conditions,
  actions,
  line_account_id,
  is_active,
  priority
FROM automations
WHERE id = 'b62d4a74-9acc-44c6-9541-10eb976b069a';
