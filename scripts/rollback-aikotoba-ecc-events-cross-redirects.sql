-- Rollback for setup-aikotoba-ecc-events-cross-redirects.sql
-- Restores the 13 Aikotoba contest replies captured before the change and
-- removes only the rows that the setup script created.

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '第1回 徳島県小学生英語プレゼンテーションコンテスト（仮称）は、2026年11月15日（日）にシビックセンター4階 さくらホールで開催予定です。

詳しいご案内
https://tokushima-elementary-english-presentation-2026.vercel.app

「プレゼン大会概要」「プレゼン大会申込」「プレゼン大会練習」のいずれかを送ると、内容別に確認できます。'
WHERE id = '40415ad3-a9d7-4abd-baf7-b4e751b34ecf' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '【大会概要】
2026年11月15日（日）14:00〜17:05（17:20退場）
シビックセンター4階 さくらホール
テーマは「日本」、発表時間は1分〜1分30秒です。
対象は徳島県内在住の小学生で、3部門・合計およそ45名を予定しています。

学年区分などの調整中項目は、確定後にご案内します。'
WHERE id = '70460279-9ce0-4470-96d2-52b0b2b5735e' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '申込開始日と申込方法は現在準備中です。確定後、このLINEと大会公式ページでお知らせします。

申込締切は2026年11月10日（火）23:59です。ただし、定員に達した場合は締切前に受付を終了します。参加費は2,000円です。'
WHERE id = 'a05b985b-e5bb-495d-ad7f-4886f3abffbb' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '練習レッスンの正式日程は現在調整中です。関係者が予約・承認・待機の動作を確認できるよう、教室別に【運用確認用・仮日程】を公開しています。ここでの予約は正式日程の確定を示すものではありません。

【藍住教室｜土曜13:00〜14:00】
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=4efba7ae-6ff0-4963-b2d6-d638b583ee68

【大学前教室｜日曜14:00〜15:00】
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=4abc509c-ac26-4279-9810-b4bb273e0b70

運用確認中は実在する保護者・児童の個人情報を入力せず、仮名でお試しください。確認後のデータは削除します。

正式な受付開始時には、このLINEで改めてお知らせします。'
WHERE id = '24e0f932-5e06-426e-9398-4a63e04c88f5' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '【藍住教室｜運用確認用・仮日程】
土曜13:00〜14:00の予約画面です。
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=4efba7ae-6ff0-4963-b2d6-d638b583ee68

正式日程の確定を示すものではありません。運用確認中は実在する保護者・児童の個人情報を入力せず、仮名でお試しください。確認後のデータは削除します。'
WHERE id = '741a5c4e-1794-4fee-9ed9-4832fd56c1cf' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '【大学前教室｜運用確認用・仮日程】
日曜14:00〜15:00の予約画面です。
https://liff.line.me/2010714049-6L0KFjN7/?page=event&id=4abc509c-ac26-4279-9810-b4bb273e0b70

正式日程の確定を示すものではありません。運用確認中は実在する保護者・児童の個人情報を入力せず、仮名でお試しください。確認後のデータは削除します。'
WHERE id = '452b277b-b217-43dc-a981-e630fcc814cf' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '会場は、シビックセンター4階 さくらホールです。
徳島県徳島市元町1丁目24番地 アミコ内

開催時間は14:00〜17:05、退場は17:20までの予定です。駐車場などの詳細は確認後に大会公式ページでご案内します。'
WHERE id = '3b52a655-2453-424d-8fe5-e996b36688a8' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '参加費は2,000円です。支払方法、キャンセル・返金の取扱いは現在確認中です。確定後、このLINEと大会公式ページでご案内します。'
WHERE id = '7137ace0-d1d1-4008-be3d-afd8ba1feeff' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '一般来場者による会場内での写真撮影・動画撮影・録音・ライブ配信はできません。主催者による記録や広報利用の範囲、同意方法は確認後にご案内します。'
WHERE id = '992ff4a0-826d-4c35-a6e1-0e0e44c8facf' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '練習レッスンの予約内容は、次の予約履歴画面で確認できます。
https://liff.line.me/2010714049-6L0KFjN7/?page=event-me

現在公開している枠は【運用確認用・仮日程】です。正式日程の確定と本番受付の開始は、このLINEで改めてお知らせします。'
WHERE id = '7cbeb80e-1331-44fa-8323-dca01a93d50d' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '【プレゼン大会メニュー】
知りたい項目を、そのまま送ってください。

プレゼン大会概要
プレゼン大会申込
プレゼン大会練習
プレゼン大会練習藍住
プレゼン大会練習大学前
プレゼン大会会場
プレゼン大会参加費
プレゼン大会撮影
プレゼン大会予約確認
プレゼン大会FAQ
担当者相談

大会公式ページ
https://tokushima-elementary-english-presentation-2026.vercel.app'
WHERE id = '553aad0f-ab4b-494c-b621-9d49443292be' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = '【よくあるご質問】
次のキーワードを、そのまま送ってください。

日程・対象・発表時間：プレゼン大会概要
申込開始・締切：プレゼン大会申込
練習の仮予約一覧：プレゼン大会練習
藍住教室：プレゼン大会練習藍住
大学前教室：プレゼン大会練習大学前
場所・開催時間：プレゼン大会会場
費用・支払方法：プレゼン大会参加費
撮影・録音：プレゼン大会撮影
予約履歴：プレゼン大会予約確認
個別のご相談：担当者相談'
WHERE id = '4aa2c2fb-1a98-4c44-8374-418a1bf418fc' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

UPDATE auto_replies SET response_type = 'text', template_id = NULL, response_content = 'お問い合わせありがとうございます。資料上の大会名は「第1回 徳島県小学生英語プレゼンテーションコンテスト（仮称）」です。

自分で考えた「日本」をテーマに、英語で1分〜1分30秒のプレゼンテーションを行います。現時点の資料には暗唱必須との記載はありません。正式な発表ルールは確定後にご案内します。'
WHERE id = '6d07c527-0d40-4e6e-b0a9-0854bb060287' AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

DELETE FROM auto_replies WHERE line_account_id = 'd2e21719-b3d3-4130-a760-b6ec7700fc87' AND id IN ('b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d11', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d12', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d13', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d14', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d15', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d16', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d17', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d18', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d19', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d1a', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d1b', 'b1d4f6a8-1c3e-4a5b-9d7f-2e4a6c8b0d1c');

DELETE FROM entry_routes WHERE id IN ('c3f1e0a4-6b2d-4f7e-9a1c-5d8b2e4f7a10', 'e7a9b3c5-2d4f-4a6b-8c1d-9f0e3b5a7c21');
