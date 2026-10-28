# 本番反映の記録

本番（Worker `ecc-tokushima-harness`／管理画面 Pages `ecc-tokushima-harness-admin-bd3bc565`）に出した版と、その元になったコミットの対応表です。

- 反映は `node scripts/release/deploy.mjs` で行い、このファイルの末尾に1行ずつ自動で追記されます（手で消したり並べ替えたりしない）。
- スクリプトは、表の最後の行と本番の現在の版が一致しないと止まります。記録にない反映が見つかったら、原因を調べてから行を追記してください。
- ルールは `AGENTS.md` の「本番は main の1系統だけ」を参照。

## 2026-10-28 以前（調査で復元した記録）

| 日時（JST） | 対象 | 版 | コミット | 系統 | 確認方法 |
|---|---|---|---|---|---|
| 2026-09-29 16:13 | admin | 368942c7 | 137101e | main | Pages の記録 |
| 2026-10-01 01:51 | worker | e1534f24 | 0fb2368 | codex/form-definition-auth | 反映メッセージ |
| 2026-10-01 04:08 | admin | 8bab7721 | 4f1c308 | codex/form-definition-auth | Pages の記録 |
| 2026-10-02 16:53 | worker | 9577c0bf | bfdfe25（推定） | codex/form-definition-auth | 時刻の一致 |
| 2026-10-02 16:54 | admin | 71fb1d2c | bfdfe25（推定） | codex/form-definition-auth | 画面の文言照合 |
| 2026-10-10 23:12 | worker | fd3814c1 | 8e8632d | main | モジュールのバイト一致 |
| 2026-10-12 16:24 | worker | 2c4d2749 | 33f4db4 | main | 反映時のコピーと一致 |
| 2026-10-15 01:44 | worker | 979175e8 | （途中版・個別のコミットなし） | main | — |
| 2026-10-15 14:12 | worker | a8e43a34 | （途中版・個別のコミットなし） | main | — |
| 2026-10-15 14:42 | worker | d94b8824 | 061637f | main | 反映時のコピーと一致 |
| 2026-10-24 22:11 | worker | 2a793770 | （途中版・個別のコミットなし） | main | — |
| 2026-10-24 22:25 | worker | ab0175f0 | 89589cf | main | モジュールのバイト一致 |
| 2026-10-28 21:34 | worker | c68d67d4 | 1898138 | codex/upstream-security-backport（PR #2・main 未統合） | モジュールのバイト一致 |

10/10 に Worker が main 系統へ戻ったとき、`codex/form-definition-auth` にしかなかった Worker の機能（タグ別リッチメニューなど）が外れました。管理画面は 10/2 の版のままです。

## deploy.mjs による記録

| 日時（JST） | 対象 | 版 | コミット | 系統 | 確認方法 |
|---|---|---|---|---|---|
| 2026-10-28 22:11 | worker | d406d746 | 7e784e6 | main | deploy.mjs |
| 2026-10-28 22:36 | worker | 5b071ebe | 1193e1f | main | deploy.mjs |
