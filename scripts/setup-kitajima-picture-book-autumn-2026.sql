-- 2026秋冬 英語絵本イベント: 北島中央教室の追加
-- 対象LINEアカウント: あいことば｜教室とおうちのホームルーム
--
-- 方針:
--   * 既存の幼児・小学生低学年イベントをそのまま利用する。
--   * 教室選択値と slot.visibility_conditions は同じ文字列で揃える。
--   * 固定UUID + ON CONFLICT で再実行しても予約枠を重複作成しない。
--   * 既存予約・回答には触れない。

-- 1分アンケート: 既存 q1〜q5 を保持し、q1直後に教室選択 q6 を追加する。
UPDATE forms
SET fields = '[{"name":"q1","label":"保護者さまのお名前","type":"text","required":true,"placeholder":"例：山田 花子"},{"name":"q6","label":"参加を検討している教室","type":"checkbox","required":true,"placeholder":"当てはまる教室を選んでください（複数選択可）","options":["藍住教室（藍住町）","大学前教室（徳島市）","北島中央教室（北島町）"]},{"name":"q2","label":"参加を検討しているお子さまの年齢・学年（複数の場合はすべて）","type":"checkbox","required":true,"options":["2歳","3歳","4歳","5歳","小学1年生","小学2年生","小学3年生","その他"]},{"name":"q3","label":"お子さまが今、興味をもっていること・好きなもの","type":"checkbox","required":true,"placeholder":"当てはまるものを選んでください","options":["動物・生き物","乗り物","食べ物","歌・音楽","体を動かすこと","お絵描き・工作","ごっこ遊び","文字・数字","季節・自然","その他"]},{"name":"q4","label":"普段、英語にふれる機会はありますか","type":"radio","required":false,"options":["ほぼ初めて","家庭で絵本・歌・動画など","園・学校で","英語教室などで継続的に","その他"]},{"name":"q5","label":"イベントへのご希望や、聞いてみたいことがあれば教えてください","type":"textarea","required":false,"placeholder":"例：英語が初めて、アレルギー、場所についてなど"}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = '35a30337-84ce-4ba7-916c-c5ee86a3a7dd';

-- 幼児イベント: 藍住・大学前の午前枠に、北島中央の15:50枠を加える。
UPDATE events
SET venue_name = 'ECCジュニア藍住教室／大学前教室／北島中央教室（予約時に選択）',
    description = '英語が初めてのお子さまも安心して参加できる、40分・1回完結型の少人数イベントです。
英語絵本、歌、手遊び、活動やゲームを通して、遊びながら英語の音とことばにふれます。1回だけ、または途中の回からでも参加できます。

【対象】幼児（2歳児〜5歳児）
【時間】藍住・大学前 11:00〜11:40／北島中央 15:50〜16:30
【会場】ECCジュニア藍住教室／大学前教室／北島中央教室
【定員】各クラス・各教室3〜5名
【参加費】1回500円程度（予定）／参加回数分のみ
【持ち物】水筒、ハンカチ

【40分の流れ】
Hello & Warm-up 8分 → Song & Fingerplay 8分 → Picture Book 10分 → Activity / Game 14分

【確定日程・会場・テーマ】
10/3　藍住（5名）　Hello, New Friends! / Hello Hello
10/10　大学前・北島中央（各3名）　Color Parade / Brown Bear, Brown Bear, What Do You See?
10/17　藍住（3名）　Move Your Body / From Head to Toe
10/24　大学前・北島中央（各3名）　Busy Autumn / The Busy Little Squirrel
10/31　藍住（5名）　Monster, Go Away! / Go Away, Big Green Monster!
11/7　藍住・北島中央（各3名）　Good Night, Animals / Good Night, Gorilla
11/14　藍住・大学前・北島中央（各3名）　Hungry Caterpillar / The Very Hungry Caterpillar
11/21　大学前・北島中央（各3名）　How Do You Feel? / The Color Monster
11/28　藍住・大学前・北島中央（各3名）　Share and Say Please / Should I Share My Ice Cream?
12/5　開催日確定／教室・定員は調整中　Balance Together / Balancing Act
12/12　藍住・大学前・北島中央（各3名）　Giving Is a Gift / Bear Stays Up for Christmas
12/19　藍住（5名）・北島中央（3名）　Dear Santa / Dear Santa
12/26　大学前・北島中央（各3名）　A Snowy Story / The Snowy Day

予約画面で教室を選ぶと、その教室で受付中の日程と最新の空席が表示されます。12/5は教室・定員確定後に公式LINEで受付開始をご案内します。

※お申込み後、スタッフ確認を経て参加確定となります。LINE登録だけでは参加確定になりません。',
    max_bookings_per_friend = 13,
    booking_form_fields = '[{"id":"field_5637a98b","label":"受講希望教室","type":"select","required":true,"placeholder":"教室を選択してください","options":["藍住教室（藍住町）","大学前教室（徳島市）","北島中央教室（北島町）"]},{"id":"guardian_name","label":"保護者さまのお名前","type":"text","required":true,"placeholder":"例：山田 花子"},{"id":"child_name","label":"お子さまのお名前（ひらがな）","type":"text","required":true,"placeholder":"例：やまだ はな"},{"id":"child_age","label":"お子さまの年齢","type":"select","required":true,"placeholder":"年齢を選択してください","options":["2歳児","3歳児","4歳児","5歳児"]},{"id":"field_3fcbb927","label":"当日連絡のつく電話番号","type":"text","required":true,"placeholder":"例：090-1234-5678"},{"id":"considerations","label":"アレルギー・配慮事項","type":"textarea","required":false,"placeholder":"ない場合は入力不要です"}]',
    og_description = '英語が初めてでも参加できる40分・1回完結型イベント。藍住・大学前・北島中央教室、各回3〜5名、1回500円程度（予定）です。',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = '887d5545-7b60-425d-9c24-91d36e84d1ed'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

-- 小学生低学年イベント: 藍住・大学前の午前枠に、北島中央の15:00枠を加える。
UPDATE events
SET venue_name = 'ECCジュニア藍住教室／大学前教室／北島中央教室（予約時に選択）',
    description = '英語絵本、歌、手遊びにゲームを加え、聞いた英語を自分で使う経験へつなげる、40分・1回完結型の少人数イベントです。
予想、質問、短い会話やチームチャレンジを取り入れます。英語が初めてでも、1回だけでも参加できます。

【対象】小学生低学年（小学1〜3年生）
【時間】藍住・大学前 11:50〜12:30／北島中央 15:00〜15:40
【会場】ECCジュニア藍住教室／大学前教室／北島中央教室
【定員】各クラス・各教室3〜5名
【参加費】1回500円程度（予定）／参加回数分のみ
【持ち物】水筒、ハンカチ

【40分の流れ】
Hello & Warm-up 8分 → Song & Fingerplay 8分 → Picture Book 10分 → Activity / Game 14分

【確定日程・会場・テーマ】
10/3　藍住（5名）　Hello, New Friends! / Hello Hello
10/10　大学前・北島中央（各3名）　Color Parade / Brown Bear, Brown Bear, What Do You See?
10/17　藍住（3名）　Move Your Body / From Head to Toe
10/24　大学前・北島中央（各3名）　Busy Autumn / The Busy Little Squirrel
10/31　藍住（5名）　Monster, Go Away! / Go Away, Big Green Monster!
11/7　藍住・北島中央（各3名）　Good Night, Animals / Good Night, Gorilla
11/14　藍住・大学前・北島中央（各3名）　Hungry Caterpillar / The Very Hungry Caterpillar
11/21　大学前・北島中央（各3名）　How Do You Feel? / The Color Monster
11/28　藍住・大学前・北島中央（各3名）　Share and Say Please / Should I Share My Ice Cream?
12/5　開催日確定／教室・定員は調整中　Balance Together / Balancing Act
12/12　藍住・大学前・北島中央（各3名）　Giving Is a Gift / Bear Stays Up for Christmas
12/19　藍住（5名）・北島中央（3名）　Dear Santa / Dear Santa
12/26　大学前・北島中央（各3名）　A Snowy Story / The Snowy Day

予約画面で教室を選ぶと、その教室で受付中の日程と最新の空席が表示されます。12/5は教室・定員確定後に公式LINEで受付開始をご案内します。

※お申込み後、スタッフ確認を経て参加確定となります。LINE登録だけでは参加確定になりません。',
    max_bookings_per_friend = 13,
    booking_form_fields = '[{"id":"field_5637a98b","label":"受講希望教室","type":"select","required":true,"placeholder":"教室を選択してください","options":["藍住教室（藍住町）","大学前教室（徳島市）","北島中央教室（北島町）"]},{"id":"guardian_name","label":"保護者さまのお名前","type":"text","required":true,"placeholder":"例：山田 花子"},{"id":"child_name","label":"お子さまのお名前（ひらがな）","type":"text","required":true,"placeholder":"例：やまだ はな"},{"id":"child_age","label":"お子さまの学年","type":"select","required":true,"placeholder":"学年を選択してください","options":["小学1年生","小学2年生","小学3年生"]},{"id":"field_3fcbb927","label":"当日連絡のつく電話番号","type":"text","required":true,"placeholder":"例：090-1234-5678"},{"id":"considerations","label":"アレルギー・配慮事項","type":"textarea","required":false,"placeholder":"ない場合は入力不要です"}]',
    og_description = '絵本・歌・ゲームから英語を使う体験へつなげる40分。藍住・大学前・北島中央教室、各回3〜5名、1回500円程度（予定）です。',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = 'dec4cc02-3d28-41d0-a725-642a1364dafd'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

-- 北島中央教室: 幼児 15:50〜16:30（JST = UTC 06:50〜07:30）
INSERT INTO event_slots
  (id, event_id, starts_at, ends_at, capacity, is_active, sort_order, visibility_conditions)
VALUES
  ('e374746e-16d3-4aad-8cdb-d2edf1aab9ea', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-10-10T06:50:00.000Z', '2026-10-10T07:30:00.000Z', 3, 1, 16, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('a3aa82cc-81f1-4158-a6d4-2c06a1dde84f', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-10-24T06:50:00.000Z', '2026-10-24T07:30:00.000Z', 3, 1, 17, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('aa1adbcb-7647-48ac-a72a-654b31436d68', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-07T06:50:00.000Z', '2026-11-07T07:30:00.000Z', 3, 1, 18, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('82efcb20-8c60-4641-8d9b-127763b57cc0', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-14T06:50:00.000Z', '2026-11-14T07:30:00.000Z', 3, 1, 19, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('1bd6a89d-fec1-4d54-a815-1537addaf5ec', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-21T06:50:00.000Z', '2026-11-21T07:30:00.000Z', 3, 1, 20, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('fb3687b7-66e9-4100-a096-25beedc70766', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-11-28T06:50:00.000Z', '2026-11-28T07:30:00.000Z', 3, 1, 21, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('e3fc4cd4-9a36-4b1d-9802-6fbaf509b508', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-12-12T06:50:00.000Z', '2026-12-12T07:30:00.000Z', 3, 1, 22, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('648397e2-a6cd-4e4e-b75d-6289c4a45608', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-12-19T06:50:00.000Z', '2026-12-19T07:30:00.000Z', 3, 1, 23, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('d035346e-d0bc-4437-ad5b-e4749830576a', '887d5545-7b60-425d-9c24-91d36e84d1ed', '2026-12-26T06:50:00.000Z', '2026-12-26T07:30:00.000Z', 3, 1, 24, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}')
ON CONFLICT(id) DO UPDATE SET
  event_id = excluded.event_id,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  capacity = excluded.capacity,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  visibility_conditions = excluded.visibility_conditions,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');

-- 北島中央教室: 小学生低学年 15:00〜15:40（JST = UTC 06:00〜06:40）
INSERT INTO event_slots
  (id, event_id, starts_at, ends_at, capacity, is_active, sort_order, visibility_conditions)
VALUES
  ('8b0eefbf-b133-4a1d-9bca-45c52ace1be5', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-10-10T06:00:00.000Z', '2026-10-10T06:40:00.000Z', 3, 1, 16, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('da30ef13-9813-4696-a8e6-c52d6b033d9e', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-10-24T06:00:00.000Z', '2026-10-24T06:40:00.000Z', 3, 1, 17, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('5a5a9ea2-8149-45f6-bd11-bfe7d2a479fe', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-07T06:00:00.000Z', '2026-11-07T06:40:00.000Z', 3, 1, 18, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('b5d4a4fa-db24-4c53-b6e8-0d8aa1778e9d', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-14T06:00:00.000Z', '2026-11-14T06:40:00.000Z', 3, 1, 19, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('17681b1f-f35e-405e-8711-eb06a0a0b03b', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-21T06:00:00.000Z', '2026-11-21T06:40:00.000Z', 3, 1, 20, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('407c6c6d-169a-4400-8e18-f8b452773068', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-11-28T06:00:00.000Z', '2026-11-28T06:40:00.000Z', 3, 1, 21, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('b1c4a4cc-9bd3-4a3a-ac5f-090935a8804b', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-12-12T06:00:00.000Z', '2026-12-12T06:40:00.000Z', 3, 1, 22, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('6713b2e0-4ff1-401d-8e32-77fe653e5e72', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-12-19T06:00:00.000Z', '2026-12-19T06:40:00.000Z', 3, 1, 23, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}'),
  ('2a5ad756-1c70-4395-ba1e-563744793f91', 'dec4cc02-3d28-41d0-a725-642a1364dafd', '2026-12-26T06:00:00.000Z', '2026-12-26T06:40:00.000Z', 3, 1, 24, '{"logic":"and","conditions":[{"fieldId":"field_5637a98b","operator":"in","values":["北島中央教室（北島町）"]}]}')
ON CONFLICT(id) DO UPDATE SET
  event_id = excluded.event_id,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  capacity = excluded.capacity,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  visibility_conditions = excluded.visibility_conditions,
  deleted_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');

-- 友だち追加時の案内: 会場別の時間が分かる表現へ更新する。
UPDATE scenario_steps
SET message_content = '友だち追加ありがとうございます🌿

ECCジュニア藍住教室・大学前教室・北島中央教室の「土曜・英語絵本イベント」にご関心をお寄せいただき、ありがとうございます。

英語絵本、歌、手遊び、活動やゲームを楽しむ、40分・1回完結型の少人数イベントです。英語が初めてでも、1回だけでも参加できます。

【藍住・大学前】
幼児　11:00〜11:40
小学生低学年　11:50〜12:30

【北島中央】
小学生低学年　15:00〜15:40
幼児　15:50〜16:30

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
SET message_content = '英語絵本イベントについて、気になることはありませんか🌿

知りたい内容を、次の言葉のまま1つ送ってください。

「日程」　開催日と時間
「場所」　藍住・大学前・北島中央の開催日
「料金」　参加費と参加確定までの流れ
「予約」　クラス別の予約ページ
「空席」　最新の空き状況
「キャンセル」　変更・キャンセル方法

英語が初めての場合や、アレルギーなど個別に確認したいことは、文章でそのままお送りください。スタッフが確認します。'
WHERE id = 'e7dddf55-7d63-4cd0-a725-6e165ae7772c'
  AND scenario_id = '4d84f40a-7b5e-4856-9414-b4452211e14c';

-- リッチメニューと通常キーワードの「日程」は同じ最新内容を返す。
UPDATE auto_replies
SET response_content = '2026年10月〜12月の土曜日に開催します🌿

【藍住・大学前】
幼児　11:00〜11:40
小学生低学年　11:50〜12:30

【北島中央】
10/10・10/24
11/7・11/14・11/21・11/28
12/12・12/19・12/26
小学生低学年　15:00〜15:40
幼児　15:50〜16:30

▼幼児（2〜5歳）日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=887d5545-7b60-425d-9c24-91d36e84d1ed

▼小学生低学年 日程・空席・予約
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=dec4cc02-3d28-41d0-a725-642a1364dafd

予約画面で希望教室を選ぶと、その教室で受付中の日程と最新の空席が表示されます。12/5は教室・定員確定後に受付を開始します。'
WHERE id IN (
  '19fffe9c-288d-48e5-af8c-5dfae0f2ac3f',
  '56774ad3-d21d-4ddd-851f-315d46bbb73a'
)
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

-- 「場所」「教室」キーワードにも北島中央の日程と会場別時間を反映する。
UPDATE auto_replies
SET response_content = '会場はECCジュニア藍住教室・大学前教室・北島中央教室です🌿

藍住：10/3・10/17・10/31・11/7・11/14・11/28・12/12・12/19
大学前：10/10・10/24・11/14・11/21・11/28・12/12・12/26
北島中央：10/10・10/24・11/7・11/14・11/21・11/28・12/12・12/19・12/26

【藍住・大学前】
幼児　11:00〜11:40
小学生低学年　11:50〜12:30

【北島中央】
小学生低学年　15:00〜15:40
幼児　15:50〜16:30

12/5は開催日確定、教室・定員は調整中です。予約画面で希望教室を選ぶと、その教室で受付中の日程だけが表示されます。'
WHERE id IN (
  '3cdadf30-be52-4e04-af4c-38d8db37f137',
  '9ad98fd2-e278-45c5-9cb6-bce7e00ccef5'
)
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';
