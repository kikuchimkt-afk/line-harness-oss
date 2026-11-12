-- あいことば の合言葉「英検」を、夏の英検オンライン勉強会の古い案内から
-- 2026年度第3回英検の申込案内（「英検申込」と同じ動き）に差し替える。
-- 前提: setup-eiken-2026-round3-aikotoba.sql 適用済み。再実行可。

-- 古い案内（text）を silent にして、返信はオートメーションに任せる。
UPDATE auto_replies
SET response_type = 'silent', response_content = '', template_id = NULL, is_active = 1
WHERE id = 'bfee1a19-db9a-4622-8235-c99f4e00ff1b'
  AND keyword = '英検'
  AND line_account_id = '0797696f-e377-4132-bb17-77bc1db29b0a';

-- 「英検申込」のオートメーションと同じ内容を「英検」にも付ける。
INSERT INTO automations (id, name, description, event_type, conditions, actions, is_active, priority, line_account_id)
SELECT '5d5c3b49-adff-4bd3-ae5a-9ead3a47e877', '英検2026第3回｜「英検」→案内',
       '「英検」と送った方へ、流入タグを付けて第3回の日程と級の選び方を送ります（旧：夏の勉強会案内）。',
       event_type, '{"keyword_exact":"英検"}', actions, 1, priority, line_account_id
FROM automations WHERE id = '546d6fdf-fd89-4d14-8c7c-88a376dae27d'
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, description = excluded.description, event_type = excluded.event_type,
  conditions = excluded.conditions, actions = excluded.actions, is_active = excluded.is_active,
  priority = excluded.priority, line_account_id = excluded.line_account_id,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours');
