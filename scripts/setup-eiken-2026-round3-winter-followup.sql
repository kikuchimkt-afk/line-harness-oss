-- 英検第3回の案内を受けた方へ、冬期講習のご案内を 3日後・1週間後の 18:00 に送るシナリオ（あいことば）。
--
-- 開始のしかた（同じ方に二重には入らない）
--   ・QR の流入リンクで友だち追加 → 流入タグ「英検2026第3回｜流入」の付与で開始（tag_added）
--   ・「英検申込」「英検」「5級」〜「2級」を送った方 → オートメーションの start_scenario で開始
--     （オートメーションの add_tag は tag_added シナリオを起動しないため、明示的に開始する）
-- 配信: relative。1通目は開始から3日後の18:00、2通目はそこから4日後（＝1週間後）の18:00。
-- 2027-01-05 以降は新しく開始しない（一次試験 1/23 と講習期間に合わせる）。再実行可。

INSERT INTO scenarios (id, name, description, trigger_type, trigger_tag_id, is_active, delivery_mode, expires_at, line_account_id)
VALUES (
  '63dac895-828e-4ebc-b955-dfce7cff8b10',
  '英検2026第3回｜冬期講習のご案内',
  '英検第3回の案内を受けた方へ、3日後・1週間後の18時に冬期講習（ReadPass・AudiPass が使える）を案内します。',
  'tag_added', '9fcad10e-5bdf-407a-9b2c-cebc39ffbbd4', 1, 'relative', '2027-01-05T00:00:00+09:00',
  '0797696f-e377-4132-bb17-77bc1db29b0a'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, description = excluded.description, trigger_type = excluded.trigger_type,
  trigger_tag_id = excluded.trigger_tag_id, is_active = excluded.is_active, delivery_mode = excluded.delivery_mode,
  expires_at = excluded.expires_at, line_account_id = excluded.line_account_id,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');

INSERT INTO scenario_steps (id, scenario_id, step_order, delay_minutes, message_type, message_content, offset_days, offset_minutes, delivery_time)
VALUES
(
  '58354887-8853-4050-a1f4-520559ca3332', '63dac895-828e-4ebc-b955-dfce7cff8b10', 1, 0, 'text',
  'こんばんは🌙 あいことばです。

📱✨ ReadPass × AudiPass で、英検®学習の新体験！

ECCベストワンの冬期講習を受講すると、英検®対策アプリ「ReadPass」と「AudiPass」が使えます。

📖 ReadPass（リーディング）
級ごとの形式の長文を、画面でそのまま読んで解けます。

🎧 AudiPass（リスニング）
音声を聞きながら、級ごとの形式で練習できます。

📱 スマホやタブレットで、すきま時間に自分のペースで続けられます。

✍️ そして、画面で解くだけで終わらないのが特長です。
・書き込み式のワークが充実。手を動かして、単語や英文の形をしっかり身につけます
・個別指導と連携した宿題で、教室で学んだことをおうちで確かめ、次の授業につなげます

まずは体験版で、各級1回分をお試しください（登録不要）👇
https://trial-for-read-pass-audi-pass.vercel.app/

一次試験（1月23日・土）に向けて、冬期講習では
・1回80分、講師1名に生徒2名の個別指導
・アプリで進めた学習の「わからない」を、教室で講師と一緒に確認
という形で、準備を進められます☃️

▼冬期講習のご案内（内容・料金）
https://bestone-tokushima-winter-2026.vercel.app/

ご質問は、このトークへお気軽にどうぞ😊

※英検®は、公益財団法人 日本英語検定協会の登録商標です。このコンテンツは、公益財団法人 日本英語検定協会の承認や推奨、その他の検討を受けたものではありません。',
  3, 0, '18:00'
),
(
  'b44e2e50-bdb5-452f-885d-ab73605eea9a', '63dac895-828e-4ebc-b955-dfce7cff8b10', 2, 0, 'text',
  'こんばんは🌙 あいことばです。
英検®の一次試験（1月23日・土）に向けて、準備は進んでいますか？📅

冬休みは、まとまった時間を取りやすい時期です✨
冬期講習では、
✅ 単語・長文・リスニングは、アプリで毎日少しずつ
✅ わからないところは、教室で講師と一緒に確認
という形で、おうちでの学習と教室をつなげて進められます。

講習は1月末まで受講できます🗓️
内容・料金は、こちらからご覧ください👇
https://bestone-tokushima-winter-2026.vercel.app/

「どのくらい受けたらいい？」「英検®とあわせて学校の勉強も見てほしい」など、どんなご相談でも、このトークへお気軽にどうぞ😊

※英検®は、公益財団法人 日本英語検定協会の登録商標です。このコンテンツは、公益財団法人 日本英語検定協会の承認や推奨、その他の検討を受けたものではありません。',
  4, 0, '18:00'
)
ON CONFLICT(id) DO UPDATE SET
  scenario_id = excluded.scenario_id, step_order = excluded.step_order, delay_minutes = excluded.delay_minutes,
  message_type = excluded.message_type, message_content = excluded.message_content,
  offset_days = excluded.offset_days, offset_minutes = excluded.offset_minutes, delivery_time = excluded.delivery_time;
