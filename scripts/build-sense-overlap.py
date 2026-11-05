# -*- coding: utf-8 -*-
"""選択肢に一緒に出さない意味の組の表を、正本 data/sense-overlap.json から src/lib/senseOverlap.ts に書き出す。

正本の形: {"note": "...", "pairs": [{"a": "87-1", "b": "87-2", "lemma": "あさまし", "reason": "..."}, ...]}
  a・b は同じ見出し語の qid（kobunQ.v2）。判定の経緯は F:\\A2A\\_work\\sense-overlap\\。
使い方: python -X utf8 scripts/build-sense-overlap.py [--check]
  --check … 書き出さずに、正本と senseOverlap.ts が一致しているかだけ確かめる（不一致なら終了コード1）
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sense-overlap.json"
OUT = ROOT / "src" / "lib" / "senseOverlap.ts"
WORDS = ROOT / "src" / "data" / "kobunQ.v2.json"


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    qid_lemma = {w["qid"]: w["lemma"] for w in json.loads(WORDS.read_text(encoding="utf-8"))}
    seen, lines = set(), []
    for p in sorted(data["pairs"], key=lambda p: (p["a"], p["b"])):
        a, b = sorted([p["a"], p["b"]])
        if a not in qid_lemma or b not in qid_lemma:
            sys.exit(f"qid が kobunQ.v2 に無い: {a} {b}")
        if qid_lemma[a] != qid_lemma[b]:
            sys.exit(f"同じ見出し語の組ではない: {a}({qid_lemma[a]}) {b}({qid_lemma[b]})")
        if (a, b) in seen:
            continue
        seen.add((a, b))
        lines.append(f"  ['{a}', '{b}'], // {qid_lemma[a]}")
    ts = OUT.read_text(encoding="utf-8")
    new = re.sub(r"(= \[\n)(.*?)(\n\];)", lambda m: m.group(1) + "  // @@PAIRS@@\n" + "\n".join(lines) + m.group(3),
                 ts, count=1, flags=re.S)
    if "--check" in sys.argv:
        if new != ts:
            sys.exit("senseOverlap.ts が正本と一致しない。build-sense-overlap.py を実行する")
        print("ok", len(lines)); return
    OUT.write_text(new, encoding="utf-8")
    print("pairs", len(lines))


if __name__ == "__main__":
    main()
