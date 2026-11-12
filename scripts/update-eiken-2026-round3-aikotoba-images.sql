-- 英検第3回の5つの申込ページに写真を設定する（管理画面のイベント一覧・LIFF の申込ページに表示）。
-- 写真は xAI grok-imagine-image-2.0 で生成（パステル調・文字なし）し、
-- 申込管理ダッシュボード（eiken-2026-round3-manager）の public/images に置いている。再実行可。

UPDATE events SET image_url = 'https://eiken-2026-round3-manager.vercel.app/images/eiken-r3-5kyu.jpg',
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'eiken-2026-r3-5kyu';
UPDATE events SET image_url = 'https://eiken-2026-round3-manager.vercel.app/images/eiken-r3-4kyu.jpg',
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'eiken-2026-r3-4kyu';
UPDATE events SET image_url = 'https://eiken-2026-round3-manager.vercel.app/images/eiken-r3-3kyu.jpg',
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'eiken-2026-r3-3kyu';
UPDATE events SET image_url = 'https://eiken-2026-round3-manager.vercel.app/images/eiken-r3-p2kyu.jpg',
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'eiken-2026-r3-p2kyu';
UPDATE events SET image_url = 'https://eiken-2026-round3-manager.vercel.app/images/eiken-r3-2kyu.jpg',
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'eiken-2026-r3-2kyu';
