-- 英検集中講座｜受講者専用 リッチメニュー
-- 画像内の4カードにタップ領域を合わせ、各導線を本番URLへ接続する。

UPDATE rich_menu_areas
SET bounds_x = 25,
    bounds_y = 275,
    bounds_width = 1200,
    bounds_height = 670,
    action_type = 'uri',
    action_data = '{"uri":"https://ecc-tokushima-harness.kikuchi-mkt.workers.dev/r/eiken-intensive-application?form=0e47b534-da27-430b-9024-be0c88f38785"}'
WHERE id = '1e61690c-93a1-4eb0-a4af-a3e8a36b867c'
  AND page_id = '0dec2d47-504b-4215-8ca7-073201a535b1';

UPDATE rich_menu_areas
SET bounds_x = 1275,
    bounds_y = 275,
    bounds_width = 1200,
    bounds_height = 670,
    action_type = 'uri',
    action_data = '{"uri":"https://eiken-intensive-tuition-lp-2026.vercel.app/"}'
WHERE id = 'c89635c1-8495-4843-a6cd-c3b8fe7650e9'
  AND page_id = '0dec2d47-504b-4215-8ca7-073201a535b1';

UPDATE rich_menu_areas
SET bounds_x = 25,
    bounds_y = 995,
    bounds_width = 1200,
    bounds_height = 666,
    action_type = 'uri',
    action_data = '{"uri":"https://liff.line.me/2011208604-KwiGeUqO/?page=event&id=eiken-intensive-2026-autumn"}'
WHERE id = '6db88efa-2284-4dda-b538-a439e48cd730'
  AND page_id = '0dec2d47-504b-4215-8ca7-073201a535b1';

UPDATE rich_menu_areas
SET bounds_x = 1275,
    bounds_y = 995,
    bounds_width = 1200,
    bounds_height = 666,
    action_type = 'message',
    action_data = '{"text":"お知らせ"}'
WHERE id = '13d3fe40-a5aa-41db-8033-0d91b91d959b'
  AND page_id = '0dec2d47-504b-4215-8ca7-073201a535b1';
