# -*- coding: utf-8 -*-
"""
check-target-marks.py — 例文の「対象語の位置」(mark) の検査。読み取り専用。

kobunQ.v2.json（正本）と kobunQ.v2.slim.json（再生成後）を読み、次を確かめる:
  (a) 各範囲が 0<=開始・長さ>=1・開始+長さ<=len(jp)、重なりなし・昇順
  (b) jp の各範囲を空欄記号に置き換えると jpBlank（空欄記号を正規化し二連を1つにしたもの）と一致
  (c) jpBlank を持つ example は必ず mark を持ち、持たない example には mark が無い
  (d) qid の並びと件数 741 が不変
人が目で確かめる一覧も出す: 複数範囲の件、見出し語より3文字以上長い範囲の件。

usage: python -X utf8 scripts/check-target-marks.py [一覧の出力先.txt]
  1つでも失敗があれば exit 1。Windows の標準出力は cp932 なので、
  一覧は UTF-8 のファイルへ書き出して読むのが確実。
"""
import json
import os
import sys

sys.dont_write_bytecode = True  # scripts/__pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from target_marks import apply_blank, has_blank, normalize_blank  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
SLIM = os.path.join(ROOT, "src", "data", "kobunQ.v2.slim.json")

EXPECTED_WORDS = 741


def main():
    with open(SRC, encoding="utf-8") as f:
        v2 = json.load(f)
    with open(SLIM, encoding="utf-8") as f:
        slim = json.load(f)

    errors = []
    multi = []   # 複数範囲
    longer = []  # 見出し語より3文字以上長い範囲
    n_examples = n_blank = n_mark = n_single = 0

    # (d) qid の並びと件数
    if len(v2) != EXPECTED_WORDS or len(slim) != EXPECTED_WORDS:
        errors.append(f"(d) 件数: v2={len(v2)} slim={len(slim)} 期待={EXPECTED_WORDS}")
    if [w["qid"] for w in v2] != [w["qid"] for w in slim]:
        errors.append("(d) qid の並びが v2 と slim で一致しない")
    if len({w["qid"] for w in slim}) != len(slim):
        errors.append("(d) slim に qid の重複がある")

    for w, s in zip(v2, slim):
        qid = w["qid"]
        # slim は jp/translation/source が全部空の example を持たない前提ではないので、件数をそのまま比べる
        src_ex = w.get("examples", [])
        slim_ex = s.get("examples", [])
        if len(src_ex) != len(slim_ex):
            errors.append(f"{qid}: example の件数が v2={len(src_ex)} slim={len(slim_ex)}")
            continue
        for i, (e, se) in enumerate(zip(src_ex, slim_ex)):
            n_examples += 1
            where = f"{qid}#{i}"
            jp = e.get("jp") or ""
            if (se.get("jp") or "") != jp:
                errors.append(f"{where}: jp が v2 と slim で一致しない")
                continue
            jp_blank = e.get("jpBlank")
            mark = se.get("mark")
            blank = has_blank(jp_blank)
            if blank:
                n_blank += 1
            # (c) jpBlank と mark の有無が対応する
            if blank and mark is None:
                errors.append(f"{where}: (c) jpBlank があるのに mark が無い: {jp}")
                continue
            if not blank:
                if mark is not None:
                    errors.append(f"{where}: (c) jpBlank が無いのに mark がある: {jp}")
                continue
            n_mark += 1

            # (a) 範囲の形
            ok = isinstance(mark, list) and len(mark) >= 1
            prev_end = 0
            if ok:
                for sp in mark:
                    if not (isinstance(sp, list) and len(sp) == 2 and all(isinstance(x, int) for x in sp)):
                        ok = False
                        break
                    start, length = sp
                    if start < 0 or length < 1 or start + length > len(jp) or start < prev_end:
                        ok = False
                        break
                    prev_end = start + length
            if not ok:
                errors.append(f"{where}: (a) 範囲が不正 {mark}: {jp}")
                continue
            if any(ord(c) > 0xFFFF for c in jp):
                errors.append(f"{where}: jp に U+FFFF 超の文字（JS の添字とずれる）: {jp}")

            # (b) 空欄に戻すと jpBlank と一致する
            if apply_blank(jp, mark) != normalize_blank(jp_blank):
                errors.append(f"{where}: (b) 空欄に戻した文が jpBlank と一致しない {mark}: {jp} || {jp_blank}")
                continue

            texts = [jp[a:a + n] for a, n in mark]
            if len(mark) == 1:
                n_single += 1
            else:
                multi.append(f"{qid}\t{w['lemma']}\t{' / '.join(texts)}\t{jp}")
            for t in texts:
                if len(t) >= len(w["lemma"]) + 3:
                    longer.append(f"{qid}\t{w['lemma']}\t{t}\t{jp}")

    lines = [
        f"words: v2={len(v2)} slim={len(slim)}",
        f"examples={n_examples} jpBlankあり={n_blank} markあり={n_mark} (単一範囲={n_single} 複数範囲={len(multi)})",
        f"errors={len(errors)}",
        "",
        f"## エラー ({len(errors)})",
        *errors,
        "",
        f"## 複数範囲 ({len(multi)})  qid / 見出し語 / 範囲 / 例文",
        *multi,
        "",
        f"## 見出し語より3文字以上長い範囲 ({len(longer)})  qid / 見出し語 / 範囲 / 例文",
        *longer,
    ]
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    # 標準出力には集計と件数だけ（cp932 で落ちる文字を出さない）
    print(f"words v2={len(v2)} slim={len(slim)} / examples={n_examples} blank={n_blank} "
          f"mark={n_mark} single={n_single} multi={len(multi)} longer={len(longer)} / errors={len(errors)}")
    if errors:
        print("NG")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
