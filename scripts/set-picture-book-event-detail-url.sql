-- 2026秋冬「英語絵本イベント」予約画面から、レッスン詳細LPへ戻る導線。
-- 055_event_detail_url.sql 適用後に実行する。

UPDATE events
SET detail_url = 'https://ecc-preschool-autumn-events.vercel.app/',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND deleted_at IS NULL;
