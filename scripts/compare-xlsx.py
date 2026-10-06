# -*- coding: utf-8 -*-
"""
compare-xlsx.py — 2つの xlsx を全シート全セルで比べ、変わったセルを出す。読み取り専用。

用途
  単語データの正本 Excel を直すとき、直した複製（または直した後の正本）と元を比べ、
  「狙ったセルだけが狙った値に変わり、ほかは全部そのまま」かを確かめる。
  手順の全体はスキル kobun-vocab-data-fix（F:\\knowledge\\skills\\kobun-vocab-data-fix\\SKILL.md）。

使い方
  python -X utf8 scripts/compare-xlsx.py 元.xlsx 新.xlsx [--expect fixes.json [--levels 確定,推定] [--include-cells K574]]
         [--out 結果.txt]

  - 値の比較は python_calamine（表示される値。書式は見ない）。シート名の並びも比べる。
  - zip の部品ごとのバイト一致と、両ファイルの md5 も出す（xml 方式なら変わる部品は
    対象シートの XML と xl/sharedStrings.xml だけのはず）。
  - --expect を付けると、修正一覧（apply-excel-fixes.py と同じ形）と突き合わせ、
    「狙いどおり / 値が違う / 狙っていないのに変わった / 変わっていない」を数える。
    どれか1つでも 0 でなければ exit 1。--expect なしなら、変わったセルが1つでもあれば exit 1。
  - Windows の標準出力は cp932 で日本語が落ちることがあるので、--out で UTF-8 のファイルに書いて読む。
"""
import argparse
import hashlib
import io
import json
import os
import sys
import zipfile

from python_calamine import CalamineWorkbook


def col_letter(j):
    s = ""
    j += 1
    while j:
        j, r = divmod(j - 1, 26)
        s = chr(65 + r) + s
    return s


def md5(p):
    return hashlib.md5(open(p, "rb").read()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description="2つの xlsx の全シート全セルを比べる（読み取り専用）")
    ap.add_argument("old")
    ap.add_argument("new")
    ap.add_argument("--expect", help="修正一覧 JSON（apply-excel-fixes.py と同じ形）")
    ap.add_argument("--levels", default="確定")
    ap.add_argument("--include-cells", default="")
    ap.add_argument("--out", help="結果を書く UTF-8 ファイル（省略時は標準出力）")
    ap.add_argument("--max-list", type=int, default=300, help="変わったセルを並べる上限")
    a = ap.parse_args()

    out = io.open(a.out, "w", encoding="utf-8") if a.out else io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    def P(*x):
        out.write(" ".join(str(v) for v in x) + "\n")

    P("元:", a.old, os.path.getsize(a.old), "bytes md5", md5(a.old))
    P("新:", a.new, os.path.getsize(a.new), "bytes md5", md5(a.new))
    wa, wb = CalamineWorkbook.from_path(a.old), CalamineWorkbook.from_path(a.new)
    same_names = wa.sheet_names == wb.sheet_names
    P("シート名の並び 同一:", same_names, len(wa.sheet_names), "→", len(wb.sheet_names))
    if not same_names:
        P("  元にだけある:", [n for n in wa.sheet_names if n not in wb.sheet_names],
          " 新にだけある:", [n for n in wb.sheet_names if n not in wa.sheet_names])

    changed = {}
    total = 0
    per_sheet = {}
    for name in wa.sheet_names:
        if name not in wb.sheet_names:
            continue
        ra, rb = wa.get_sheet_by_name(name).to_python(), wb.get_sheet_by_name(name).to_python()
        n = 0
        for i in range(max(len(ra), len(rb))):
            xa = ra[i] if i < len(ra) else []
            xb = rb[i] if i < len(rb) else []
            for j in range(max(len(xa), len(xb))):
                va = xa[j] if j < len(xa) else ""
                vb = xb[j] if j < len(xb) else ""
                total += 1
                if va != vb:
                    changed[(name, "%s%d" % (col_letter(j), i + 1))] = (va, vb)
                    n += 1
        if n:
            per_sheet[name] = n
    P("比べたセル:", total, " 変わったセル:", len(changed), per_sheet)

    fail = not same_names
    if a.expect:
        levels = set(a.levels.split(","))
        inc = set(filter(None, a.include_cells.split(",")))
        fixes = [f for f in json.load(open(a.expect, encoding="utf-8")) if f.get("level") in levels or f["cell"] in inc]
        expect = {(f["sheet"], f["cell"]): f for f in fixes}
        ok = [k for k in changed if k in expect and str(changed[k][1]) == expect[k]["after"]]
        wrong = [k for k in changed if k in expect and str(changed[k][1]) != expect[k]["after"]]
        unexpected = [k for k in changed if k not in expect]
        missing = [k for k in expect if k not in changed]
        P("一覧との突き合わせ（%d セル）: 狙いどおり %d / 値が違う %d / 狙っていないのに変わった %d / 変わっていない %d"
          % (len(expect), len(ok), len(wrong), len(unexpected), len(missing)))
        for label, ks in (("値が違う", wrong), ("狙っていないのに変わった", unexpected), ("変わっていない", missing)):
            for k in ks[:a.max_list]:
                P("  [%s] %s!%s" % (label, k[0], k[1]), repr(changed.get(k, ("", ""))))
        fail = fail or bool(wrong or unexpected or missing)
    else:
        fail = fail or bool(changed)

    P("\n変わったセル（上限 %d）" % a.max_list)
    for (s, c), (va, vb) in list(sorted(changed.items()))[:a.max_list]:
        P("%s!%s" % (s, c))
        P("  前:", repr(va))
        P("  後:", repr(vb))

    za, zb = zipfile.ZipFile(a.old), zipfile.ZipFile(a.new)
    na, nb = za.namelist(), zb.namelist()
    diff = [n for n in na if n in nb and za.read(n) != zb.read(n)]
    P("\nzip 部品: 元 %d / 新 %d / バイト一致 %d / 変わった %s / 新で消えた %s / 新で増えた %s"
      % (len(na), len(nb), len([n for n in na if n in nb]) - len(diff), diff,
         [n for n in na if n not in nb], [n for n in nb if n not in na]))
    P("\n結果:", "NG" if fail else "OK")
    out.flush()
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
