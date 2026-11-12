"""あいことば 英検第3回の案内を、ボタン付きの Flex カードにする SQL を作る。\n\n使い方: python -I scripts/build-eiken-2026-round3-flex.py\n出力:   scripts/update-eiken-2026-round3-aikotoba-flex.sql\n前提:   setup-eiken-2026-round3-aikotoba.sql と update-eiken-2026-round3-aikotoba-keyword.sql 適用済み\nカードの型は「つながるベストワン」の案内カード（クリーム色の本文＋緑のボタン）にそろえる。\n"""
import json
from pathlib import Path

ACCOUNT = "0797696f-e377-4132-bb17-77bc1db29b0a"
LIFF = "2010714049-6L0KFjN7"
TRIAL_URL = "https://trial-for-read-pass-audi-pass.vercel.app/"
WINTER_LP = "https://bestone-tokushima-winter-2026.vercel.app/"
# あいことばの既存カード（プラム #5B3350・淡いモーブ #E7DFE4）に合わせたパステル。
# パステルの上でも読めるよう、ボタンは濃い文字になる secondary にして色だけ付ける。
PLUM = "#5B3350"
LABEL = "#B07A9A"
INK = "#4A4048"
BODY_BG = "#FFF5F9"
MAIN_BUTTON = "#F6D3E3"   # パステルピンク：申し込む・主な操作
LEVEL_BUTTON = "#E4DEF5"  # パステルラベンダー：級
SUB_BUTTON = "#EEE7EC"    # 淡いモーブ：戻る・確認
TAG_INFLOW = "9fcad10e-5bdf-407a-9b2c-cebc39ffbbd4"

LEVELS = [
    # level, event id, time, fee, automation id, tag id, needs id card
    ("5級", "eiken-2026-r3-5kyu", "11:20〜12:10（50分）", "2,400円", "96542795-8434-49f0-b676-323d68b762ad", "1dfc22ef-500a-40fd-afea-f559c6d003ab", False),
    ("4級", "eiken-2026-r3-4kyu", "13:00〜14:10（70分）", "2,800円", "eb1bb6dc-b128-4aec-a593-d2bc1cc05984", "19c8e5f5-70fa-4db7-8543-ee75c468bba7", False),
    ("3級", "eiken-2026-r3-3kyu", "14:40〜16:10（90分）", "4,900円", "c6ee79eb-6d89-456e-a189-ff05c9c9aeca", "67ac89e8-148d-4c3f-9470-759c925ee6aa", True),
    ("準2級", "eiken-2026-r3-p2kyu", "17:00〜18:45（105分）", "6,000円", "fc15ceff-1511-4d5e-88a3-b324ddf80d40", "9b1882b2-3106-4f0b-a4c9-94fb100fc8a7", True),
    ("2級", "eiken-2026-r3-2kyu", "19:15〜21:05（110分）", "6,800円", "7af9a1c6-eb2f-490f-91d1-6b39dcf3b71d", "ad727121-3722-4b86-a147-6c53f0109e28", True),
]


def text(value, size="sm", bold=False, color=INK):
    item = {"type": "text", "text": value, "size": size, "wrap": True, "color": color}
    if bold:
        item["weight"] = "bold"
    return item


def button(label, *, uri=None, message=None, primary=True, color=None):
    action = {"type": "uri", "label": label, "uri": uri} if uri else {"type": "message", "label": label, "text": message}
    return {
        "type": "button",
        "style": "secondary",
        "color": color or (MAIN_BUTTON if primary else SUB_BUTTON),
        "height": "sm",
        "action": action,
        "margin": "sm",
    }


def row(*buttons):
    for b in buttons:
        b["flex"] = 1
        b.pop("margin", None)
    return {"type": "box", "layout": "horizontal", "spacing": "sm", "margin": "sm", "contents": list(buttons)}


def bubble(title, paragraphs, footer, note=None):
    return {
        "type": "bubble",
        "size": "mega",
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "backgroundColor": BODY_BG,
            "contents": [
                text("あいことば｜英検®のご案内", size="xs", color=LABEL),
                text(title, size="lg", bold=True, color=PLUM),
                *[text(p) for p in paragraphs],
                *([text(note, size="xxs", color="#8A7F88")] if note else []),
            ],
        },
        "footer": {"type": "box", "layout": "vertical", "spacing": "sm", "backgroundColor": "#FFFFFF", "contents": footer},
    }


def level_button(level):
    return button(level, message=level, color=LEVEL_BUTTON)


MENU = bubble(
    "第3回 英検®のお申し込み",
    [
        "一次 1月23日（土）・北島中央校\n申込締切 12月4日（金）",
        "受験する級を選んでください。",
    ],
    [
        row(level_button("5級"), level_button("4級"), level_button("3級")),
        row(level_button("準2級"), level_button("2級")),
        row(button("日程・検定料", message="英検日程", primary=False), button("英検アプリ", message="英検アプリ", primary=False)),
    ],
)


def level_card(level, event_id, time, fee, needs_id):
    lines = [
        f"一次 1月23日（土）{time.split('（')[0]}" + ("\n二次 3月7日（日）" if needs_id else "")
        + f"\n検定料 {fee}＋事務手数料100円\n会場 北島中央校",
        "締切は12月4日（金）。定員10名程度で、教室で確認してから確定します。"
        + ("\n※当日は顔写真付きの身分証（原本）が必要です。" if needs_id else ""),
    ]
    return bubble(
        f"{level}のお申し込み",
        lines,
        [
            button(f"{level}に申し込む", uri=f"https://liff.line.me/{LIFF}/?page=event&id={event_id}"),
            row(button("英検アプリ", message="英検アプリ", primary=False), button("級を選び直す", message="英検申込", primary=False)),
        ],
    )


SCHEDULE = bubble(
    "第3回 英検®の日程・検定料",
    [
        "一次 1月23日（土）北島中央校\n5級　11:20〜　2,400円\n4級　13:00〜　2,800円\n3級　14:40〜　4,900円\n準2級　17:00〜　6,000円\n2級　19:15〜　6,800円",
        "二次 3月7日（日）\n12月15日（火）に検定料＋事務手数料100円を引き落とします。",
    ],
    [
        button("級を選んで申し込む", message="英検申込"),
        button("申込状況を確認する", message="英検申込確認", primary=False),
    ],
)

CONFIRM = bubble(
    "お申し込みの確認",
    [
        "「承認待ち」は教室で確認中です。確定したら、このトークでお知らせします。取り消し・変更はこのトークへどうぞ。",
    ],
    [
        button("申込状況を確認する", uri=f"https://liff.line.me/{LIFF}/?page=event-me"),
        button("級を選んで申し込む", message="英検申込", primary=False),
    ],
)

APP = bubble(
    "冬期講習で英検®アプリが使えます",
    [
        "ECCベストワンの冬期講習を受講すると、英検®対策アプリ「ReadPass」（長文読解）と「AudiPass」（リスニング）をご利用いただけます。体験版もお試しください。",
    ],
    [
        button("アプリの体験版を試す", uri=TRIAL_URL),
        button("冬期講習のご案内を見る", uri=WINTER_LP),
        button("英検®の申込に戻る", message="英検申込", primary=False),
    ],
    note="※英検®は、公益財団法人 日本英語検定協会の登録商標です。このコンテンツは、公益財団法人 日本英語検定協会の承認や推奨、その他の検討を受けたものではありません。",
)


def q(value):
    return "'" + value.replace("'", "''") + "'"


def flex_json(card):
    return json.dumps(card, ensure_ascii=False, separators=(",", ":"))


def automation_update(auto_id, actions):
    return (
        f"UPDATE automations SET actions = {q(json.dumps(actions, ensure_ascii=False, separators=(',', ':')))},\n"
        f"  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')\nWHERE id = {q(auto_id)};\n"
    )


MENU_REPLY_IDS = [
    ("b02e9a04-2433-4107-9e48-e28a6ce9c900", "英検申込"),
    ("bfee1a19-db9a-4622-8235-c99f4e00ff1b", "英検"),
]
LEVEL_REPLY_IDS = {
    "5級": "2416f4e3-0f4e-401a-a0e9-f9c060ac648e",
    "4級": "0342aa50-fe7d-46f6-baaa-6bbd65ab0012",
    "3級": "56b96824-b0f0-48e2-91b5-ed858d4627d9",
    "準2級": "5aae4be1-4ce6-48f0-88d9-31aa9c6e3efd",
    "2級": "dd22ba96-7b55-4e6f-8eb4-34d8598d179c",
}


def reply_upsert(reply_id, keyword, card):
    return (
        "INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, template_id, line_account_id, is_active)\n"
        f"VALUES ({q(reply_id)}, {q(keyword)}, 'exact', 'flex', {q(flex_json(card))}, NULL, {q(ACCOUNT)}, 1)\n"
        "ON CONFLICT(id) DO UPDATE SET keyword = excluded.keyword, match_type = excluded.match_type,\n"
        "  response_type = excluded.response_type, response_content = excluded.response_content,\n"
        "  template_id = NULL, line_account_id = excluded.line_account_id, is_active = 1;\n"
    )


def main():
    # カードは自動応答の「その場の返信」（replyMessage）で返す。後からのプッシュだと
    # 届くのが遅れ、LINE が「新着メッセージ」の帯を出して下へのスクロールが必要になるため。
    # タグ付け・プロフィール記録は、これまでどおりオートメーションが裏で行う。
    out = [
        "-- 生成: scripts/build-eiken-2026-round3-flex.py（手で直さず、生成元を直して作り直す）",
        "-- あいことば 英検第3回の案内を、ボタン付きの Flex カードにする。再実行可。",
        "",
        "-- 流入シナリオ（友だち追加直後）",
        f"UPDATE scenario_steps SET message_type = 'flex', message_content = {q(flex_json(MENU))}\nWHERE id = 'e2b36bb1-6f05-4b98-b084-1fe21cc7d7e3';",
        "",
        "-- 「英検申込」「英検」→ 級を選ぶカード（その場の返信）",
    ]
    for reply_id, keyword in MENU_REPLY_IDS:
        out.append(reply_upsert(reply_id, keyword, MENU))
    for auto_id in ("546d6fdf-fd89-4d14-8c7c-88a376dae27d", "5d5c3b49-adff-4bd3-ae5a-9ead3a47e877"):
        out.append(automation_update(auto_id, [{"type": "add_tag", "params": {"tagId": TAG_INFLOW}}]))
    out.append("-- 級を選んだとき → 級の申込カード（その場の返信）＋タグ・記録（オートメーション）")
    for level, event_id, time, fee, auto_id, tag_id, needs_id in LEVELS:
        out.append(reply_upsert(LEVEL_REPLY_IDS[level], level, level_card(level, event_id, time, fee, needs_id)))
        out.append(automation_update(auto_id, [
            {"type": "add_tag", "params": {"tagId": TAG_INFLOW}},
            {"type": "add_tag", "params": {"tagId": tag_id}},
            {"type": "set_metadata", "params": {"data": json.dumps({"eiken_2026_3_grade": level}, ensure_ascii=False)}},
        ]))
    out.append("-- 日程・確認・アプリの合言葉 → カード")
    for reply_id, keyword, card in [
        ("5e5915e9-a622-4d94-aff4-51c4ad5c88ab", "英検日程", SCHEDULE),
        ("5e92b82e-af95-4105-b225-013452f24d35", "英検料金", SCHEDULE),
        ("91d80313-35e2-497e-ad65-d8277c88e0b5", "英検申込確認", CONFIRM),
        ("ae1796fe-8a83-48dc-8706-ca6157ef8ecb", "英検アプリ", APP),
    ]:
        out.append(reply_upsert(reply_id, keyword, card))
    path = Path(__file__).with_name("update-eiken-2026-round3-aikotoba-flex.sql")
    path.write_text("\n".join(out), encoding="utf-8", newline="\n")
    print(path)


if __name__ == "__main__":
    main()
