-- 英検集中講座の対象学年・所属・実施会場を案内チラシに合わせる。
-- 既存の申込回答・予約・日程枠は保持し、フォームとイベント設定だけを更新する。

UPDATE forms
SET description = '【受講料（税込）】

■ ベストワン藍住校・北島中央校の登録生
小学生（小4〜6）　12,705円
中学1・2年生　13,794円
中学3年生　14,520円
高校1・2年生　14,520円
高校3年生　15,246円

■ ECCジュニア英会話生・その他の外部生
小学生（小4〜6）　16,940円
中学1・2年生　18,392円
中学3年生　19,360円
高校1・2年生　19,360円
高校3年生　20,328円

教材費：一律2,000円（受講料とは別途必要です）
期間中は開講日に回数上限なく受講できます。
実施会場：ECCベストワン藍住校
北島中央校の登録生も藍住校で受講できます。

受講に必要な情報をご入力ください。お申し込み後、続けて参加日程を予約できます。',
    fields = '[{"name":"q1","label":"受講者氏名","type":"text","required":true,"placeholder":"例：菊池 花子"},{"name":"q2","label":"保護者氏名","type":"text","required":true,"placeholder":"例：菊池 淳"},{"name":"q3","label":"学校名","type":"text","required":true,"placeholder":"例：藍住中学校"},{"name":"q4","label":"学年","type":"radio","required":true,"options":["小学4年生","小学5年生","小学6年生","中学1年生","中学2年生","中学3年生","高校1年生","高校2年生","高校3年生","その他"]},{"name":"q5","label":"受検予定級","type":"radio","required":true,"options":["5級","4級","3級","準2級"]},{"name":"q6","label":"所属","type":"radio","required":true,"options":["ECCベストワン藍住校","ECCベストワン北島中央校","ECCジュニア藍住教室","ECCジュニア北島中央教室","ECCジュニア大学前教室","ECCジュニア板野駅前教室","その他"]},{"name":"q8","label":"受講区分","type":"radio","required":true,"options":["ベストワン藍住校・北島中央校の登録生","ECCジュニア英会話生","その他の外部生"]},{"name":"q7","label":"事前に伝えておきたいこと","type":"textarea","required":false,"placeholder":"受講について確認したいことがあればご記入ください"}]',
    updated_at = datetime('now')
WHERE id = '0e47b534-da27-430b-9024-be0c88f38785';

UPDATE events
SET venue_name = 'ECCベストワン藍住校',
    description = '2026年9月1日から10月2日までの英検集中講座です。\n期間中は受講回数の上限なく、参加したい日時を複数選択できます。\n実施会場はECCベストワン藍住校です。北島中央校の登録生も藍住校で受講できます。\n\n火曜日・金曜日　16:00〜18:00\n土曜日　14:30〜16:30',
    booking_form_fields = '[{"id":"student_name","label":"受講者氏名","type":"text","required":true,"placeholder":"例：山田 太郎"},{"id":"grade","label":"学年","type":"select","required":true,"options":["小学4年生","小学5年生","小学6年生","中学1年生","中学2年生","中学3年生","高校1年生","高校2年生","高校3年生","その他"]},{"id":"campus","label":"受講会場","type":"select","required":true,"options":["ECCベストワン藍住校"]},{"id":"note","label":"教室へ伝えておきたいこと","type":"textarea","required":false,"placeholder":"必要があればご記入ください"}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id = 'eiken-intensive-2026-autumn';
