-- 英検第3回の申込を、承認（確定）後も申込者自身がキャンセルできるようにする。
-- L Harness は cancel_deadline_hours_before が NULL だと LIFF からのキャンセルを受け付けないため、
-- 申込締切の 12月4日（金）の終わりまでに切れるよう、級ごとに「試験開始の何時間前」を入れる。
--   5級 11:20 → 1188時間前＝12/4 23:20 ／ 4級 13:00 → 1189＝12/5 0:00
--   3級 14:40 → 1191＝12/4 23:40 ／ 準2級 17:00 → 1193＝12/5 0:00 ／ 2級 19:15 → 1196＝12/4 23:15
-- waitlist_enabled は 0 のままなので、時間数が申込者の画面に出ることはない。再実行可。

UPDATE events SET cancel_deadline_hours_before = 1188 WHERE id = 'eiken-2026-r3-5kyu';
UPDATE events SET cancel_deadline_hours_before = 1189 WHERE id = 'eiken-2026-r3-4kyu';
UPDATE events SET cancel_deadline_hours_before = 1191 WHERE id = 'eiken-2026-r3-3kyu';
UPDATE events SET cancel_deadline_hours_before = 1193 WHERE id = 'eiken-2026-r3-p2kyu';
UPDATE events SET cancel_deadline_hours_before = 1196 WHERE id = 'eiken-2026-r3-2kyu';

-- 申込ページの説明と、申込受付時に届く案内の文面をそろえる。
UPDATE events
SET description = REPLACE(
      description,
      'お申し込み後、教室で確認してから確定のご連絡をします。',
      'お申し込み後、教室で確認してから確定のご連絡をします。
※12月4日（金）までは、確定後も申込履歴からご自身でキャンセルできます。'
    ),
    confirmation_message_extra = REPLACE(
      confirmation_message_extra,
      '取り消しや変更は、このトークへご連絡ください。',
      '12月4日（金）までは、申込履歴からご自身でキャンセルできます。それ以降の取り消し・変更は、このトークへご連絡ください。'
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN ('eiken-2026-r3-5kyu', 'eiken-2026-r3-4kyu', 'eiken-2026-r3-3kyu', 'eiken-2026-r3-p2kyu', 'eiken-2026-r3-2kyu')
  AND instr(description, 'ご自身でキャンセル') = 0;  -- D1 は長い LIKE パターンを受け付けない
