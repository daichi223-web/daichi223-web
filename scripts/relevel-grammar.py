# -*- coding: utf-8 -*-
"""
文法道場ドリルのレベル再調整（「べし」基準）v2

レベルは sort の百の位で決まる（dojoData.ts: drillLevel = min(5, sort//100+1)）。
  L1=sort1-99  L2=100台  L3=200台  L4=300台

設計思想（べし基準）:
  Lv1 基礎暗記（接続・活用型・語呂・代表的意味＝本文なしの知識確認）
  Lv2 文中で活用形           Lv3 識別・短文脈の意味        Lv4 入試本文の意味

【方式】「全トピックを同型に強制」ではなく、
  ① 本文なしの知識問題は必ず Lv1。
  ② 残り（本文あり=応用）を難易度スコアで並べ、Lv2/3/4 に比率配分。
     スコア = kind段階(活用形<識別<意味) を主、作問者の旧 sort を従（同種内の
     既存グラデーションを保存）。これで識別だらけの助詞も L2-L4 に階段状に分かれる。
  ③ Lv1 が全体の 10% 未満なら、応用のうち最易のものを Lv1 に繰り上げ（mu 等の救済）。
  ④ 動詞・形容詞トピックは天井を L3 に（活用中心で入試“意味”帯がないため L4→L3）。

使い方:
  python scripts/relevel-grammar.py            # ドライラン
  python scripts/relevel-grammar.py --apply     # seed 書き換え（事前 backup 必須）
"""
import json, glob, os, sys, math
from collections import defaultdict

SEED_DIR = "supabase/seeds"
# 応用問題を L2/L3/L4 に分ける比率（べし: 16/13/15 ≒ .36/.30/.34）
P_L2, P_L3 = 0.38, 0.30   # 残りが L4

def has_ctx(x):
    c = x.get("context")
    return bool(c) and len(str(c).strip()) >= 4

def krank(x):
    """応用問題内の難易度段階。知識問題は -1（=Lv1 確定）。"""
    kind = x.get("kind") or ""
    ctx = has_ctx(x)
    if kind == "setsuzoku":
        return -1
    if kind in ("katsuyo-type", "katsuyo-fill"):
        return 1 if ctx else -1        # 文中活用形 → L2帯 / 知識 → L1
    if kind == "shikibetsu":
        return 2 if ctx else -1        # 本文識別 → L3帯 / 見分け方・語呂 → L1
    if kind == "imi":
        return 3 if ctx else -1        # 本文意味 → L3/L4帯 / 代表的意味 → L1
    return 2 if ctx else -1

def is_drill(x):
    return isinstance(x, dict) and x.get("topic_id") and "choices" in x and "answer" in x

def topic_ceiling(topic):
    if topic.startswith("doushi") or topic.startswith("keiyoshi"):
        return 3   # 活用中心 → L4 帯は作らず L3 に寄せる
    return 4

def relevel_topic(topic, items):
    """items: list of (path, idx, item). 戻り値: list of (path, idx, newsort, level)."""
    n = len(items)
    recs = []
    for (f, i, x) in items:
        recs.append({"f": f, "i": i, "x": x, "k": krank(x),
                     "old": x.get("sort") or 0, "id": x.get("id") or ""})
    knowledge = [r for r in recs if r["k"] == -1]
    applied   = [r for r in recs if r["k"] >= 1]
    # 応用を (kind段階, 旧sort, id) で昇順 = 易→難
    applied.sort(key=lambda r: (r["k"], r["old"], r["id"]))

    # Lv1 救済：知識が 10% 未満なら応用最易を繰り上げ
    need = max(1, round(0.10 * n)) if n else 0
    promoted = []
    if len(knowledge) < need and applied:
        k = min(len(applied), need - len(knowledge))
        promoted = applied[:k]
        applied = applied[k:]

    ceil = topic_ceiling(topic)
    m = len(applied)
    levels = {}   # rec-id(f,i) -> level
    for r in knowledge + promoted:
        levels[(r["f"], r["i"])] = 1
    if m:
        c2 = int(round(m * P_L2))
        c3 = int(round(m * (P_L2 + P_L3)))
        for j, r in enumerate(applied):
            if j < c2:   lv = 2
            elif j < c3: lv = 3
            else:        lv = 4
            levels[(r["f"], r["i"])] = min(lv, ceil)

    # 各レベル内を (旧sort, id) で並べ sort 採番
    by_lvl = defaultdict(list)
    for r in recs:
        by_lvl[levels[(r["f"], r["i"])]].append(r)
    out = []
    for lv in sorted(by_lvl):
        for pos, r in enumerate(sorted(by_lvl[lv], key=lambda r:(r["old"], r["id"])), start=1):
            out.append((r["f"], r["i"], (lv-1)*100 + pos, lv))
    return out

def main():
    apply = "--apply" in sys.argv
    files = sorted(glob.glob(os.path.join(SEED_DIR, "*.json")))
    file_data, topic_items = {}, defaultdict(list)
    for f in files:
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        if not isinstance(d, list): continue
        file_data[f] = d
        for i, x in enumerate(d):
            if is_drill(x): topic_items[x["topic_id"]].append((f, i, x))

    report, changes = [], 0
    for topic in sorted(topic_items):
        items = topic_items[topic]
        before = defaultdict(int)
        for (_, _, x) in items:
            before[min(5, ((x.get('sort') or 0)//100)+1)] += 1
        result = relevel_topic(topic, items)
        after = defaultdict(int)
        for (f, i, newsort, lv) in result:
            after[lv] += 1
            if newsort != (file_data[f][i].get("sort") or 0): changes += 1
            if apply: file_data[f][i]["sort"] = newsort
        b = " ".join(f"L{l}:{before.get(l,0)}" for l in range(1,5))
        a = " ".join(f"L{l}:{after.get(l,0)}" for l in range(1,5))
        warn = "  ⚠L1空" if after.get(1,0)==0 else ""
        report.append(f"{topic:22s} n={len(items):3d} | {b}  ->  {a}{warn}")

    print(f"topics={len(topic_items)} sort変更={changes} apply={apply}")
    open("scripts/relevel-report.txt","w",encoding="utf-8").write("\n".join(report))
    print("レポート: scripts/relevel-report.txt")
    if apply:
        for f, d in file_data.items():
            json.dump(d, open(f,"w",encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"書き換え: {len(file_data)} ファイル")

if __name__ == "__main__":
    main()
