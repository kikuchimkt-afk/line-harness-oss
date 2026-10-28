-- Cross-account redirects between Aikotoba (preschool events) and
-- ECC Junior Events Tokushima (elementary presentation contest).
-- Generated from production state on 2026-09-17. Idempotent: fixed IDs.
-- Rollback: rollback-aikotoba-ecc-events-cross-redirects.sql

-- 1. Dedicated referral routes so each redirect is measurable separately.
INSERT OR IGNORE INTO entry_routes (id, ref_code, name, tag_id, scenario_id, redirect_url, is_active, pool_id, intro_template_id, run_account_friend_add_scenarios)
SELECT 'c3f1e0a4-6b2d-4f7e-9a1c-5d8b2e4f7a10', 'preschool-autumn-2026-ecc-events', '2026秋｜未就学児英語イベント（ECCジュニアイベントから誘導）',
       tag_id, scenario_id, NULL, 1, pool_id, NULL, run_account_friend_add_scenarios
FROM entry_routes WHERE ref_code = 'preschool-autumn-2026';

INSERT OR IGNORE INTO entry_routes (id, ref_code, name, tag_id, scenario_id, redirect_url, is_active, pool_id, intro_template_id, run_account_friend_add_scenarios)
SELECT 'e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21', 'tokushima-kids-english-2026-aikotoba', '2026小学生英語プレゼン大会（あいことばから誘導）',
       tag_id, scenario_id, NULL, 1, pool_id, NULL, run_account_friend_add_scenarios
FROM entry_routes WHERE ref_code = 'tokushima-kids-english-2026';

-- 2. ECC Junior Events: preschool keywords stop here and point to Aikotoba.

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d11', '2歳', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d12', '3歳', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d13', '4歳', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d14', '5歳', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d15', '秋イベント', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d16', '秋イベント日程', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d17', '秋イベント料金', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d18', '秋イベント予約確認', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d19', '秋イベントキャンセル', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d1a', '未就学児', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d1b', '未就学児イベント', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)
VALUES ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d1c', '幼児イベント', 'exact', 'text', 'お問い合わせありがとうございます。

未就学児（2〜5歳）向けの「秋の英語イベント」は、ECCジュニアの公式LINE「あいことば」でご案内・ご予約を受け付けています。
このLINE（ECCジュニアイベント｜徳島）では、未就学児イベントの受付は行っていません。

お手数ですが、次のリンクから「あいことば」を友だち追加してください。お子さまの年齢に合う日程と予約ページをご案内します。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/preschool-autumn-2026-ecc-events

すでに「あいことば」を友だち追加済みの方は、「あいことば」のトークで「秋イベント日程」とお送りください。', NULL, 'd2e21719-b3d3-4130-a760-b6ec7700fc87', 1)
ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type, response_type = excluded.response_type,
  response_content = excluded.response_content, template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;


-- 3. Aikotoba: contest keywords (previously linking to deleted practice events) point to ECC Junior Events.

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = 'お問い合わせありがとうございます。

「第1回 徳島県小学生英語プレゼンテーションコンテスト（仮称）」のご案内と練習レッスンのご予約は、公式LINE「ECCジュニアイベント｜徳島」で行っています。
この「あいことば」では、大会の受付は行っていません。

お手数ですが、次のリンクから「ECCジュニアイベント｜徳島」を友だち追加し、同じ言葉をお送りください。
https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/tokushima-kids-english-2026-aikotoba

大会の概要は、公式ページでもご覧いただけます。
https://tokushima-elementary-english-presentation-2026.vercel.app'
WHERE line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a' AND id IN ('40415ad3-a9d7-4abd-baf7-b4e751b34ecf', '70460279-9ce0-4470-96d2-52b0b2b5735e', 'a05b985b-e5bb-495d-ad7f-4886f3abffbb', '24e0f932-5e06-426e-9398-4a63e04c88f5', '741a5c4e-1794-4fee-9ed9-4832fd56c1cf', '452b277b-b217-43dc-a981-e630fcc814cf', '3b52a655-2453-424d-8fe5-e996b36688a8', '7137ace0-d1d1-4008-be3d-afd8ba1feeff', '992ff4a0-826d-4c35-a6e1-0e0e44c8facf', '7cbeb80e-1331-44fa-8323-dca01a93d50d', '553aad0f-ab4b-494c-b621-9d49443292be', '4aa2c2fb-1a98-4c44-8374-418a1bf418fc', '6d07c527-0d40-4e6e-b0a9-0854bb060287');
