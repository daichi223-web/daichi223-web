# -*- coding: utf-8 -*-
"""
build-kobunq-v2.py — 単語学習 全面刷新 Phase A の ETL その1
(docs/vocab-overhaul-design.md)

正本 Excel「古文単語テストリスト (回復済み).xlsx」の リスト(n) シートから
現行 src/data/kobunQ.json に眠っている資産を取り込み、kobunQ.v2.json を生成する。

  取り込むもの: 品詞 / 敬語フラグ / 第2例文セット(古文・訳) / 空欄化済みテキスト
  鉄則: 既存 qid は絶対に変えない (srs_state / word_stats が紐づくため)

出力:
  src/data/kobunQ.v2.json      … v2 データ (既存フィールドは全て保持、追加のみ)
  docs/kobunq-v2-report.md     … 突合レポート (未一致・追加候補・要人間判断)

usage: python scripts/build-kobunq-v2.py
"""
import json
import os
import re
import sys
from collections import Counter

from python_calamine import CalamineWorkbook

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = r"F:\古文単語テストリスト (回復済み).xlsx"
KOBUNQ = os.path.join(ROOT, "src", "data", "kobunQ.json")
OUT_JSON = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
OUT_REPORT = os.path.join(ROOT, "docs", "kobunq-v2-report.md")

SOURCE_RE = re.compile(r"（([^（）]{1,20})）\s*$")


def norm_sense(s):
    """意味ラベルの突合用正規化: 〔〕・空白を除去"""
    if s is None:
        return ""
    s = str(s).replace("〔", "").replace("〕", "")
    return re.sub(r"[\s　]+", "", s)


def norm_text(s):
    """例文の重複判定用正規化"""
    if s is None:
        return ""
    return re.sub(r"[\s　〔〕\[\]（）()。、「」]+", "", str(s))


def clean(s):
    """セル値の前後空白(全角含む)除去。中身の空白は保持"""
    if s is None:
        return ""
    return str(s).strip().strip("　").strip()


def extract_source(jp):
    m = SOURCE_RE.search(jp)
    return m.group(1) if m else None


def load_excel_rows():
    wb = CalamineWorkbook.from_path(XLSX)
    rows = wb.get_sheet_by_name("リスト(n)").to_python()
    out = []
    for r in rows[1:]:  # skip header
        r = list(r) + [""] * (15 - len(r))
        (_row, bango, tango, hinshi, keigo,
         imi1, rei1, rei1_blank, yaku1, yaku1_blank,
         imi2, ko2, ko2_blank, yaku2, yaku2_blank) = r[:15]
        tango = clean(tango)
        if not tango:
            continue
        out.append({
            "bango": int(float(bango)) if str(bango).strip() else None,
            "tango": tango,
            "hinshi": clean(hinshi),
            "keigo": clean(keigo) == "敬語",
            "imi1": clean(imi1),
            "rei1": clean(rei1),
            "rei1_blank": clean(rei1_blank),
            "yaku1": clean(yaku1),
            "yaku1_blank": clean(yaku1_blank),
            "imi2": clean(imi2),
            "ko2": clean(ko2),
            "ko2_blank": clean(ko2_blank),
            "yaku2": clean(yaku2),
            "yaku2_blank": clean(yaku2_blank),
            "used": False,
        })
    return out


def main():
    excel = load_excel_rows()
    with open(KOBUNQ, encoding="utf-8") as f:
        kobunq = json.load(f)

    # --- 索引 ---
    by_key = {}       # (単語, norm意味) -> [row]
    by_word = {}      # 単語 -> [row]
    for row in excel:
        by_key.setdefault((row["tango"], norm_sense(row["imi1"])), []).append(row)
        by_word.setdefault(row["tango"], []).append(row)

    def find_row(w):
        """kobunQ エントリに対応する Excel 行を探す。一致方法を返す"""
        key = (w["lemma"], norm_sense(w["sense"]))
        for row in by_key.get(key, []):
            if not row["used"]:
                return row, "exact"
        # 二次: 同一単語内で意味ラベルの包含 (「この上ない」⊂「この上ない、格別だ」等)
        ns = norm_sense(w["sense"])
        for row in by_word.get(w["lemma"], []):
            if row["used"]:
                continue
            ni = norm_sense(row["imi1"])
            if ns and ni and (ns in ni or ni in ns):
                return row, "fuzzy-sense"
        # 三次: 同一単語内で既存例文と Excel 例文1 が一致
        ex0 = w.get("examples") or []
        if ex0:
            nj = norm_text(ex0[0].get("jp", ""))
            for row in by_word.get(w["lemma"], []):
                if not row["used"] and nj and norm_text(row["rei1"]) == nj:
                    return row, "example-match"
        return None, None

    v2 = []
    match_stats = Counter()
    fuzzy_log = []       # (qid, kobunQ sense, Excel 意味)
    unmatched = []       # Excel に無い kobunQ エントリ
    group_mismatch = []  # group と Excel 番号のズレ

    for w in kobunq:
        entry = dict(w)  # 既存フィールドは全て保持
        row, how = find_row(w)
        if row:
            row["used"] = True
            match_stats[how] += 1
            if how != "exact":
                fuzzy_log.append((w["qid"], w["sense"], row["imi1"]))
            if row["bango"] is not None and row["bango"] != w["group"]:
                group_mismatch.append((w["qid"], w["group"], row["bango"]))

            entry["pos"] = row["hinshi"]
            entry["keigo"] = row["keigo"]
            entry["origin"] = "excel"

            # 既存 examples を空欄情報で増強し、第2例文セットを追加
            examples = []
            seen = set()
            for ex in (w.get("examples") or []):
                e = dict(ex)
                if norm_text(e.get("jp")) == norm_text(row["rei1"]):
                    if row["rei1_blank"]:
                        e["jpBlank"] = row["rei1_blank"]
                    if row["yaku1_blank"]:
                        e["translationBlank"] = row["yaku1_blank"]
                src = extract_source(e.get("jp", ""))
                if src:
                    e["source"] = src
                e["origin"] = "kobunq"
                examples.append(e)
                seen.add(norm_text(e.get("jp")))
            # 第2セット (古文/訳): 未収載なら追加
            if row["ko2"] and norm_text(row["ko2"]) not in seen:
                e2 = {
                    "jp": row["ko2"],
                    "translation": row["yaku2"],
                    "origin": "excel2",
                }
                if row["ko2_blank"]:
                    e2["jpBlank"] = row["ko2_blank"]
                if row["yaku2_blank"]:
                    e2["translationBlank"] = row["yaku2_blank"]
                src = extract_source(row["ko2"])
                if src:
                    e2["source"] = src
                # 第2セットの意味ラベルが第1と違う表記の場合は保持 (はっと気づい 等)
                if row["imi2"] and norm_sense(row["imi2"]) != norm_sense(row["imi1"]):
                    e2["senseLabel"] = row["imi2"]
                examples.append(e2)
                seen.add(norm_text(row["ko2"]))
            entry["examples"] = examples
        else:
            match_stats["unmatched"] += 1
            entry["origin"] = "legacy-only"  # group 331+ の後年追加語など
            unmatched.append(w)
            exs = []
            for ex in (w.get("examples") or []):
                e = dict(ex)
                src = extract_source(e.get("jp", ""))
                if src:
                    e["source"] = src
                e["origin"] = "kobunq"
                exs.append(e)
            entry["examples"] = exs
        v2.append(entry)

    # --- 第2パス: 未使用行の例文回収 ---
    # Excel には同一 (単語, 意味) の行が複数あり、2行目以降が別例文を持つ
    # (=1つの意味に3例文以上ある)。意味ラベルが一致する v2 エントリに追加合流する。
    # 意味ラベルが空欄の行 (くもゐ 265 / かぎり 268 / かたみ 270) は
    # どの sense か機械判断できないためレポート送り (人間判断)。
    v2_by_key = {}
    seen_by_lemma = {}
    for entry in v2:
        v2_by_key.setdefault((entry["lemma"], norm_sense(entry["sense"])), []).append(entry)
        seen_by_lemma.setdefault(entry["lemma"], set()).update(
            norm_text(e["jp"]) for e in entry.get("examples", []))
    salvaged = 0
    for row in excel:
        if row["used"] or not norm_sense(row["imi1"]):
            continue
        cands = v2_by_key.get((row["tango"], norm_sense(row["imi1"])))
        if not cands:
            continue
        entry = cands[0]
        seen = seen_by_lemma[entry["lemma"]]
        for jp, yaku, jpb, yakb in (
            (row["rei1"], row["yaku1"], row["rei1_blank"], row["yaku1_blank"]),
            (row["ko2"], row["yaku2"], row["ko2_blank"], row["yaku2_blank"]),
        ):
            if not jp or norm_text(jp) in seen:
                continue
            e = {"jp": jp, "translation": yaku, "origin": "excel2"}
            if jpb:
                e["jpBlank"] = jpb
            if yakb:
                e["translationBlank"] = yakb
            src = extract_source(jp)
            if src:
                e["source"] = src
            if row["imi2"] and norm_sense(row["imi2"]) != norm_sense(row["imi1"]):
                e["senseLabel"] = row["imi2"]
            entry["examples"].append(e)
            seen.add(norm_text(jp))
            salvaged += 1
        row["used"] = True
        match_stats["salvage-row"] += 1

    excel_unused = [r for r in excel if not r["used"]]

    # --- 出力 ---
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(v2, f, ensure_ascii=False, indent=1)

    n_two = sum(1 for e in v2 if len(e.get("examples", [])) >= 2)
    n_blank = sum(1 for e in v2 for ex in e["examples"] if "jpBlank" in ex)
    n_pos = sum(1 for e in v2 if e.get("pos"))
    n_keigo = sum(1 for e in v2 if e.get("keigo"))

    lines = []
    lines.append("# kobunQ v2 突合レポート")
    lines.append("")
    lines.append(f"- 生成: scripts/build-kobunq-v2.py / 正本: {XLSX}")
    lines.append(f"- kobunQ 既存: {len(kobunq)} qid / Excel リスト(n): {len(excel)} 行")
    lines.append("")
    lines.append("## 突合結果")
    lines.append("")
    lines.append(f"| 一致方法 | 件数 |")
    lines.append(f"|---|---|")
    for k in ("exact", "fuzzy-sense", "example-match", "unmatched"):
        lines.append(f"| {k} | {match_stats.get(k, 0)} |")
    lines.append("")
    lines.append(f"- 第2パス回収: 重複行 {match_stats.get('salvage-row', 0)} 行から追加例文 {salvaged} 件")
    lines.append(f"- 例文2つ以上: **{n_two} / {len(v2)}**（旧: 17）")
    lines.append(f"- 空欄付き例文: {n_blank}")
    lines.append(f"- 品詞付与: {n_pos} / 敬語フラグ: {n_keigo}")
    lines.append("")
    if fuzzy_log:
        lines.append("## 曖昧一致（要目視確認）")
        lines.append("")
        lines.append("| qid | kobunQ の意味 | Excel の意味 |")
        lines.append("|---|---|---|")
        for qid, s1, s2 in fuzzy_log:
            lines.append(f"| {qid} | {s1} | {s2} |")
        lines.append("")
    if group_mismatch:
        lines.append("## group ≠ Excel 番号（qid は変えない。参考情報）")
        lines.append("")
        for qid, g, b in group_mismatch:
            lines.append(f"- {qid}: group={g} / Excel番号={b}")
        lines.append("")
    lines.append("## Excel に無い kobunQ エントリ（legacy-only・後年追加語）")
    lines.append("")
    legacy_lemmas = sorted(set(w["lemma"] for w in unmatched))
    lines.append(f"{len(unmatched)} qid / {len(legacy_lemmas)} lemma: " + "、".join(legacy_lemmas))
    lines.append("")
    lines.append("## kobunQ に無い Excel 行（追加候補・要人間判断）")
    lines.append("")
    if excel_unused:
        lines.append("| 番号 | 単語 | 意味 |")
        lines.append("|---|---|---|")
        for r in excel_unused:
            lines.append(f"| {r['bango']} | {r['tango']} | {r['imi1']} |")
    else:
        lines.append("なし")
    lines.append("")

    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"kobunQ.v2.json: {len(v2)} entries -> {OUT_JSON}")
    print(f"  matched: {sum(match_stats[k] for k in ('exact', 'fuzzy-sense', 'example-match'))}"
          f" (exact {match_stats['exact']}, fuzzy {match_stats['fuzzy-sense']},"
          f" example {match_stats['example-match']})")
    print(f"  unmatched(legacy-only): {match_stats['unmatched']}")
    print(f"  examples>=2: {n_two} (was 17) / blanks: {n_blank}")
    print(f"report -> {OUT_REPORT}")


if __name__ == "__main__":
    sys.exit(main())
