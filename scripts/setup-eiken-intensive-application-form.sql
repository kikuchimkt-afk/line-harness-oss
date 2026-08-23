-- 英検集中講座 受講申込フォーム
-- 既存回答を保持したまま、入力例・受講区分・回答後の予約導線を更新する。

UPDATE forms
SET description = '【受講料（税込）】

■ ベストワン藍住校・北島中央校の登録生
小学生　12,705円
中学1・2年生　13,794円
中学3年生　14,520円
高校1・2年生　14,520円
高校3年生　15,246円

■ ECCジュニア英会話生・その他の外部生
小学生　16,940円
中学1・2年生　18,392円
中学3年生　19,360円
高校1・2年生　19,360円
高校3年生　20,328円

教材費：一律2,000円（受講料とは別途必要です）
期間中は開講日に回数上限なく受講できます。

受講に必要な情報をご入力ください。お申し込み後、続けて参加日程を予約できます。',
    fields = '[{"name":"q1","label":"受講者氏名","type":"text","required":true,"placeholder":"例：菊池 花子"},{"name":"q2","label":"保護者氏名","type":"text","required":true,"placeholder":"例：菊池 淳"},{"name":"q3","label":"学校名","type":"text","required":true,"placeholder":"例：藍住中学校"},{"name":"q4","label":"学年","type":"radio","required":true,"options":["中学1年生","中学2年生","中学3年生","高校1年生","高校2年生","高校3年生","その他"]},{"name":"q5","label":"受検予定級","type":"radio","required":true,"options":["5級","4級","3級","準2級","準2級プラス","2級","準1級","未定"]},{"name":"q6","label":"希望校舎","type":"radio","required":true,"options":["藍住校","北島中央校"]},{"name":"q8","label":"受講区分","type":"radio","required":true,"options":["ベストワン藍住校・北島中央校の登録生","ECCジュニア英会話生","その他の外部生"]},{"name":"q7","label":"事前に伝えておきたいこと","type":"textarea","required":false,"placeholder":"受講について確認したいことがあればご記入ください"}]',
    on_submit_message_type = 'text',
    on_submit_message_content = '【お申し込みを受け付けました】
お申し込みありがとうございます。

続けて、参加する日程をご予約ください。期間中は複数の日程を選択でき、受講回数の上限はありません。

▼日程を予約する
https://liff.line.me/2011208604-KwiGeUqO/?page=event&id=eiken-intensive-2026-autumn

▼開講日程を見る
https://eiken-intensive-schedule-lp-2026.vercel.app/

▼受講料を見る
https://eiken-intensive-tuition-lp-2026.vercel.app/

確認が必要な場合は、教室からご連絡します。ご不明な点は、このトークへメッセージをお送りください。',
    save_to_metadata = 1,
    is_active = 1,
    updated_at = datetime('now')
WHERE id = '0e47b534-da27-430b-9024-be0c88f38785';
