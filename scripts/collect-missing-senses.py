# -*- coding: utf-8 -*-
"""
collect-missing-senses.py — B2 の unknown 判定（kobunQ に立っていない意味の用例）を
lemma 別に集約し、意味追加の検討材料を出力する。

出力: docs/missing-senses-report.md
usage: python scripts/collect-missing-senses.py
"""
import glob
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENRICH_DIR = os.path.join(ROOT, "data", "enrich")
BANK_DIR = os.path.join(ROOT, "public", "example-bank")
OUT = os.path.join(ROOT, "docs", "missing-senses-report.md")


def main():
    unknowns = defaultdict(list)  # lemma -> [key]
    n_bound = n_reject = 0
    for path in sorted(glob.glob(os.path.join(ENRICH_DIR, "bind-*.jsonl"))):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r["verdict"] == "unknown":
                    unknowns[r["lemma"]].append(r["key"])
                elif r["verdict"] == "reject":
                    n_reject += 1
                else:
                    n_bound += 1

    # バンクから該当例文の実テキストを引く
    import re
    def norm_text(s):
        s = re.sub(r"（[^（）]{1,20}）\s*$", "", str(s or "").strip())
        return re.sub(r"[\s　〔〕\[\]（）()。、「」・…【】]+", "", s)

    lines = ["# 意味未収載（unknown）用例レポート — B2 集約", ""]
    total = sum(len(v) for v in unknowns.items().__iter__().__next__()[1] for _ in [0]) if unknowns else 0
    total = sum(len(v) for v in unknowns.values())
    lines.append(f"- B2 判定総数: bound {n_bound} / reject {n_reject} / **unknown {total}**")
    lines.append("- unknown ＝ その語の正当な用例だが kobunQ に意味が立っていないもの。")
    lines.append("  バンクでは「その他の用例」として表示される。意味追加（qid新設）の検討材料。")
    lines.append("")
    for lemma in sorted(unknowns, key=lambda l: -len(unknowns[l])):
        keys = set(unknowns[lemma])
        lines.append(f"## {lemma}（{len(keys)}件）")
        lines.append("")
        fname = re.sub(r'[\\/:*?"<>|]', "_", lemma) + ".json"
        bpath = os.path.join(BANK_DIR, fname)
        shown = 0
        if os.path.exists(bpath):
            with open(bpath, encoding="utf-8") as f:
                bank = json.load(f)
            for ex in bank["examples"]:
                if norm_text(ex["jp"]) in keys and "senseId" not in ex:
                    lines.append(f"- {ex['jp'][:70]}")
                    shown += 1
                    if shown >= 8:
                        lines.append(f"- …ほか {len(keys) - shown} 件")
                        break
        lines.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"unknown lemmas: {len(unknowns)}, examples: {total}")
    print(f"bound: {n_bound} / reject: {n_reject}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
