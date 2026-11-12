-- 英検第3回（準会場・北島中央校）の案内から「3級以上は顔写真付きの身分証明書が必要」を外す。
-- 身分証明書が必要なのは本会場受験の場合で、準会場の一次試験では不要（2026-11-12 担当者の指摘）。
-- 対象（本番 D1 で確認済み）：
--   1. 3級・準2級・2級の申込ページの説明文（events.description）の1行
--   2. 確定通知・前日リマインドの案内文（events.confirmation_message_extra）→ 全級とも筆記用具だけ
--   3. 合言葉「3級」「準2級」「2級」で返す Flex カードの1行（auto_replies.response_content）
-- 長い LIKE は D1 が拒否するので instr で絞る。再実行可（該当がなければ何も変えない）。

UPDATE events
SET description = REPLACE(description, char(10) || '※3級以上は、顔写真付きの身分証明書（原本）が必要です。', ''),
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN ('eiken-2026-r3-3kyu', 'eiken-2026-r3-p2kyu', 'eiken-2026-r3-2kyu')
  AND instr(description, '身分証明書') > 0;

UPDATE events
SET confirmation_message_extra = '当日は、HBの黒鉛筆またはシャープペンシルと消しゴムをお持ちください。開始時間は10〜15分前後する場合があります。会場はECCジュニア・ベストワン北島中央校です。',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN ('eiken-2026-r3-3kyu', 'eiken-2026-r3-p2kyu', 'eiken-2026-r3-2kyu')
  AND instr(confirmation_message_extra, '身分証明書') > 0;

UPDATE auto_replies
SET response_content = REPLACE(response_content, '\n※当日は顔写真付きの身分証（原本）が必要です。', '')
WHERE id IN ('56b96824-b0f0-48e2-91b5-ed858d4627d9', '5aae4be1-4ce6-48f0-88d9-31aa9c6e3efd', 'dd22ba96-7b55-4e6f-8eb4-34d8598d179c')
  AND instr(response_content, '身分証') > 0;
