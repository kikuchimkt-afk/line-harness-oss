-- 英検集中講座（2026年9月1日〜10月2日）
-- 期間中は複数枠を選択でき、予約回数に上限を設けない。

INSERT INTO events (
  id,
  line_account_id,
  name,
  venue_name,
  description,
  description_centered,
  max_bookings_per_friend,
  requires_approval,
  cancel_deadline_hours_before,
  reminder_day_before_enabled,
  reminder_hours_before,
  is_published,
  sort_order,
  target_type,
  booking_form_fields,
  confirmation_message_extra
) VALUES (
  'eiken-intensive-2026-autumn',
  'e1f32fe7-1787-4f3d-a8bc-9a528a1d842e',
  '英検集中講座｜開講日程予約',
  'ベストワン藍住校・北島中央校',
  '2026年9月1日から10月2日までの英検集中講座です。\n期間中は受講回数の上限なく、参加したい日時を複数選択できます。\n\n火曜日・金曜日　16:00〜18:00\n土曜日　14:30〜16:30',
  0,
  NULL,
  1,
  48,
  1,
  1,
  1,
  0,
  'single',
  '[{"id":"student_name","label":"受講者氏名","type":"text","required":true,"placeholder":"例：山田 太郎"},{"id":"grade","label":"学年","type":"select","required":true,"options":["中1","中2","中3","高1","高2","高3","その他"]},{"id":"campus","label":"受講校舎","type":"select","required":true,"options":["藍住校","北島中央校"]},{"id":"note","label":"教室へ伝えておきたいこと","type":"textarea","required":false,"placeholder":"必要があればご記入ください"}]',
  'ご予約ありがとうございます。期間中は受講回数の上限なく、同じ予約画面から日程を追加できます。変更がある場合は、予約履歴からキャンセル後、あらためてご予約ください。'
)
ON CONFLICT(id) DO UPDATE SET
  line_account_id = excluded.line_account_id,
  name = excluded.name,
  venue_name = excluded.venue_name,
  description = excluded.description,
  description_centered = excluded.description_centered,
  max_bookings_per_friend = excluded.max_bookings_per_friend,
  requires_approval = excluded.requires_approval,
  cancel_deadline_hours_before = excluded.cancel_deadline_hours_before,
  reminder_day_before_enabled = excluded.reminder_day_before_enabled,
  reminder_hours_before = excluded.reminder_hours_before,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order,
  target_type = excluded.target_type,
  booking_form_fields = excluded.booking_form_fields,
  confirmation_message_extra = excluded.confirmation_message_extra,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');

INSERT INTO event_slots (id, event_id, starts_at, ends_at, capacity, is_active, sort_order)
VALUES
  ('eiken-20260901-1600', 'eiken-intensive-2026-autumn', '2026-09-01T07:00:00.000Z', '2026-09-01T09:00:00.000Z', NULL, 1, 1),
  ('eiken-20260904-1600', 'eiken-intensive-2026-autumn', '2026-09-04T07:00:00.000Z', '2026-09-04T09:00:00.000Z', NULL, 1, 2),
  ('eiken-20260905-1430', 'eiken-intensive-2026-autumn', '2026-09-05T05:30:00.000Z', '2026-09-05T07:30:00.000Z', NULL, 1, 3),
  ('eiken-20260908-1600', 'eiken-intensive-2026-autumn', '2026-09-08T07:00:00.000Z', '2026-09-08T09:00:00.000Z', NULL, 1, 4),
  ('eiken-20260911-1600', 'eiken-intensive-2026-autumn', '2026-09-11T07:00:00.000Z', '2026-09-11T09:00:00.000Z', NULL, 1, 5),
  ('eiken-20260912-1430', 'eiken-intensive-2026-autumn', '2026-09-12T05:30:00.000Z', '2026-09-12T07:30:00.000Z', NULL, 1, 6),
  ('eiken-20260915-1600', 'eiken-intensive-2026-autumn', '2026-09-15T07:00:00.000Z', '2026-09-15T09:00:00.000Z', NULL, 1, 7),
  ('eiken-20260918-1600', 'eiken-intensive-2026-autumn', '2026-09-18T07:00:00.000Z', '2026-09-18T09:00:00.000Z', NULL, 1, 8),
  ('eiken-20260919-1430', 'eiken-intensive-2026-autumn', '2026-09-19T05:30:00.000Z', '2026-09-19T07:30:00.000Z', NULL, 1, 9),
  ('eiken-20260922-1600', 'eiken-intensive-2026-autumn', '2026-09-22T07:00:00.000Z', '2026-09-22T09:00:00.000Z', NULL, 1, 10),
  ('eiken-20260925-1600', 'eiken-intensive-2026-autumn', '2026-09-25T07:00:00.000Z', '2026-09-25T09:00:00.000Z', NULL, 1, 11),
  ('eiken-20260926-1430', 'eiken-intensive-2026-autumn', '2026-09-26T05:30:00.000Z', '2026-09-26T07:30:00.000Z', NULL, 1, 12),
  ('eiken-20260929-1600', 'eiken-intensive-2026-autumn', '2026-09-29T07:00:00.000Z', '2026-09-29T09:00:00.000Z', NULL, 1, 13),
  ('eiken-20261002-1600', 'eiken-intensive-2026-autumn', '2026-10-02T07:00:00.000Z', '2026-10-02T09:00:00.000Z', NULL, 1, 14)
ON CONFLICT(id) DO UPDATE SET
  event_id = excluded.event_id,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  capacity = excluded.capacity,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');
