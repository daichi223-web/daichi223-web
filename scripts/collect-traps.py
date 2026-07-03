# -*- coding: utf-8 -*-
"""
collect-traps.py — B1 で判定した trap（古今異義語）を集約し、
modern_traps.json（形式: {lemma: [罠誤答文字列]}）の拡充案を出力する。
適用は人間検品後に data/modern_traps.json へ手動で差し替え。

注意: 罠誤答はその語の正しい古語の意味と重なってはならない（原本の _comment 参照）。
      B1 由来の罠は senseNorm 群と突き合わせて重なりを機械チェックする。

出力:
  data/enrich/modern_traps.v2.json  … 拡充案（同形式）
  docs/traps-report.md              … 新旧対照＋重なり警告

usage: python scripts/collect-traps.py
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CURRENT = os.path.join(ROOT, "data", "modern_traps.json")
V2 = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
ENRICH_DIR = os.path.join(ROOT, "data", "enrich")
OUT_JSON = os.path.join(ENRICH_DIR, "modern_traps.v2.json")
OUT_MD = os.path.join(ROOT, "docs", "traps-report.md")


def norm(s):
    return re.sub(r"[\s　・（）()〜～]", "", str(s or ""))


def main():
    with open(CURRENT, encoding="utf-8") as f:
        current = json.load(f)
    comment = current.pop("_comment", "")

    with open(V2, encoding="utf-8") as f:
        v2 = json.load(f)
    senses_by_lemma = {}
    for w in v2:
        senses_by_lemma.setdefault(w["lemma"], []).append(
            norm(w.get("senseNorm") or w.get("sense")))

    new_traps = {}   # lemma -> (modern, note)
    for path in sorted(glob.glob(os.path.join(ENRICH_DIR, "core-*.json"))):
        with open(path, encoding="utf-8") as f:
            batch = json.load(f)
        for w in batch["words"]:
            if w.get("trap"):
                new_traps[w["lemma"]] = (w["trap"]["modern"], w["trap"]["note"])

    merged = {k: list(v) for k, v in current.items()}
    added, overlap_warn = [], []
    for lemma, (modern, note) in new_traps.items():
        # 罠が正しい意味と重ならないか簡易チェック
        nm = norm(modern)
        senses = senses_by_lemma.get(lemma, [])
        if any(nm and (nm in s or s in nm) for s in senses if s):
            overlap_warn.append((lemma, modern))
            continue
        if lemma in merged:
            if not any(norm(x) == nm for x in merged[lemma]):
                merged[lemma].append(modern)
        else:
            merged[lemma] = [modern]
            added.append(lemma)

    out = {"_comment": comment or "古今異義語の『現代語の罠』誤答。getChoices が選択肢に1つ混入する。"}
    out.update({k: merged[k] for k in sorted(merged)})
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    lines = ["# 古今異義語 trap 拡充レポート（collect-traps.py）", ""]
    lines.append(f"- 現行 modern_traps.json: {len(current)} 語")
    lines.append(f"- B1 判定の trap: {len(new_traps)} 語")
    lines.append(f"- 統合後: **{len(merged)} 語**（新規 {len(added)} 語）")
    if overlap_warn:
        lines.append("")
        lines.append("## ⚠ 罠が正しい意味と重なる疑い（自動除外・要判断）")
        lines.append("")
        for lemma, modern in overlap_warn:
            lines.append(f"- {lemma}: 罠「{modern}」が senseNorm と重複の疑い")
    lines.append("")
    lines.append("## 拡充案一覧（新規のみ note 付き）")
    lines.append("")
    lines.append("| lemma | 罠誤答 | 注意（B1のnote） |")
    lines.append("|---|---|---|")
    for lemma in sorted(merged):
        note = new_traps.get(lemma, ("", ""))[1] if lemma in added else ""
        lines.append(f"| {lemma} | {'／'.join(merged[lemma])} | {note} |")
    lines.append("")
    lines.append("検品後、data/modern_traps.json へ手動で差し替え（getChoices が参照）。")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"traps: current={len(current)} + new={len(new_traps)} -> merged={len(merged)} (added {len(added)})")
    print(f"  overlap warnings: {len(overlap_warn)}")
    print(f"-> {OUT_JSON}\n-> {OUT_MD}")


if __name__ == "__main__":
    sys.exit(main())
