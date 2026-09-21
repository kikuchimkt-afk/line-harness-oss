-- 2026秋冬「英語絵本イベント」確定日程の本番同期
-- 対象: 公式LINE「あいことば」
-- 根拠: 2026-09-21受領の最新A3両面チラシ
--
-- 方針
--   * 幼児（2〜5歳） 11:00〜11:40 と 小学生低学年 11:50〜12:30 を分ける。
--   * 会場は予約フォームの必須選択と slot.visibility_conditions で絞り込む。
--   * 12/5は開催日確定。ただしチラシで会場・定員が「調整中」のため、予約枠はまだ公開しない。
--   * LINE登録のみでは参加確定にせず、全予約をスタッフ確認後に確定する。
--   * 旧4〜5歳・午後の仮イベントは履歴保持のため削除せず、非公開にする。

-- ---------------------------------------------------------------------------
-- 0. 更新中の新規流入を止める
-- ---------------------------------------------------------------------------

UPDATE events
SET is_published = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  '43b6af40-0884-4a2f-a3ca-b6e7632af4d1',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

-- ---------------------------------------------------------------------------
-- 1. 幼児イベントを確定版へ更新
-- ---------------------------------------------------------------------------

UPDATE events
SET name = '幼児｜土曜・英語絵本イベント（2026秋冬）',
    venue_name = 'ECCジュニア藍住教室／大学前教室（予約時に選択）',
    venue_url = NULL,
    image_url = 'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.webp',
    description = '英語が初めてのお子さまも安心して参加できる、40分・1回完結型の少人数イベントです。
英語絵本、歌、手遊び、活動やゲームを通して、遊びながら英語の音とことばにふれます。1回だけ、または途中の回からでも参加できます。

【対象】幼児（2歳児〜5歳児）
【時間】11:00〜11:40
【会場】ECCジュニア藍住教室／大学前教室
【定員】各クラス・各教室3〜5名
【参加費】1回500円程度（予定）／参加回数分のみ
【持ち物】水筒、ハンカチ

【40分の流れ】
Hello & Warm-up 8分 → Song & Fingerplay 8分 → Picture Book 10分 → Activity / Game 14分

【確定日程・会場・テーマ】
10/3　藍住（5名）　Hello, New Friends! / Hello Hello
10/10　大学前（3名）　Color Parade / Brown Bear, Brown Bear, What Do You See?
10/17　藍住（3名）　Move Your Body / From Head to Toe
10/24　大学前（3名）　Busy Autumn / The Busy Little Squirrel
10/31　藍住（5名）　Monster, Go Away! / Go Away, Big Green Monster!
11/7　藍住（3名）　Good Night, Animals / Good Night, Gorilla
11/14　藍住・大学前（各3名）　Hungry Caterpillar / The Very Hungry Caterpillar
11/21　大学前（3名）　How Do You Feel? / The Color Monster
11/28　藍住・大学前（各3名）　Share and Say Please / Should I Share My Ice Cream?
12/5　開催日確定／教室・定員は調整中　Balance Together / Balancing Act
12/12　藍住・大学前（各3名）　Giving Is a Gift / Bear Stays Up for Christmas
12/19　藍住（5名）　Dear Santa / Dear Santa
12/26　大学前（3名）　A Snowy Story / The Snowy Day

予約画面で教室を選ぶと、その教室で受付中の日程と最新の空席が表示されます。12/5は教室・定員確定後に公式LINEで受付開始をご案内します。

※お申込み後、スタッフ確認を経て参加確定となります。LINE登録だけでは参加確定になりません。',
    description_centered = 0,
    max_bookings_per_friend = 13,
    requires_approval = 1,
    waitlist_enabled = 1,
    cancel_deadline_hours_before = 48,
    reminder_day_before_enabled = 1,
    reminder_hours_before = 2,
    confirmation_message_extra = 'お申込みを受け付けました🌿
この時点ではまだ参加確定ではありません。内容と空席をスタッフが確認し、公式LINEで確定をご連絡します。
予約時に選択した教室・日時をご確認ください。開始5分前を目安に、水筒とハンカチをお持ちになってお越しください。',
    reminder_message_extra = '英語絵本イベントが近づいてきました🌿
予約時に選択した教室と開始時刻をご確認ください。水筒とハンカチをご用意いただき、開始5分前を目安にお越しください。体調がすぐれない場合は無理をせず、予約履歴から変更・キャンセルをお願いします。',
    og_title = '【幼児】土曜・英語絵本イベント｜2026秋冬',
    og_description = '英語が初めてでも参加できる40分・1回完結型イベント。藍住・大学前教室、各回3〜5名、1回500円程度（予定）です。',
    og_image_url = 'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.png',
    booking_form_fields = json_array(
      json_object('id', 'field_5637a98b', 'label', '受講希望教室', 'type', 'select', 'required', json('true'), 'placeholder', '教室を選択してください', 'options', json_array('藍住教室（藍住町）', '大学前教室（徳島市）')),
      json_object('id', 'guardian_name', 'label', '保護者さまのお名前', 'type', 'text', 'required', json('true'), 'placeholder', '例：山田 花子'),
      json_object('id', 'child_name', 'label', 'お子さまのお名前（ひらがな）', 'type', 'text', 'required', json('true'), 'placeholder', '例：やまだ はな'),
      json_object('id', 'child_age', 'label', 'お子さまの年齢', 'type', 'select', 'required', json('true'), 'placeholder', '年齢を選択してください', 'options', json_array('2歳児', '3歳児', '4歳児', '5歳児')),
      json_object('id', 'field_3fcbb927', 'label', '当日連絡のつく電話番号', 'type', 'text', 'required', json('true'), 'placeholder', '例：090-1234-5678'),
      json_object('id', 'considerations', 'label', 'アレルギー・配慮事項', 'type', 'textarea', 'required', json('false'), 'placeholder', 'ない場合は入力不要です')
    ),
    sort_order = 10,
    target_type = 'single',
    account_ids = NULL,
    deleted_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '887d5545-7b60-425d-9c24-91d36e84d1ed'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

-- ---------------------------------------------------------------------------
-- 2. 小学生低学年イベントを新設
-- ---------------------------------------------------------------------------

INSERT INTO events (
  id, line_account_id, name, venue_name, venue_url, image_url, description,
  description_centered, max_bookings_per_friend, requires_approval,
  waitlist_enabled, cancel_deadline_hours_before,
  reminder_day_before_enabled, reminder_hours_before,
  confirmation_message_extra, reminder_message_extra,
  is_published, sort_order, target_type, account_ids,
  og_title, og_description, og_image_url, booking_form_fields
) VALUES (
  'dec4cc02-3d28-41d0-a725-642a1364dafd',
  '0797696f-e377-4132-bb17-77bc1db29b0a',
  '小学生低学年｜土曜・英語絵本イベント（2026秋冬）',
  'ECCジュニア藍住教室／大学前教室（予約時に選択）',
  NULL,
  'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.webp',
  '英語絵本、歌、手遊びにゲームを加え、聞いた英語を自分で使う経験へつなげる、40分・1回完結型の少人数イベントです。
予想、質問、短い会話やチームチャレンジを取り入れます。英語が初めてでも、1回だけでも参加できます。

【対象】小学生低学年（小学1〜3年生）
【時間】11:50〜12:30
【会場】ECCジュニア藍住教室／大学前教室
【定員】各クラス・各教室3〜5名
【参加費】1回500円程度（予定）／参加回数分のみ
【持ち物】水筒、ハンカチ

【40分の流れ】
Hello & Warm-up 8分 → Song & Fingerplay 8分 → Picture Book 10分 → Activity / Game 14分

【確定日程・会場・テーマ】
10/3　藍住（5名）　Hello, New Friends! / Hello Hello
10/10　大学前（3名）　Color Parade / Brown Bear, Brown Bear, What Do You See?
10/17　藍住（3名）　Move Your Body / From Head to Toe
10/24　大学前（3名）　Busy Autumn / The Busy Little Squirrel
10/31　藍住（5名）　Monster, Go Away! / Go Away, Big Green Monster!
11/7　藍住（3名）　Good Night, Animals / Good Night, Gorilla
11/14　藍住・大学前（各3名）　Hungry Caterpillar / The Very Hungry Caterpillar
11/21　大学前（3名）　How Do You Feel? / The Color Monster
11/28　藍住・大学前（各3名）　Share and Say Please / Should I Share My Ice Cream?
12/5　開催日確定／教室・定員は調整中　Balance Together / Balancing Act
12/12　藍住・大学前（各3名）　Giving Is a Gift / Bear Stays Up for Christmas
12/19　藍住（5名）　Dear Santa / Dear Santa
12/26　大学前（3名）　A Snowy Story / The Snowy Day

予約画面で教室を選ぶと、その教室で受付中の日程と最新の空席が表示されます。12/5は教室・定員確定後に公式LINEで受付開始をご案内します。

※お申込み後、スタッフ確認を経て参加確定となります。LINE登録だけでは参加確定になりません。',
  0,
  13,
  1,
  1,
  48,
  1,
  2,
  'お申込みを受け付けました🌿
この時点ではまだ参加確定ではありません。内容と空席をスタッフが確認し、公式LINEで確定をご連絡します。
予約時に選択した教室・日時をご確認ください。開始5分前を目安に、水筒とハンカチをお持ちになってお越しください。',
  '英語絵本イベントが近づいてきました🌿
予約時に選択した教室と開始時刻をご確認ください。水筒とハンカチをご用意いただき、開始5分前を目安にお越しください。体調がすぐれない場合は無理をせず、予約履歴から変更・キャンセルをお願いします。',
  0,
  20,
  'single',
  NULL,
  '【小学生低学年】土曜・英語絵本イベント｜2026秋冬',
  '絵本・歌・ゲームから英語を使う体験へつなげる40分。藍住・大学前教室、各回3〜5名、1回500円程度（予定）です。',
  'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.png',
  json_array(
    json_object('id', 'field_5637a98b', 'label', '受講希望教室', 'type', 'select', 'required', json('true'), 'placeholder', '教室を選択してください', 'options', json_array('藍住教室（藍住町）', '大学前教室（徳島市）')),
    json_object('id', 'guardian_name', 'label', '保護者さまのお名前', 'type', 'text', 'required', json('true'), 'placeholder', '例：山田 花子'),
    json_object('id', 'child_name', 'label', 'お子さまのお名前（ひらがな）', 'type', 'text', 'required', json('true'), 'placeholder', '例：やまだ はな'),
    json_object('id', 'child_age', 'label', 'お子さまの学年', 'type', 'select', 'required', json('true'), 'placeholder', '学年を選択してください', 'options', json_array('小学1年生', '小学2年生', '小学3年生')),
    json_object('id', 'field_3fcbb927', 'label', '当日連絡のつく電話番号', 'type', 'text', 'required', json('true'), 'placeholder', '例：090-1234-5678'),
    json_object('id', 'considerations', 'label', 'アレルギー・配慮事項', 'type', 'textarea', 'required', json('false'), 'placeholder', 'ない場合は入力不要です')
  )
)
ON CONFLICT(id) DO UPDATE SET
  line_account_id = excluded.line_account_id,
  name = excluded.name,
  venue_name = excluded.venue_name,
  venue_url = excluded.venue_url,
  image_url = excluded.image_url,
  description = excluded.description,
  description_centered = excluded.description_centered,
  max_bookings_per_friend = excluded.max_bookings_per_friend,
  requires_approval = excluded.requires_approval,
  waitlist_enabled = excluded.waitlist_enabled,
  cancel_deadline_hours_before = excluded.cancel_deadline_hours_before,
  reminder_day_before_enabled = excluded.reminder_day_before_enabled,
  reminder_hours_before = excluded.reminder_hours_before,
  confirmation_message_extra = excluded.confirmation_message_extra,
  reminder_message_extra = excluded.reminder_message_extra,
  is_published = 0,
  sort_order = excluded.sort_order,
  target_type = excluded.target_type,
  account_ids = excluded.account_ids,
  og_title = excluded.og_title,
  og_description = excluded.og_description,
  og_image_url = excluded.og_image_url,
  booking_form_fields = excluded.booking_form_fields,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- ---------------------------------------------------------------------------
-- 3. 旧枠を停止し、チラシと一致する15枠×2クラスを登録
-- ---------------------------------------------------------------------------

UPDATE event_slots
SET is_active = 0,
    deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE event_id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  '43b6af40-0884-4a2f-a3ca-b6e7632af4d1',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
  AND (is_active <> 0 OR deleted_at IS NULL);

-- 幼児 11:00〜11:40（JST）
INSERT INTO event_slots (
  id, event_id, starts_at, ends_at, capacity, is_active, sort_order, visibility_conditions
) VALUES
  ('04df967c-2284-4a69-b95a-9a893f6098d9', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-10-03T02:00:00.000Z', '2026-10-03T02:40:00.000Z', 5, 1, 1,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('888c88c0-0251-4c2b-9c90-e2a558dade84', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-10-10T02:00:00.000Z', '2026-10-10T02:40:00.000Z', 3, 1, 2,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('a62d531f-36e2-4aac-b8b1-dda29ca1c5ec', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-10-17T02:00:00.000Z', '2026-10-17T02:40:00.000Z', 3, 1, 3,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('f942cad1-5c40-4429-ba9d-67e2a464277a', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-10-24T02:00:00.000Z', '2026-10-24T02:40:00.000Z', 3, 1, 4,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('5b0d8b8a-fab4-4f35-a00b-9b2d22cd6e69', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-10-31T02:00:00.000Z', '2026-10-31T02:40:00.000Z', 5, 1, 5,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('a0c9907a-1112-4695-b87b-7c652cb95c6f', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-07T02:00:00.000Z', '2026-11-07T02:40:00.000Z', 3, 1, 6,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('e6a1949a-d22a-42a9-a675-a71b5099aafa', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-14T02:00:00.000Z', '2026-11-14T02:40:00.000Z', 3, 1, 7,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('00e535f6-9be3-4fb1-931b-a69539856c7a', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-14T02:00:00.000Z', '2026-11-14T02:40:00.000Z', 3, 1, 8,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('a872cda3-513d-4d9d-b5c2-97631b70f77d', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-21T02:00:00.000Z', '2026-11-21T02:40:00.000Z', 3, 1, 9,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('f86b6e85-11d2-4a54-ab29-33c039fcd395', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-28T02:00:00.000Z', '2026-11-28T02:40:00.000Z', 3, 1, 10, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('210478f2-fa9d-40f2-99cf-d547c6c0fdf9', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-28T02:00:00.000Z', '2026-11-28T02:40:00.000Z', 3, 1, 11, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('5bfaad5a-98a9-4e2f-89c7-a64c555cbee5', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-12-12T02:00:00.000Z', '2026-12-12T02:40:00.000Z', 3, 1, 12, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('012f4223-df7d-451f-92b1-2beb268ea6a8', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-12-12T02:00:00.000Z', '2026-12-12T02:40:00.000Z', 3, 1, 13, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('5598ff93-ae2c-4cb5-bc97-90e1a16e232f', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-12-19T02:00:00.000Z', '2026-12-19T02:40:00.000Z', 5, 1, 14, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('257219bf-c17d-477c-8f78-d5bf72e0423f', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-12-26T02:00:00.000Z', '2026-12-26T02:40:00.000Z', 3, 1, 15, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）')))))
ON CONFLICT(id) DO UPDATE SET
  event_id = excluded.event_id,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  capacity = excluded.capacity,
  is_active = 1,
  sort_order = excluded.sort_order,
  visibility_conditions = excluded.visibility_conditions,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- 小学生低学年 11:50〜12:30（JST）
INSERT INTO event_slots (
  id, event_id, starts_at, ends_at, capacity, is_active, sort_order, visibility_conditions
) VALUES
  ('be9e872f-c8b4-491c-9d13-031eb6f2a68b', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-10-03T02:50:00.000Z', '2026-10-03T03:30:00.000Z', 5, 1, 1,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('237997f5-2247-4efb-8472-a86d2d69bb3d', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-10-10T02:50:00.000Z', '2026-10-10T03:30:00.000Z', 3, 1, 2,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('472604db-e265-4f49-b46f-0509ed6e109d', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-10-17T02:50:00.000Z', '2026-10-17T03:30:00.000Z', 3, 1, 3,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('b679d96e-ea31-4317-b1ca-fbd49b298974', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-10-24T02:50:00.000Z', '2026-10-24T03:30:00.000Z', 3, 1, 4,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('7da63c8b-861c-4f28-9670-8e8320fc4b78', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-10-31T02:50:00.000Z', '2026-10-31T03:30:00.000Z', 5, 1, 5,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('a0bdee20-5ae6-4966-8c1a-846c6f038b23', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-07T02:50:00.000Z', '2026-11-07T03:30:00.000Z', 3, 1, 6,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('b98d6de6-24a8-47d1-8b95-aa0aa2c4530b', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-14T02:50:00.000Z', '2026-11-14T03:30:00.000Z', 3, 1, 7,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('188c8d14-2a51-4a64-ad47-9f07c478d25e', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-14T02:50:00.000Z', '2026-11-14T03:30:00.000Z', 3, 1, 8,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('523e8958-c5fd-4921-ab49-21878cc9e43f', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-21T02:50:00.000Z', '2026-11-21T03:30:00.000Z', 3, 1, 9,  json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('adba709a-8871-4b14-803c-ea74f89e26b0', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-28T02:50:00.000Z', '2026-11-28T03:30:00.000Z', 3, 1, 10, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('d29363fb-5711-4725-a3a6-836054605abb', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-28T02:50:00.000Z', '2026-11-28T03:30:00.000Z', 3, 1, 11, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('a0e4d879-2ff3-465c-8eb3-aadd78f3c076', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-12-12T02:50:00.000Z', '2026-12-12T03:30:00.000Z', 3, 1, 12, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('d60ac16e-43c5-433b-9ed9-a369c127b7df', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-12-12T02:50:00.000Z', '2026-12-12T03:30:00.000Z', 3, 1, 13, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）'))))),
  ('56d9073d-d261-4f90-a2bd-c09d4c0cbca8', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-12-19T02:50:00.000Z', '2026-12-19T03:30:00.000Z', 5, 1, 14, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('藍住教室（藍住町）'))))),
  ('159e7503-4a3d-45de-82a7-9b73a2e63d6d', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-12-26T02:50:00.000Z', '2026-12-26T03:30:00.000Z', 3, 1, 15, json_object('logic','and','conditions',json_array(json_object('fieldId','field_5637a98b','operator','in','values',json_array('大学前教室（徳島市）')))))
ON CONFLICT(id) DO UPDATE SET
  event_id = excluded.event_id,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  capacity = excluded.capacity,
  is_active = 1,
  sort_order = excluded.sort_order,
  visibility_conditions = excluded.visibility_conditions,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- 旧4〜5歳・午後の仮イベントは履歴を残して受付終了
UPDATE events
SET is_published = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '43b6af40-0884-4a2f-a3ca-b6e7632af4d1'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

-- ---------------------------------------------------------------------------
-- 4. 年齢・学年回答から予約ページへ自動案内
-- ---------------------------------------------------------------------------

UPDATE automations
SET name = CASE id
      WHEN '79daba95-0a49-4e16-ae26-0bb0d9eaccc3' THEN '英語絵本｜2歳回答→幼児予約案内'
      WHEN '27b0b969-db65-420d-ab7b-7b6f9c7a99f6' THEN '英語絵本｜3歳回答→幼児予約案内'
      WHEN 'dac9ada8-5f21-474f-851b-3790ad56ee37' THEN '英語絵本｜4歳回答→幼児予約案内'
      WHEN '591f30e3-a4c5-4ab6-9bd3-908e1eb8db41' THEN '英語絵本｜5歳回答→幼児予約案内'
    END,
    description = '2026秋冬のチラシ導線で年齢を回答した方へ、幼児イベントの確定日程・空席・予約ページを自動案内します。',
    conditions = json_object('keyword_exact', CASE id
      WHEN '79daba95-0a49-4e16-ae26-0bb0d9eaccc3' THEN '2歳'
      WHEN '27b0b969-db65-420d-ab7b-7b6f9c7a99f6' THEN '3歳'
      WHEN 'dac9ada8-5f21-474f-851b-3790ad56ee37' THEN '4歳'
      WHEN '591f30e3-a4c5-4ab6-9bd3-908e1eb8db41' THEN '5歳'
    END),
    actions = json_array(
      json_object(
        'type', 'set_metadata',
        'params', json_object('data', CASE id
          WHEN '79daba95-0a49-4e16-ae26-0bb0d9eaccc3' THEN '{"child_age":"2歳","event_class":"幼児"}'
          WHEN '27b0b969-db65-420d-ab7b-7b6f9c7a99f6' THEN '{"child_age":"3歳","event_class":"幼児"}'
          WHEN 'dac9ada8-5f21-474f-851b-3790ad56ee37' THEN '{"child_age":"4歳","event_class":"幼児"}'
          WHEN '591f30e3-a4c5-4ab6-9bd3-908e1eb8db41' THEN '{"child_age":"5歳","event_class":"幼児"}'
        END)
      ),
      json_object(
        'type', 'send_message',
        'params', json_object(
          'messageType', 'text',
          'content', CASE id
            WHEN '79daba95-0a49-4e16-ae26-0bb0d9eaccc3' THEN 'ありがとうございます🌿
2歳のお子さまですね。英語絵本、歌、手遊び、活動を楽しむ40分・1回完結型の幼児クラスをご案内します。'
            WHEN '27b0b969-db65-420d-ab7b-7b6f9c7a99f6' THEN 'ありがとうございます🌿
3歳のお子さまですね。英語絵本、歌、手遊び、活動を楽しむ40分・1回完結型の幼児クラスをご案内します。'
            WHEN 'dac9ada8-5f21-474f-851b-3790ad56ee37' THEN 'ありがとうございます🌿
4歳のお子さまですね。英語絵本、歌、手遊び、活動を楽しむ40分・1回完結型の幼児クラスをご案内します。'
            WHEN '591f30e3-a4c5-4ab6-9bd3-908e1eb8db41' THEN 'ありがとうございます🌿
5歳のお子さまですね。英語絵本、歌、手遊び、活動を楽しむ40分・1回完結型の幼児クラスをご案内します。'
          END || '

予約画面で希望教室を選ぶと、その教室の確定日程と最新の空席が表示されます。

▼幼児（2〜5歳）日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed

参加費は1回500円程度（予定）で、参加した回数分のみです。お申込み後、スタッフ確認を経て参加確定となります。12/5は開催日確定、教室・定員確定後に受付を開始します。'
        )
      )
    ),
    is_active = 1,
    priority = 100,
    line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  '79daba95-0a49-4e16-ae26-0bb0d9eaccc3',
  '27b0b969-db65-420d-ab7b-7b6f9c7a99f6',
  'dac9ada8-5f21-474f-851b-3790ad56ee37',
  '591f30e3-a4c5-4ab6-9bd3-908e1eb8db41'
)
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

WITH automation_seed(id, keyword, match_mode, saved_value, target_class) AS (
  VALUES
    ('d2aba1a9-8fe2-4fb9-807b-08ebea3349f1', '幼児',       'contains', '幼児',       '幼児'),
    ('e8529ff1-bb9c-4946-a0de-0b524f0b64d0', '低学年',     'contains', '小学生低学年', '小学生低学年'),
    ('0cdc3ed3-18e6-4b46-ac53-f6ed1c060873', '1年生',      'exact',    '小学1年生',   '小学生低学年'),
    ('3a5a6e07-f1da-4be3-8fae-939bb22f30d5', '2年生',      'exact',    '小学2年生',   '小学生低学年'),
    ('c1caaf90-e6bc-4646-bf5d-2e48b6579550', '3年生',      'exact',    '小学3年生',   '小学生低学年'),
    ('a704ee65-b4c7-4fc2-8174-2f713b88b86e', '小学1年生',  'exact',    '小学1年生',   '小学生低学年'),
    ('cd6dea3f-e549-4381-86e2-63b462fe18a6', '小学2年生',  'exact',    '小学2年生',   '小学生低学年'),
    ('874f6ed0-63b9-41ed-8ccd-61d5012a714f', '小学3年生',  'exact',    '小学3年生',   '小学生低学年')
)
INSERT INTO automations (
  id, name, description, event_type, conditions, actions,
  is_active, priority, line_account_id
)
SELECT
  id,
  '英語絵本｜' || keyword || '回答→' || target_class || '予約案内',
  '2026秋冬のチラシ導線で対象区分を回答した方へ、確定日程・空席・予約ページを自動案内します。',
  'message_received',
  CASE match_mode
    WHEN 'contains' THEN json_object('keyword', keyword)
    ELSE json_object('keyword_exact', keyword)
  END,
  json_array(
    json_object(
      'type', 'set_metadata',
      'params', json_object(
        'data', CASE target_class
          WHEN '幼児' THEN '{"event_class":"幼児"}'
          ELSE '{"child_grade":"' || saved_value || '","event_class":"小学生低学年"}'
        END
      )
    ),
    json_object(
      'type', 'send_message',
      'params', json_object(
        'messageType', 'text',
        'content', CASE target_class
          WHEN '幼児' THEN 'ありがとうございます🌿
幼児（2〜5歳）は、英語絵本、歌、手遊び、活動を楽しむ40分・1回完結型です。

予約画面で希望教室を選ぶと、その教室の確定日程と最新の空席が表示されます。

▼幼児 日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed

参加費は1回500円程度（予定）です。お申込み後、スタッフ確認を経て参加確定となります。12/5は教室・定員確定後に受付を開始します。'
          ELSE 'ありがとうございます🌿
小学生低学年は、英語絵本、歌、手遊びにゲームを加え、聞いた英語を自分で使う体験へつなげる40分・1回完結型です。

予約画面で希望教室を選ぶと、その教室の確定日程と最新の空席が表示されます。

▼小学生低学年 日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=dec4cc02-3d28-41d0-a725-642a1364dafd

参加費は1回500円程度（予定）です。お申込み後、スタッフ確認を経て参加確定となります。12/5は教室・定員確定後に受付を開始します。'
        END
      )
    )
  ),
  1,
  100,
  '0797696f-e377-4132-bb17-77bc1db29b0a'
FROM automation_seed
WHERE 1
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  event_type = excluded.event_type,
  conditions = excluded.conditions,
  actions = excluded.actions,
  is_active = 1,
  priority = excluded.priority,
  line_account_id = excluded.line_account_id,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- オートメーションが返信を担当するキーワードは、静かな自動返信で未対応化を防ぐ。
UPDATE auto_replies
SET match_type = 'exact',
    response_type = 'silent',
    response_content = '',
    template_id = NULL,
    is_active = 1
WHERE id IN (
  'ed6ce450-a606-4f28-9044-0d18c3321f4a',
  'f53abfdd-4925-43f9-ae68-7e71ab48ef55',
  'c1722950-0c5b-432c-a25f-f85c3ca6a47c',
  'e551a683-a615-49c3-9525-7c12b64c4bad'
)
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

WITH reply_seed(id, keyword, match_type) AS (
  VALUES
    ('d939d17e-2d32-44e4-b111-a474794924c4', '幼児',      'contains'),
    ('7b9df210-9255-42a6-b09a-e6d689899af5', '低学年',    'contains'),
    ('108ed741-eb76-416a-8c40-6b1bc0c63e91', '1年生',     'exact'),
    ('34bb2143-9f6b-44a9-8d95-4a2c1e32bd3d', '2年生',     'exact'),
    ('ba248c8c-f3a7-45fa-bafb-f18eb3883b6f', '3年生',     'exact'),
    ('d0b578a5-f8d5-438a-83aa-b072c65c979c', '小学1年生', 'exact'),
    ('e0320d05-4d7a-450f-8aba-c37b287a913c', '小学2年生', 'exact'),
    ('4830d3fe-26a3-49ee-888f-202b0f629ceb', '小学3年生', 'exact')
)
INSERT INTO auto_replies (
  id, keyword, match_type, response_type, response_content,
  template_id, line_account_id, is_active
)
SELECT
  id, keyword, match_type, 'silent', '', NULL,
  '0797696f-e377-4132-bb17-77bc1db29b0a', 1
FROM reply_seed
WHERE 1
ON CONFLICT(id) DO UPDATE SET
  keyword = excluded.keyword,
  match_type = excluded.match_type,
  response_type = 'silent',
  response_content = '',
  template_id = NULL,
  line_account_id = excluded.line_account_id,
  is_active = 1;

-- ---------------------------------------------------------------------------
-- 5. FAQキーワードを確定日程へ統一
-- ---------------------------------------------------------------------------

UPDATE auto_replies
SET response_content = '2026年10月〜12月の土曜日、全13日程で開催します🌿

10/3・10/10・10/17・10/24・10/31
11/7・11/14・11/21・11/28
12/5・12/12・12/19・12/26

幼児　11:00〜11:40
小学生低学年　11:50〜12:30

▼幼児（2〜5歳）日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed

▼小学生低学年 日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=dec4cc02-3d28-41d0-a725-642a1364dafd

予約画面で希望教室を選ぶと、その教室の最新の空席が表示されます。12/5は開催日確定、教室・定員は調整中のため、確定後に受付を開始します。',
    match_type = 'exact',
    response_type = 'text',
    template_id = NULL,
    is_active = 1
WHERE id = '19fffe9c-288d-48e5-af8c-5dfae0f2ac3f'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies
SET response_content = 'イベント参加費は、1回500円程度（予定）です。参加した回数分のみで、秋冬イベントのために年間教材をご購入いただく必要はありません。

お申込み後、スタッフが空席と内容を確認し、公式LINEで参加確定をご連絡します。LINE登録や予約送信だけでは参加確定になりません。',
    match_type = 'exact',
    response_type = 'text',
    template_id = NULL,
    is_active = 1
WHERE id = '5150d87a-2c9e-465d-be76-b250e42764a7'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies
SET response_content = 'ご予約内容はこちらから確認できます。

▼予約履歴
https://liff.line.me/2010714049-6L0KFjN7/?page=event-me

「申込受付」はまだ参加確定ではありません。スタッフ確認後に公式LINEで確定をご連絡します。予約が表示されない場合は、このトークへ保護者さまのお名前と参加予定日をお送りください。',
    match_type = 'exact',
    response_type = 'text',
    template_id = NULL,
    is_active = 1
WHERE id = 'ea99d110-4a59-45d4-b958-498dc2e759f6'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies
SET response_content = '日程の変更・キャンセルは、開始48時間前まで予約履歴からお手続きいただけます。

▼予約履歴
https://liff.line.me/2010714049-6L0KFjN7/?page=event-me

期限を過ぎた場合や操作が難しい場合は、このトークへご連絡ください。',
    match_type = 'exact',
    response_type = 'text',
    template_id = NULL,
    is_active = 1
WHERE id = '4978d7d2-a9d7-4d7e-976e-dfba95f831ff'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

WITH faq_seed(id, keyword, response_content) AS (
  VALUES
    ('56774ad3-d21d-4ddd-851f-315d46bbb73a', '日程', '2026年10月〜12月の土曜日、全13日程で開催します🌿

10/3・10/10・10/17・10/24・10/31
11/7・11/14・11/21・11/28
12/5・12/12・12/19・12/26

幼児　11:00〜11:40
小学生低学年　11:50〜12:30

▼幼児（2〜5歳）日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed

▼小学生低学年 日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=dec4cc02-3d28-41d0-a725-642a1364dafd

12/5は開催日確定、教室・定員は調整中のため、確定後に受付を開始します。'),
    ('3cdadf30-be52-4e04-af4c-38d8db37f137', '場所', '会場はECCジュニア藍住教室と大学前教室です🌿

藍住：10/3・10/17・10/31・11/7・11/14・11/28・12/12・12/19
大学前：10/10・10/24・11/14・11/21・11/28・12/12・12/26

12/5は開催日確定、教室・定員は調整中です。予約画面で希望教室を選ぶと、その教室で受付中の日程だけが表示されます。'),
    ('9ad98fd2-e278-45c5-9cb6-bce7e00ccef5', '教室', '会場はECCジュニア藍住教室と大学前教室です🌿

藍住：10/3・10/17・10/31・11/7・11/14・11/28・12/12・12/19
大学前：10/10・10/24・11/14・11/21・11/28・12/12・12/26

12/5は開催日確定、教室・定員は調整中です。予約画面で希望教室を選ぶと、その教室で受付中の日程だけが表示されます。'),
    ('3980f4a7-829c-4c93-8632-563c19374af1', '料金', 'イベント参加費は、1回500円程度（予定）です。参加した回数分のみで、年間教材の購入はありません。

お申込み後、スタッフが空席と内容を確認し、公式LINEで参加確定をご連絡します。'),
    ('dd0f573c-8007-4103-bef0-919ac1b1031b', '参加費', 'イベント参加費は、1回500円程度（予定）です。参加した回数分のみで、年間教材の購入はありません。

お申込み後、スタッフが空席と内容を確認し、公式LINEで参加確定をご連絡します。'),
    ('41cf3c0c-a73a-4faa-9265-2603e9ef8c2b', 'キャンセル', '日程の変更・キャンセルは、開始48時間前まで予約履歴からお手続きいただけます。

▼予約履歴
https://liff.line.me/2010714049-6L0KFjN7/?page=event-me

期限を過ぎた場合や操作が難しい場合は、このトークへご連絡ください。'),
    ('64e59538-d019-4fa9-b65e-9a8f57a947e4', '予約', '予約画面で対象クラスと希望教室を選ぶと、最新の空席が表示されます🌿

▼幼児（2〜5歳）
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed

▼小学生低学年
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=dec4cc02-3d28-41d0-a725-642a1364dafd

お申込み後、スタッフ確認を経て参加確定となります。12/5は教室・定員確定後に受付を開始します。'),
    ('f8de4bdb-62a0-49d7-8f1c-51897b715dbb', '空席', '予約画面で希望教室を選ぶと、最新の空席が表示されます🌿

▼幼児（2〜5歳）
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed

▼小学生低学年
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=dec4cc02-3d28-41d0-a725-642a1364dafd

12/5は教室・定員確定後に受付を開始します。')
)
INSERT INTO auto_replies (
  id, keyword, match_type, response_type, response_content,
  template_id, line_account_id, is_active
)
SELECT
  id, keyword, 'exact', 'text', response_content,
  NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1
FROM faq_seed
WHERE 1
ON CONFLICT(id) DO UPDATE SET
  keyword = excluded.keyword,
  match_type = excluded.match_type,
  response_type = excluded.response_type,
  response_content = excluded.response_content,
  template_id = NULL,
  line_account_id = excluded.line_account_id,
  is_active = 1;

-- ---------------------------------------------------------------------------
-- 6. チラシ流入シナリオ・タグ・流入名を最新内容へ更新
-- ---------------------------------------------------------------------------

UPDATE scenarios
SET name = '英語絵本イベント｜2026秋冬チラシフォロー',
    description = '幼児・小学生低学年向け、2026年10〜12月の土曜英語絵本イベント。対象回答から確定日程・空席・予約へ自動案内します。',
    is_active = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '4d84f40a-7b5e-4856-9414-b4452211e14c'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE entry_routes
SET name = '2026秋冬｜英語絵本イベント・最新チラシ',
    scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c',
    is_active = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '37d820fd-ee4e-4bbe-98a1-f24e0fe4edd9'
  AND ref_code = 'preschool-autumn-2026';

UPDATE tags
SET name = '2026秋冬・英語絵本イベントチラシ経由'
WHERE id = '8b69ede5-74f4-464b-82f4-642418725e16';

UPDATE scenario_steps
SET message_content = '友だち追加ありがとうございます🌿

ECCジュニア藍住教室・大学前教室の「土曜・英語絵本イベント」にご関心をお寄せいただき、ありがとうございます。

英語絵本、歌、手遊び、活動やゲームを楽しむ、40分・1回完結型の少人数イベントです。英語が初めてでも、1回だけでも参加できます。

幼児　11:00〜11:40
小学生低学年　11:50〜12:30
参加費　1回500円程度（予定）

お子さまに合う確定日程・空席・予約ページをすぐご案内します。次のいずれか1つを、そのまま送ってください👇

2歳
3歳
4歳
5歳
小学1年生
小学2年生
小学3年生'
WHERE id = 'a84a5fa2-a5ae-4192-9344-ecf56f4700b9'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';

UPDATE scenario_steps
SET message_content = '「英語が初めてでも大丈夫かな」という方も、どうぞご安心ください🌿

このイベントは、できる・できないを確かめる時間ではありません。絵本を見て、歌って、体を動かし、遊びながら英語にふれる40分です。

1. Hello & Warm-up　8分
2. Song & Fingerplay　8分
3. Picture Book　10分
4. Activity / Game　14分

毎回テーマが完結するため、気になる日だけ参加できます。まだ対象を送っていない方は「2歳」〜「5歳」、または「小学1年生」〜「小学3年生」のいずれかをそのまま送ってください。'
WHERE id = '11482730-b48b-4629-9fe1-c8e90d88662e'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';

UPDATE scenario_steps
SET message_content = 'この秋冬イベントは、すぐに入学を決めていただくためのものではありません🌱

まずは、お子さまが英語や教室を楽しめるかを実際に見ていただく機会です。

10〜12月　土曜・英語絵本イベント
↓
12月頃　ご希望の方に個別相談
↓
1〜3月　春の4回クラス・体験をご案内
↓
4月　通常クラススタート

イベント参加だけでも構いません。お子さまの様子を見ながら、ゆっくりご検討ください。'
WHERE id = 'e23b82f7-1165-4db5-baa1-84b38b4b5238'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';

UPDATE scenario_steps
SET message_content = '英語絵本イベントについて、気になることはありませんか🌿

知りたい内容を、次の言葉のまま1つ送ってください。

「日程」　開催日と時間
「場所」　藍住・大学前の開催日
「料金」　参加費と参加確定までの流れ
「予約」　クラス別の予約ページ
「空席」　最新の空き状況
「キャンセル」　変更・キャンセル方法

英語が初めての場合や、アレルギーなど個別に確認したいことは、文章でそのままお送りください。スタッフが確認します。'
WHERE id = 'e7dddf55-7d63-4cd0-a725-6e165ae7772c'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';

-- ---------------------------------------------------------------------------
-- 7. 確定版イベントを公開
-- ---------------------------------------------------------------------------

UPDATE events
SET is_published = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  '887d5545-7b60-425d-9c24-91d36e84d1ed',
  'dec4cc02-3d28-41d0-a725-642a1364dafd'
)
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a'
  AND deleted_at IS NULL;
