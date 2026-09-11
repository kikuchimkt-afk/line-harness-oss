-- 未就学児向け「秋の土曜・英語イベント」本番設定
-- 対象LINEアカウント: あいことば｜教室とおうちのホームルーム
-- 日程はGoogleカレンダー確認後に置いたテスト用の仮日程。

UPDATE events
SET venue_url = NULL,
    image_url = 'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.webp',
    description = '英語を「勉強」にする前に、保護者の方と一緒に、絵本・うた・季節の遊びを通して先生や教室へ楽しく慣れる土曜イベントです。

【対象】2〜3歳のお子さま
【時間】14:00〜15:00（60分）
【定員】各回6名
【参加費】1回500円程度（予定）／参加した回数分のみ
【内容】英語絵本、うた、リズム遊び、季節の制作、感覚遊びなど

【各回の仮テーマ】
9/26　Hello, Autumn! 秋の色あそび
10/3　英語絵本とリズムあそび
10/10　Apple & Pumpkin ことばあそび
10/17　落ち葉のアートと英語のうた
10/24　ハロウィン絵本を楽しもう
10/31　Halloween Party
11/7　Thank You, Autumn!

【お申込み】予約画面で短いプロフィールをご入力いただくと、最新の空席が表示されます。空いている回だけをお選びください。
【持ち物】水筒、ハンカチ
【お願い】クッキングを行う回は、食物アレルギーを事前に確認します。

※日程・テーマはテスト用の仮設定です。確定内容は公式LINE「あいことば」でご案内します。',
    max_bookings_per_friend = 7,
    requires_approval = 0,
    waitlist_enabled = 1,
    cancel_deadline_hours_before = 48,
    reminder_day_before_enabled = 1,
    reminder_hours_before = 2,
    confirmation_message_extra = 'ご予約ありがとうございます🌿
英語が初めてでも大丈夫です。当日は、お子さまのペースを大切にしながら、講師が一人ひとりの様子を見て進めます。開始5分前を目安にお越しください。お会いできることを楽しみにしています。',
    reminder_message_extra = 'いよいよイベントが近づいてきました🌿
水筒とハンカチをご用意ください。体調がすぐれない場合は無理をせず、予約履歴からご変更ください。元気なお顔に会えることを楽しみにしています。',
    og_title = '【2〜3歳】秋の土曜・英語イベント',
    og_description = '親子で楽しむ英語絵本・うた・季節の遊び。各回6名、1回500円程度（予定）です。',
    og_image_url = 'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.png',
    booking_form_fields = '[{"id":"guardian_name","label":"保護者さまのお名前","type":"text","required":true,"placeholder":"例：山田 花子"},{"id":"child_name","label":"お子さまのお名前（ひらがな）","type":"text","required":true,"placeholder":"例：やまだ はな"},{"id":"child_age","label":"お子さまの年齢","type":"select","required":true,"placeholder":"年齢を選択してください","options":["2歳","3歳"]},{"id":"considerations","label":"食物アレルギー・配慮事項","type":"textarea","required":false,"placeholder":"ない場合は入力不要です"}]',
    sort_order = 10,
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = '887d5545-7b60-425d-9c24-91d36e84d1ed'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

INSERT INTO events (
  id, line_account_id, name, venue_name, venue_url, image_url, description,
  description_centered, max_bookings_per_friend, requires_approval,
  waitlist_enabled, cancel_deadline_hours_before,
  reminder_day_before_enabled, reminder_hours_before,
  confirmation_message_extra, reminder_message_extra,
  is_published, sort_order, target_type, account_ids,
  og_title, og_description, og_image_url, booking_form_fields
) VALUES (
  '43b6af40-0884-4a2f-a3ca-b6e7632af4d1',
  '0797696f-e377-4132-bb17-77bc1db29b0a',
  '【仮日程】4〜5歳｜秋の土曜・英語イベント',
  'ECCジュニア大学前教室',
  NULL,
  'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.webp',
  '絵本、簡単な会話、ゲーム、季節の制作やミニクッキングを通して、「英語を使うと楽しい」という経験を積み重ねる土曜イベントです。

【対象】4〜5歳のお子さま
【時間】15:30〜16:45（75分）
【定員】各回6名
【参加費】1回500円程度（予定）／参加した回数分のみ
【内容】英語絵本、うた、ゲーム、簡単な会話、季節の制作、ミニクッキングなど

【各回の仮テーマ】
9/26　Hello, Autumn! 英語で自己紹介
10/3　英語絵本とストーリー遊び
10/10　Apple & Pumpkin ミニ体験
10/17　Autumn Craft 英語で制作
10/24　ハロウィン英語チャレンジ
10/31　Halloween Party
11/7　Thank You, Autumn! 発表あそび

【お申込み】予約画面で短いプロフィールをご入力いただくと、最新の空席が表示されます。空いている回だけをお選びください。
【持ち物】水筒、ハンカチ
【お願い】クッキングを行う回は、食物アレルギーを事前に確認します。

※日程・テーマはテスト用の仮設定です。確定内容は公式LINE「あいことば」でご案内します。',
  0,
  7,
  0,
  1,
  48,
  1,
  2,
  'ご予約ありがとうございます🌿
お子さまが自分らしく英語を楽しめるよう、講師が一人ひとりの様子を見ながら進めます。正解を求める時間ではありませんので、英語が初めてでも安心してご参加ください。開始5分前を目安にお越しください。',
  'いよいよイベントが近づいてきました🌿
水筒とハンカチをご用意ください。体調がすぐれない場合は無理をせず、予約履歴からご変更ください。当日お会いできることを楽しみにしています。',
  1,
  20,
  'single',
  NULL,
  '【4〜5歳】秋の土曜・英語イベント',
  '絵本・ゲーム・季節の制作・ミニクッキングで英語を楽しむ75分。各回6名、1回500円程度（予定）です。',
  'https://ecc-preschool-autumn-events.vercel.app/assets/autumn-classroom-hero.png',
  '[{"id":"guardian_name","label":"保護者さまのお名前","type":"text","required":true,"placeholder":"例：山田 花子"},{"id":"child_name","label":"お子さまのお名前（ひらがな）","type":"text","required":true,"placeholder":"例：やまだ はな"},{"id":"child_age","label":"お子さまの年齢","type":"select","required":true,"placeholder":"年齢を選択してください","options":["4歳","5歳"]},{"id":"considerations","label":"食物アレルギー・配慮事項","type":"textarea","required":false,"placeholder":"ない場合は入力不要です"}]'
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
  is_published = excluded.is_published,
  sort_order = excluded.sort_order,
  target_type = excluded.target_type,
  account_ids = excluded.account_ids,
  og_title = excluded.og_title,
  og_description = excluded.og_description,
  og_image_url = excluded.og_image_url,
  booking_form_fields = excluded.booking_form_fields,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');

INSERT INTO event_slots (id, event_id, starts_at, ends_at, capacity, is_active, sort_order)
VALUES
  ('601b7410-c4df-4b4f-b089-4976d8909ff1', '43b6af40-0884-4a2f-a3ca-b6e7632af4d1', '2026-09-26T06:30:00.000Z', '2026-09-26T07:45:00.000Z', 6, 1, 1),
  ('54feedc1-9641-4324-a04f-7b501f90595b', '43b6af40-0884-4a2f-a3ca-b6e7632af4d1', '2026-10-03T06:30:00.000Z', '2026-10-03T07:45:00.000Z', 6, 1, 2),
  ('adb32898-7016-41d6-b5c7-1fc9cf191f42', '43b6af40-0884-4a2f-a3ca-b6e7632af4d1', '2026-10-10T06:30:00.000Z', '2026-10-10T07:45:00.000Z', 6, 1, 3),
  ('c7a9df80-3963-4f0c-89ec-5b02aa35e140', '43b6af40-0884-4a2f-a3ca-b6e7632af4d1', '2026-10-17T06:30:00.000Z', '2026-10-17T07:45:00.000Z', 6, 1, 4),
  ('5fb156e3-161a-4ddb-bfce-cd0da27e9ece', '43b6af40-0884-4a2f-a3ca-b6e7632af4d1', '2026-10-24T06:30:00.000Z', '2026-10-24T07:45:00.000Z', 6, 1, 5),
  ('b790a20a-e882-4c24-924d-1125fbbd671d', '43b6af40-0884-4a2f-a3ca-b6e7632af4d1', '2026-10-31T06:30:00.000Z', '2026-10-31T07:45:00.000Z', 6, 1, 6),
  ('f70859ef-77da-4da2-9080-c24cc99b456a', '43b6af40-0884-4a2f-a3ca-b6e7632af4d1', '2026-11-07T06:30:00.000Z', '2026-11-07T07:45:00.000Z', 6, 1, 7)
ON CONFLICT(id) DO UPDATE SET
  event_id = excluded.event_id,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  capacity = excluded.capacity,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');

-- 年齢回答は、silentの自動返信ルールでチャットを未対応扱いにせず、
-- アカウント限定オートメーションで年齢保存と即時返信を行う。
INSERT INTO automations (
  id, name, description, event_type, conditions, actions,
  is_active, priority, line_account_id
) VALUES
  (
    '79daba95-0a49-4e16-ae26-0bb0d9eaccc3',
    '未就学児｜2歳回答→予約案内',
    '秋イベント導線で2歳と回答した方へ、年齢を保存し2〜3歳予約ページを案内します。',
    'message_received',
    '{"keyword_exact":"2歳"}',
    '[{"type":"set_metadata","params":{"data":"{\"child_age\":\"2歳\",\"preschool_event_group\":\"2-3\"}"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます🌿\n2歳のお子さまですね。\n\nこの年代は、保護者の方と一緒に、英語絵本やうた、リズム遊びを中心に、教室の雰囲気へゆっくり慣れていきます。英語が初めてでも大丈夫です。\n\n予約画面で短いプロフィールをご入力いただくと、最新の日程と空席が表示されます。空いている回だけお選びください。\n\n▼2〜3歳 日程・空席・予約\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed\n\n参加費は1回500円程度（予定）で、参加した回数分のみです。日程はテスト用の仮設定です。"}}]',
    1, 100, '0797696f-e377-4132-bb17-77bc1db29b0a'
  ),
  (
    '27b0b969-db65-420d-ab7b-7b6f9c7a99f6',
    '未就学児｜3歳回答→予約案内',
    '秋イベント導線で3歳と回答した方へ、年齢を保存し2〜3歳予約ページを案内します。',
    'message_received',
    '{"keyword_exact":"3歳"}',
    '[{"type":"set_metadata","params":{"data":"{\"child_age\":\"3歳\",\"preschool_event_group\":\"2-3\"}"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます🌿\n3歳のお子さまですね。\n\n絵本やうた、リズム遊びを通して、英語の音と先生に親しむ内容をご用意しています。できる・できないを確かめる時間ではありませんので、初めてでも安心してご参加ください。\n\n予約画面で短いプロフィールをご入力いただくと、最新の日程と空席が表示されます。空いている回だけお選びください。\n\n▼2〜3歳 日程・空席・予約\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed\n\n参加費は1回500円程度（予定）で、参加した回数分のみです。日程はテスト用の仮設定です。"}}]',
    1, 100, '0797696f-e377-4132-bb17-77bc1db29b0a'
  ),
  (
    'dac9ada8-5f21-474f-851b-3790ad56ee37',
    '未就学児｜4歳回答→予約案内',
    '秋イベント導線で4歳と回答した方へ、年齢を保存し4〜5歳予約ページを案内します。',
    'message_received',
    '{"keyword_exact":"4歳"}',
    '[{"type":"set_metadata","params":{"data":"{\"child_age\":\"4歳\",\"preschool_event_group\":\"4-5\"}"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます🌿\n4歳のお子さまですね。\n\n英語絵本、うた、ゲーム、季節の制作などを組み合わせ、先生やお友だちと英語を使う楽しさを感じられる内容です。正解を求めず、お子さまのペースを大切に進めます。\n\n予約画面で短いプロフィールをご入力いただくと、最新の日程と空席が表示されます。空いている回だけお選びください。\n\n▼4〜5歳 日程・空席・予約\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event&id=43b6af40-0884-4a2f-a3ca-b6e7632af4d1\n\n参加費は1回500円程度（予定）で、参加した回数分のみです。日程はテスト用の仮設定です。"}}]',
    1, 100, '0797696f-e377-4132-bb17-77bc1db29b0a'
  ),
  (
    '591f30e3-a4c5-4ab6-9bd3-908e1eb8db41',
    '未就学児｜5歳回答→予約案内',
    '秋イベント導線で5歳と回答した方へ、年齢を保存し4〜5歳予約ページを案内します。',
    'message_received',
    '{"keyword_exact":"5歳"}',
    '[{"type":"set_metadata","params":{"data":"{\"child_age\":\"5歳\",\"preschool_event_group\":\"4-5\"}"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます🌿\n5歳のお子さまですね。\n\n英語絵本、簡単な会話、ゲーム、季節の制作やミニクッキングを通して、4月のクラスにも自然につながる『英語で楽しむ経験』を重ねます。英語が初めてでも大丈夫です。\n\n予約画面で短いプロフィールをご入力いただくと、最新の日程と空席が表示されます。空いている回だけお選びください。\n\n▼4〜5歳 日程・空席・予約\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event&id=43b6af40-0884-4a2f-a3ca-b6e7632af4d1\n\n参加費は1回500円程度（予定）で、参加した回数分のみです。日程はテスト用の仮設定です。"}}]',
    1, 100, '0797696f-e377-4132-bb17-77bc1db29b0a'
  )
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  event_type = excluded.event_type,
  conditions = excluded.conditions,
  actions = excluded.actions,
  is_active = excluded.is_active,
  priority = excluded.priority,
  line_account_id = excluded.line_account_id,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');

INSERT INTO auto_replies (
  id, keyword, match_type, response_type, response_content,
  template_id, line_account_id, is_active
) VALUES
  ('ed6ce450-a606-4f28-9044-0d18c3321f4a', '2歳', 'exact', 'silent', '', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1),
  ('f53abfdd-4925-43f9-ae68-7e71ab48ef55', '3歳', 'exact', 'silent', '', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1),
  ('70dd7fca-42cb-4e29-98f6-2fe346e4f8cd', '4歳', 'exact', 'silent', '', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1),
  ('ec3a14a0-16ff-4577-8f00-dea212c0a7e9', '5歳', 'exact', 'silent', '', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1),
  ('19fffe9c-288d-48e5-af8c-5dfae0f2ac3f', '秋イベント日程', 'exact', 'text', '現在は、9/26・10/3・10/10・10/17・10/24・10/31・11/7の土曜日を仮日程として設定しています🌿\n\n2〜3歳　14:00〜15:00\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed\n\n4〜5歳　15:30〜16:45\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event&id=43b6af40-0884-4a2f-a3ca-b6e7632af4d1\n\n予約画面には最新の空席が表示されます。日程・テーマはテスト用の仮設定です。', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1),
  ('5150d87a-2c9e-465d-be76-b250e42764a7', '秋イベント料金', 'exact', 'text', 'イベント参加費は、1回500円程度（予定）です。参加した回数分のみをお支払いいただく考えで、秋イベントのために年間教材をご購入いただく必要はありません。\n\n4月からの正式入学や春の4回クラスは別のご案内です。内容をご確認いただいたうえで、それぞれご判断いただけます。', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1),
  ('ea99d110-4a59-45d4-b958-498dc2e759f6', '秋イベント予約確認', 'exact', 'text', 'ご予約内容はこちらから確認できます。\n\n▼予約履歴\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event-me\n\n予約が表示されない場合は、このトークへ保護者さまのお名前と参加予定日をお送りください。', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1),
  ('4978d7d2-a9d7-4d7e-976e-dfba95f831ff', '秋イベントキャンセル', 'exact', 'text', '日程の変更・キャンセルは、開始48時間前まで予約履歴からお手続きいただけます。\n\n▼予約履歴\nhttps://liff.line.me/2010714049-6L0KFjN7/?page=event-me\n\n期限を過ぎた場合や操作が難しい場合は、このトークへご連絡ください。', NULL, '0797696f-e377-4132-bb17-77bc1db29b0a', 1)
ON CONFLICT(id) DO UPDATE SET
  keyword = excluded.keyword,
  match_type = excluded.match_type,
  response_type = excluded.response_type,
  response_content = excluded.response_content,
  template_id = excluded.template_id,
  line_account_id = excluded.line_account_id,
  is_active = excluded.is_active;

UPDATE scenario_steps
SET message_content = '友だち追加ありがとうございます🌿

ECCジュニア大学前教室の「2〜5歳 秋の英語イベント」にご関心をお寄せいただき、ありがとうございます。

秋は、年間教材を使う通常クラスではなく、絵本・うた・季節の遊びなどを通して、教室と先生に少しずつ慣れていく時間をご用意します。

イベント参加費は、1回500円程度（予定）。参加した回数分のみです。

年齢に合う内容と、最新の空席が見える予約ページをすぐご案内します。お子さまの年齢を、次のいずれか1つだけそのままお送りください。

2歳
3歳
4歳
5歳'
WHERE id = 'a84a5fa2-a5ae-4192-9344-ecf56f4700b9'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';

UPDATE scenario_steps
SET message_content = '秋の英語イベントは、英語の知識を確かめる場ではありません。

絵本を見て、音をまねして、体を動かし、季節の制作や簡単なクッキングを楽しみます。活動中に見られた小さな変化は、毎回、保護者の方へ短くお伝えします。

2〜3歳は親子で60分、4〜5歳は子ども中心で75分です。現在は9月26日から11月7日まで、毎週土曜日の仮日程を公開しています。

まだ年齢を送っていない場合は「2歳」「3歳」「4歳」「5歳」のいずれかを、そのままお送りください。年齢に合う予約ページを自動でご案内します。'
WHERE id = '11482730-b48b-4629-9fe1-c8e90d88662e'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';

UPDATE scenario_steps
SET message_content = '秋の英語イベントについて、気になることはありませんか。

次の言葉を1つだけ、そのまま送ると自動でご案内します。

「秋イベント日程」　開催日・空席・予約ページ
「秋イベント料金」　参加費とお支払いの考え方
「秋イベント予約確認」　現在のご予約内容
「秋イベントキャンセル」　変更・キャンセル方法

英語が初めての場合や、食物アレルギーなど個別に確認したいことは、文章でそのままお送りください。スタッフが内容を確認します。'
WHERE id = 'e7dddf55-7d63-4cd0-a725-6e165ae7772c'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';
