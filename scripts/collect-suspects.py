# -*- coding: utf-8 -*-
"""
collect-suspects.py — 検証が必要な疑義を docs/vocab-suspects.md に一元集約する

供給源:
  1. data/suspects-manual.json          … 手動登録 (Phase A の要判断など)
  2. data/enrich/core-*.json transIssues … B1 バッチが発見した訳・例文の疑義
  3. 機械検査 (kobunQ.v2.json)
     - legacy-only で例文が超短文 → 出典照合困難 (捏造疑い) クラス
     - 空欄テキストの括弧の破れ (半角 ] や 〕欠落)
     - 訳の無い例文

バッチを進めるたびに実行して常に最新化する (全再生成・冪等)。
usage: python scripts/collect-suspects.py
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V2 = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
MANUAL = os.path.join(ROOT, "data", "suspects-manual.json")
ENRICH_DIR = os.path.join(ROOT, "data", "enrich")
OUT = os.path.join(ROOT, "docs", "vocab-suspects.md")

SOURCE_RE = re.compile(r"（[^（）]{1,20}）\s*$")


def main():
    with open(V2, encoding="utf-8") as f:
        v2 = json.load(f)

    rows = []  # (area, target, issue, status)

    # 1) 手動登録
    if os.path.exists(MANUAL):
        with open(MANUAL, encoding="utf-8") as f:
            for m in json.load(f):
                rows.append((m["area"], m["target"], m["issue"], m.get("status", "open")))

    # 2) B1 バッチの transIssues
    for path in sorted(glob.glob(os.path.join(ENRICH_DIR, "core-*.json"))):
        with open(path, encoding="utf-8") as f:
            batch = json.load(f)
        bname = batch.get("batch") or os.path.basename(path)
        for word in batch["words"]:
            for iss in word.get("transIssues", []):
                rows.append(("B1検品", f"{iss['qid']} ({word['lemma']})",
                             iss["issue"] + f"（{bname}）", "open"))

    # 3) 機械検査
    short_legacy = []
    broken_blank = []
    no_translation = []
    for w in v2:
        for i, e in enumerate(w.get("examples", [])):
            jp = e.get("jp", "")
            body = SOURCE_RE.sub("", jp).strip()
            if w.get("origin") == "legacy-only" and 0 < len(body) <= 12:
                short_legacy.append((w["qid"], jp))
            for k in ("jpBlank", "translationBlank"):
                b = e.get(k, "")
                if b and ("]" in b or ("〔" in b and "〕" not in b)):
                    broken_blank.append((w["qid"], i, k))
            if jp and not (e.get("translation") or "").strip():
                no_translation.append((w["qid"], i, jp[:30]))

    if short_legacy:
        lemmas = sorted(set(q.split("-")[0] for q, _ in short_legacy))
        rows.append(("機械検査", f"legacy-only 超短文例文 {len(short_legacy)}例 (group: {', '.join(lemmas)})",
                     "後年追加語の例文が出典付き超短文で原典照合困難（捏造の可能性）。原典照合または例文差し替えを推奨。詳細は本書末尾の一覧",
                     "open"))
    if broken_blank:
        rows.append(("機械検査", f"空欄テキストの括弧破れ {len(broken_blank)}箇所",
                     "半角 ] や 〕欠落。Excel 原本由来の記号ミス。詳細は本書末尾の一覧", "open"))
    if no_translation:
        rows.append(("機械検査", f"訳の無い例文 {len(no_translation)}例",
                     "詳細は本書末尾の一覧", "open"))

    # --- 出力 ---
    lines = ["# 単語データ 疑義台帳（自動生成: collect-suspects.py）", ""]
    lines.append("手動項目の追加・status 変更は data/suspects-manual.json を編集して再実行。")
    lines.append("")
    n_open = sum(1 for r in rows if r[3] == "open")
    lines.append(f"**open: {n_open} / 全 {len(rows)} 件**")
    lines.append("")
    lines.append("| # | 区分 | 対象 | 内容 | status |")
    lines.append("|---|---|---|---|---|")
    for i, (area, target, issue, status) in enumerate(rows, 1):
        mark = "✅" if status != "open" else ""
        lines.append(f"| {i} | {area} | {target} | {issue} | {mark}{status} |")
    lines.append("")

    if short_legacy:
        lines.append("## 一覧: legacy-only 超短文例文（原典照合困難）")
        lines.append("")
        for q, jp in short_legacy:
            lines.append(f"- {q}: {jp}")
        lines.append("")
    if broken_blank:
        lines.append("## 一覧: 空欄テキストの括弧破れ")
        lines.append("")
        for q, i, k in broken_blank:
            lines.append(f"- {q} 例文{i} {k}")
        lines.append("")
    if no_translation:
        lines.append("## 一覧: 訳の無い例文")
        lines.append("")
        for q, i, jp in no_translation:
            lines.append(f"- {q} 例文{i}: {jp}…")
        lines.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"suspects: {n_open} open / {len(rows)} total -> {OUT}")
    print(f"  短文legacy: {len(short_legacy)} / 括弧破れ: {len(broken_blank)} / 訳なし: {len(no_translation)}")


if __name__ == "__main__":
    sys.exit(main())
