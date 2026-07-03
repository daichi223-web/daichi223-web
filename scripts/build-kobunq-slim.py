# -*- coding: utf-8 -*-
"""
build-kobunq-slim.py — kobunQ.v2.json からバンドル用の軽量版を生成する。

クイズ画面で使うフィールドだけを残す:
  qid, lemma, sense, meaning_idx, group, pos, keigo,
  senseNorm, senseCore, decider, trap,
  examples[{jp, translation, source}]
落とすもの: jpBlank / translationBlank / origin / senseLabel（空欄形式の実装時に
public/ 配下の遅延読込ファイルとして別途出す）。

usage: python scripts/build-kobunq-slim.py
"""
import json
import os
import sys

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
        s["examples"] = [
            {k: e[k] for k in ("jp", "translation", "source") if e.get(k)}
            for e in w.get("examples", [])
        ]
        slim.append(s)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(slim)} entries -> {OUT} ({os.path.getsize(OUT)//1024} KB, full={os.path.getsize(SRC)//1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
