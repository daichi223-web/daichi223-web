# -*- coding: utf-8 -*-
"""
build-blanks.py — 空欄補充クイズ用データを public/kobun-blanks.json に生成する。

Excel 原本の手作業空欄 (jpBlank) を qid 単位でまとめる（遅延読込用。バンドル外）。
形式: { qid: [ { jp, jpBlank, translation } ] }

usage: python scripts/build-blanks.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
OUT = os.path.join(ROOT, "public", "kobun-blanks.json")


def main():
    with open(SRC, encoding="utf-8") as f:
        v2 = json.load(f)
    out = {}
    n = 0
    for w in v2:
        rows = []
        for e in w.get("examples", []):
            if e.get("jpBlank") and "〔" in e["jpBlank"]:
                rows.append({
                    "jp": e["jp"],
                    "jpBlank": e["jpBlank"],
                    "translation": e.get("translation") or "",
                })
                n += 1
        if rows:
            out[w["qid"]] = rows
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} qids / {n} blanks -> {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
