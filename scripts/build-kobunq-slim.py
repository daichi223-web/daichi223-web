# -*- coding: utf-8 -*-
"""
build-kobunq-slim.py — kobunQ.v2.json からバンドル用の軽量版を生成する。

クイズ画面で使うフィールドだけを残す:
  qid, lemma, sense, meaning_idx, group, pos, keigo,
  senseNorm, senseCore, decider, trap,
  examples[{jp, translation, source, mark}]
    mark = 例文の中で問われている語の位置 [[開始, 長さ], ...]。jp と jpBlank の差分から
    復元する（scripts/target_marks.py）。jpBlank が無い例文には付かない。
    検査は python -X utf8 scripts/check-target-marks.py
落とすもの: jpBlank / translationBlank / origin / senseLabel（空欄形式の実装時に
public/ 配下の遅延読込ファイルとして別途出す）。

usage: python scripts/build-kobunq-slim.py
"""
import json
import os
import sys

sys.dont_write_bytecode = True  # scripts/__pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from target_marks import spans_from_blank  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
OUT = os.path.join(ROOT, "src", "data", "kobunQ.v2.slim.json")

KEEP_TOP = ("qid", "lemma", "sense", "meaning_idx", "group",
            "pos", "keigo", "senseNorm", "senseCore", "decider", "trap")


def main():
    with open(SRC, encoding="utf-8") as f:
        v2 = json.load(f)
    slim = []
    for w in v2:
        s = {k: w[k] for k in KEEP_TOP if w.get(k) not in (None, "", False)}
        # keigo=False は落とす(上の条件で除外済)。group/meaning_idx は必須なので必ず入れる
        for req in ("qid", "lemma", "sense", "meaning_idx", "group"):
            s[req] = w[req]
        s["examples"] = []
        for e in w.get("examples", []):
            ex = {k: e[k] for k in ("jp", "translation", "source") if e.get(k)}
            # 対象語の位置。jpBlank があり、差分から復元できたときだけ付ける
            mark = spans_from_blank(e.get("jp"), e.get("jpBlank"))
            if mark:
                ex["mark"] = mark
            s["examples"].append(ex)
        slim.append(s)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(slim)} entries -> {OUT} ({os.path.getsize(OUT)//1024} KB, full={os.path.getsize(SRC)//1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
