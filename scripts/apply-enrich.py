# -*- coding: utf-8 -*-
"""
apply-enrich.py — Phase B の core-*.json を kobunQ.v2.json に冪等マージする
(docs/vocab-enrich-batch-design.md)

  - lemma 単位: senseCore / trap / pos(未設定の場合のみ)
  - qid 単位:   senseNorm / decider
  - transIssues と検品用サマリを docs/enrich-review.md に全件再生成
  - data/enrich/state.json に適用済みバッチと lemma を記録

usage: python scripts/apply-enrich.py
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V2 = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
ENRICH_DIR = os.path.join(ROOT, "data", "enrich")
STATE = os.path.join(ENRICH_DIR, "state.json")
REVIEW = os.path.join(ROOT, "docs", "enrich-review.md")


def main():
    with open(V2, encoding="utf-8") as f:
        v2 = json.load(f)
    by_qid = {w["qid"]: w for w in v2}
    by_lemma = {}
    for w in v2:
        by_lemma.setdefault(w["lemma"], []).append(w)

    batches = sorted(glob.glob(os.path.join(ENRICH_DIR, "core-*.json")))
    done_lemmas = []
    issues = []       # (batch, qid, exIdx, issue)
    review_rows = []  # (batch, lemma ブロック文字列)
    errors = []

    for path in batches:
        with open(path, encoding="utf-8") as f:
            batch = json.load(f)
        bname = batch.get("batch") or os.path.basename(path)
        for word in batch["words"]:
            lemma = word["lemma"]
            entries = by_lemma.get(lemma)
            if not entries:
                errors.append(f"{bname}: lemma '{lemma}' が v2 に無い")
                continue
            for e in entries:
                e["senseCore"] = word["senseCore"]
                if word.get("trap"):
                    e["trap"] = word["trap"]
                if word.get("pos") and not e.get("pos"):
                    e["pos"] = word["pos"]
            covered = set()
            for s in word.get("senses", []):
                entry = by_qid.get(s["qid"])
                if not entry:
                    errors.append(f"{bname}: qid '{s['qid']}' が v2 に無い")
                    continue
                if entry["lemma"] != lemma:
                    errors.append(f"{bname}: qid '{s['qid']}' は lemma '{entry['lemma']}' ({lemma} でなく)")
                    continue
                entry["senseNorm"] = s["senseNorm"]
                if s.get("decider"):  # 単義語(B1-b)は decider 省略可
                    entry["decider"] = s["decider"]
                covered.add(s["qid"])
            missing = [e["qid"] for e in entries if e["qid"] not in covered]
            if missing and word.get("senses"):
                errors.append(f"{bname}: {lemma} の未カバー qid: {missing}")
            done_lemmas.append(lemma)
            for iss in word.get("transIssues", []):
                issues.append((bname, iss["qid"], iss.get("exIdx"), iss["issue"]))

            block = [f"### {lemma}", "", f"- 核イメージ: {word['senseCore']}"]
            if word.get("trap"):
                block.append(f"- ⚠ 古今異義: 現代語「{word['trap']['modern']}」— {word['trap']['note']}")
            block.append("")
            block.append("| qid | 意味(正規化) | 手がかり | 判別 |")
            block.append("|---|---|---|---|")
            for s in word.get("senses", []):
                d = s.get("decider") or {}
                block.append(f"| {s['qid']} | {s['senseNorm']} | {d.get('clue', '')} | {d.get('rule', '')} |")
            block.append("")
            review_rows.append((bname, "\n".join(block)))

    with open(V2, "w", encoding="utf-8") as f:
        json.dump(v2, f, ensure_ascii=False, indent=1)

    # レビュー MD は全件再生成 (バッチ再適用と整合)
    lines = ["# Phase B 検品シート（自動生成: apply-enrich.py）", ""]
    lines.append("疑義があれば該当バッチの data/enrich/core-*.json を直して再実行。")
    lines.append("")
    if issues:
        lines.append("## ⚠ 訳・例文の疑義（人間判断待ち）")
        lines.append("")
        lines.append("| batch | qid | 例文# | 指摘 |")
        lines.append("|---|---|---|---|")
        for b, q, i, msg in issues:
            lines.append(f"| {b} | {q} | {i} | {msg} |")
        lines.append("")
    cur = None
    for bname, block in review_rows:
        if bname != cur:
            lines.append(f"## {bname}")
            lines.append("")
            cur = bname
        lines.append(block)
    with open(REVIEW, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    state = {
        "phase": "B1",
        "appliedBatches": [os.path.basename(p) for p in batches],
        "doneLemmas": sorted(set(done_lemmas)),
        "doneCount": len(set(done_lemmas)),
    }
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)

    enriched = sum(1 for w in v2 if w.get("senseCore"))
    print(f"applied {len(batches)} batch(es): {len(set(done_lemmas))} lemmas")
    print(f"v2 entries with senseCore: {enriched} / {len(v2)}")
    print(f"transIssues: {len(issues)} -> {REVIEW}")
    if errors:
        print("ERRORS:")
        for e in errors:
            print("  -", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
