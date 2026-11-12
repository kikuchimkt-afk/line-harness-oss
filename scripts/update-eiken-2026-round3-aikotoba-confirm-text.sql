-- 英検第3回の申込ページの confirmation_message_extra を、確定後・試験前日に読んで自然な文面にする。
-- この文は (1) L Harness 管理画面で承認したときの「運営からのご案内」の既定値、
--          (2) 試験前日のリマインドの「教室からのご案内」に入る。
-- 申込管理ダッシュボードから承認したときは、ダッシュボードが確定用の文面を別に渡す。
-- 以前の文（「教室で内容を確認し、確定のご連絡をします」）は申込受付時向けで、確定の通知に合わなかった。再実行可。

UPDATE events
SET confirmation_message_extra = '当日は、HBの黒鉛筆またはシャープペンシルと消しゴムをお持ちください。開始時間は10〜15分前後する場合があります。会場はECCジュニア・ベストワン北島中央校です。',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN ('eiken-2026-r3-5kyu', 'eiken-2026-r3-4kyu');

UPDATE events
SET confirmation_message_extra = '当日は、HBの黒鉛筆またはシャープペンシルと消しゴム、顔写真付きの身分証明書（原本）をお持ちください。開始時間は10〜15分前後する場合があります。会場はECCジュニア・ベストワン北島中央校です。',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN ('eiken-2026-r3-3kyu', 'eiken-2026-r3-p2kyu', 'eiken-2026-r3-2kyu');
