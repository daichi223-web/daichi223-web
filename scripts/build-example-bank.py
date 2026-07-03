# -*- coding: utf-8 -*-
"""
build-example-bank.py — 単語学習 全面刷新 Phase A の ETL その2
(docs/vocab-overhaul-design.md「用例バンク」)

5系統に分散した用例を lemma 単位に集約し、public/example-bank/ に出力する。
「深く学びたい生徒が1語の用例を大量に見られる」ためのデータ層。

  供給源(優先順): kobunQ v2 > corpus-examples > examples-by-lemma > texts-v3 本文
  texts-v3 由来は該当箇所±45字の抜粋＋本文リンク情報(textId/sentenceId/tokenId)を持つ

出力:
  public/example-bank/index.json   … lemma → {file, count, senses}
  public/example-bank/<lemma>.json … 用例本体 (lemma 単位で fetch。egress 対策)
  docs/example-bank-report.md      … 集約統計・sense 未紐付け数 (Phase B の作業量)

usage: python scripts/build-example-bank.py
"""
import glob
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V2 = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
CORPUS = os.path.join(ROOT, "public", "corpus-examples.json")
BYLEMMA = os.path.join(ROOT, "public", "examples-by-lemma.json")
TEXTS_DIR = os.path.join(ROOT, "public", "texts-v3")
OUT_DIR = os.path.join(ROOT, "public", "example-bank")
OUT_REPORT = os.path.join(ROOT, "docs", "example-bank-report.md")

SNIPPET_MARGIN = 45  # 本文抜粋の前後余白(字)


SOURCE_TAIL_RE = re.compile(r"（[^（）]{1,20}）\s*$")


def norm_text(s):
    """重複判定用: 末尾の出典括弧・強調マーカー・記号を除いて比較"""
    if s is None:
        return ""
    s = SOURCE_TAIL_RE.sub("", str(s).strip())
    return re.sub(r"[\s　〔〕\[\]（）()。、「」・…【】]+", "", s)


def norm_sense(s):
    if s is None:
        return ""
    s = str(s).replace("〔", "").replace("〕", "")
    return re.sub(r"[\s　]+", "", s)


def sanitize_filename(lemma):
    return re.sub(r'[\\/:*?"<>|]', "_", lemma)


def bind_sense(label, senses):
    """意味ラベル文字列を qid に紐付け(包含一致)。曖昧なら None (B2 で AI が判定)。
    senses = [(qid, [正規化ラベル候補...])] — sense と senseNorm(B1付与) の両方と照合する。"""
    nl = norm_sense(label)
    if not nl:
        return None
    hits = [q for q, variants in senses
            if any(v and (nl in v or v in nl) for v in variants)]
    return hits[0] if len(set(hits)) == 1 else None


def main():
    with open(V2, encoding="utf-8") as f:
        v2 = json.load(f)

    # lemma → [(qid, [正規化ラベル候補])], qid → lemma
    senses_by_lemma = {}
    lemma_by_qid = {}
    sense_by_qid = {}
    for w in v2:
        variants = [norm_sense(w["sense"])]
        if w.get("senseNorm"):
            variants.append(norm_sense(w["senseNorm"]))
        senses_by_lemma.setdefault(w["lemma"], []).append((w["qid"], variants))
        lemma_by_qid[w["qid"]] = w["lemma"]
        sense_by_qid[w["qid"]] = w.get("senseNorm") or w["sense"]

    # B2 の手動紐付け (data/enrich/bind-*.jsonl): (lemma, key) → verdict
    bindings = {}
    for bpath in sorted(glob.glob(os.path.join(ROOT, "data", "enrich", "bind-*.jsonl"))):
        with open(bpath, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                bindings[(r["lemma"], r["key"])] = r["verdict"]

    bank = {}   # lemma → {norm_jp → example}
    stats = Counter()

    def add(lemma, ex):
        key = norm_text(ex["jp"])
        if not key:
            return
        slot = bank.setdefault(lemma, {})
        if key in slot:
            old = slot[key]
            # 重複でも新情報は既存用例に合流させる (本文リンク / sense / 出典 / 訳)
            for k in ("textId", "sentenceId", "tokenId", "senseId", "source", "translation"):
                if ex.get(k) and not old.get(k):
                    old[k] = ex[k]
            stats[f"dup-{ex['origin']}"] += 1
            return
        slot[key] = ex
        stats[ex["origin"]] += 1

    # 1) kobunQ v2 (基本例文＋Excel 第2例文。sense 紐付け確実)
    for w in v2:
        for e in w.get("examples", []):
            add(w["lemma"], {
                "jp": e["jp"],
                "translation": e.get("translation") or None,
                "source": e.get("source"),
                "origin": "kobunq",
                "senseId": w["qid"],
            })

    # 2) corpus-examples.json (教材実文＋訳。qid 紐付け済)
    with open(CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)
    for qid, exs in corpus.items():
        lemma = lemma_by_qid.get(qid)
        if not lemma:
            stats["corpus-unknown-qid"] += 1
            continue
        for e in exs:
            add(lemma, {
                "jp": e["jp"],
                "translation": e.get("translation") or None,
                "source": None,
                "origin": "corpus",
                "senseId": qid,
            })

    # 3) examples-by-lemma.json (用例辞書。meaning ラベルから sense 紐付けを試みる)
    with open(BYLEMMA, encoding="utf-8") as f:
        bylemma = json.load(f)
    for lemma, exs in bylemma.items():
        if lemma not in senses_by_lemma:
            stats["dict-unknown-lemma"] += 1
            continue
        for e in exs:
            jp = e.get("sentence")
            if not jp:
                continue
            add(lemma, {
                "jp": jp,
                "translation": e.get("context") or None,
                "source": e.get("source_work") or None,
                "origin": "dict",
                "senseId": bind_sense(e.get("meaning"), senses_by_lemma[lemma]),
                "senseLabel": e.get("meaning") or None,
            })

    # 4) texts-v3 本文 (意味ラベル＋本文リンク。1ファイルずつ逐次=省メモリ)
    text_files = sorted(glob.glob(os.path.join(TEXTS_DIR, "*.json")))
    parse_errors = []
    for path in text_files:
        if os.path.basename(path) == "index.json":  # 一覧ファイル (本文ではない)
            continue
        try:
            with open(path, encoding="utf-8") as f:
                doc = json.load(f)
        except Exception as ex:
            parse_errors.append(f"{os.path.basename(path)}: {ex}")
            stats["text-file-error"] += 1
            continue
        if not isinstance(doc, dict):
            stats["text-file-skipped"] += 1
            continue
        text_id = doc.get("id") or os.path.splitext(os.path.basename(path))[0]
        title = doc.get("title") or ""
        for sent in doc.get("sentences", []):
            original = sent.get("originalText") or ""
            for tok in sent.get("tokens", []):
                tag = tok.get("grammarTag") or {}
                base = tag.get("baseForm") or tok.get("baseForm")
                if base not in senses_by_lemma:
                    continue
                start = tok.get("start")
                end = tok.get("end")
                if start is None or end is None:
                    continue
                s = max(0, start - SNIPPET_MARGIN)
                t = min(len(original), end + SNIPPET_MARGIN)
                snippet = ("…" if s > 0 else "") + \
                    original[s:start] + "【" + original[start:end] + "】" + original[end:t] + \
                    ("…" if t < len(original) else "")
                meaning = tag.get("meaning")
                add(base, {
                    "jp": snippet,
                    "translation": None,  # 全文訳は TextReader 側で見る
                    "source": title or None,
                    "origin": "text",
                    "senseId": bind_sense(meaning, senses_by_lemma[base]),
                    "senseLabel": meaning or None,
                    "textId": text_id,
                    "sentenceId": sent.get("id"),
                    "tokenId": tok.get("id"),
                })

    # --- 出力 ---
    os.makedirs(OUT_DIR, exist_ok=True)
    # 旧ファイル掃除
    for old in glob.glob(os.path.join(OUT_DIR, "*.json")):
        os.remove(old)

    origin_rank = {"kobunq": 0, "corpus": 1, "dict": 2, "text": 3}
    index = {}
    unbound_total = 0
    for lemma, slot in bank.items():
        # B2 手動紐付けの適用 (qid=紐付け / reject=別語混入の除去 / unknown=そのまま)
        for key in list(slot.keys()):
            verdict = bindings.get((lemma, key))
            if verdict is None:
                continue
            if verdict == "reject":
                del slot[key]
                stats["b2-reject"] += 1
            elif verdict != "unknown":
                slot[key]["senseId"] = verdict
                stats["b2-bound"] += 1
        examples = sorted(
            slot.values(),
            key=lambda e: (origin_rank.get(e["origin"], 9), e.get("senseId") or "zz"),
        )
        for e in examples:  # None キーを落として軽量化
            for k in list(e.keys()):
                if e[k] is None:
                    del e[k]
        unbound = sum(1 for e in examples if "senseId" not in e)
        unbound_total += unbound
        fname = sanitize_filename(lemma) + ".json"
        payload = {
            "lemma": lemma,
            "senses": [{"qid": q, "sense": sense_by_qid[q]}
                       for q, _ in senses_by_lemma.get(lemma, [])],
            "examples": examples,
        }
        with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        index[lemma] = {"file": fname, "count": len(examples), "unbound": unbound}

    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    # --- レポート ---
    counts = [v["count"] for v in index.values()]
    top = sorted(index.items(), key=lambda kv: -kv[1]["count"])[:20]
    total = sum(counts)
    lines = []
    lines.append("# 用例バンク 集約レポート")
    lines.append("")
    lines.append("- 生成: scripts/build-example-bank.py → public/example-bank/")
    lines.append(f"- 対象 lemma: {len(index)} / 用例総数: **{total}**")
    lines.append(f"- 供給源別: kobunq={stats['kobunq']} corpus={stats['corpus']}"
                 f" dict={stats['dict']} text={stats['text']}")
    lines.append(f"- 重複除去: " + ", ".join(f"{k}={v}" for k, v in stats.items() if k.startswith("dup-")))
    lines.append(f"- sense 未紐付け（Phase B で AI 判定→検品）: **{unbound_total}**")
    if parse_errors:
        lines.append(f"- ⚠ texts-v3 パース失敗: {'; '.join(parse_errors)}")
    lines.append("")
    lines.append("## 用例数 上位20語")
    lines.append("")
    lines.append("| lemma | 用例数 | 未紐付け |")
    lines.append("|---|---|---|")
    for lemma, v in top:
        lines.append(f"| {lemma} | {v['count']} | {v['unbound']} |")
    lines.append("")
    dist = Counter()
    for c in counts:
        dist["1"] += c == 1
        dist["2-4"] += 2 <= c <= 4
        dist["5-9"] += 5 <= c <= 9
        dist["10+"] += c >= 10
    lines.append("## 1語あたり用例数の分布")
    lines.append("")
    lines.append("| 用例数 | 語数 |")
    lines.append("|---|---|")
    for k in ("1", "2-4", "5-9", "10+"):
        lines.append(f"| {k} | {dist[k]} |")
    lines.append("")
    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"example-bank: {len(index)} lemmas, {total} examples -> {OUT_DIR}")
    print(f"  by origin: kobunq={stats['kobunq']} corpus={stats['corpus']}"
          f" dict={stats['dict']} text={stats['text']}")
    print(f"  sense unbound: {unbound_total} (Phase B2)")
    print(f"  b2: bound={stats['b2-bound']} reject={stats['b2-reject']}")
    print(f"report -> {OUT_REPORT}")


if __name__ == "__main__":
    sys.exit(main())
