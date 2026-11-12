-- 英検第3回の各級の定員を 10 → 12 名に変更する（2026-11-12 ユーザー指示）。再実行可。

UPDATE event_slots
SET capacity = 12, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN ('eiken-2026-r3-5kyu-0123', 'eiken-2026-r3-4kyu-0123', 'eiken-2026-r3-3kyu-0123',
             'eiken-2026-r3-p2kyu-0123', 'eiken-2026-r3-2kyu-0123');

UPDATE events
SET description = REPLACE(description, '各級の定員は10名程度です', '各級の定員は12名です'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE id IN ('eiken-2026-r3-5kyu', 'eiken-2026-r3-4kyu', 'eiken-2026-r3-3kyu', 'eiken-2026-r3-p2kyu', 'eiken-2026-r3-2kyu')
  AND instr(description, '各級の定員は10名程度です') > 0;
