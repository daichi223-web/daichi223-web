# -*- coding: utf-8 -*-
"""
check-target-marks.py — 例文の「対象語の位置」(mark) の検査。読み取り専用。

kobunQ.v2.json（正本）と kobunQ.v2.slim.json（再生成後）を読み、次を確かめる:
  (a) 各範囲が 0<=開始・長さ>=1・開始+長さ<=len(jp)、重なりなし・昇順
  (b) jp の各範囲を空欄記号に置き換えると jpBlank（空欄記号を正規化し二連を1つにしたもの）と一致
  (c) jpBlank を持つ example は必ず mark を持つ。持たない example の mark は decide_marks
      （手の表 data/enrich/target-marks-manual.jsonl → 照合で候補が1か所のときだけ）の結果と一致する。
      決まらない example は mark を持たない。mark: [] は「確かめたうえで印を付けない」（2026-10-25〜）
  (d) qid の並びと件数 748 が不変（2026-10-16 基本330に8意味を追加して 740→748）
  (e)(f) 実戦例文 public/corpus-examples.json の mark（check_corpus を参照）
  (g) 手の表の行は、どれも単語帳か実戦例文の例文（qid＋jp）に当たる（使われない行が無い）
人が目で確かめる一覧も出す: 複数範囲の件、見出し語より3文字以上長い範囲の件、
空欄の無い例文の決め方ごとの一覧（手の表・照合・手の表で印なし・決まらない）。

usage: python -X utf8 scripts/check-target-marks.py [一覧の出力先.txt]
  1つでも失敗があれば exit 1。Windows の標準出力は cp932 なので、
  一覧は UTF-8 のファイルへ書き出して読むのが確実。
"""
import json
import os
import re
import sys

sys.dont_write_bytecode = True  # scripts/__pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from target_marks import (  # noqa: E402
    apply_blank, body_length, decide_marks, has_blank, load_manual, normalize_blank,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "data", "kobunQ.v2.json")
SLIM = os.path.join(ROOT, "src", "data", "kobunQ.v2.slim.json")

EXPECTED_WORDS = 748
CORPUS = os.path.join(ROOT, "public", "corpus-examples.json")
ADDITIONS = os.path.join(ROOT, "data", "enrich", "corpus-additions.jsonl")

HOWS = ("manual", "match", "manual-none", "none")


def spans_ok(mark, limit):
    """範囲の形: 1つ以上・整数の組・0<=開始・長さ>=1・limit の内側・重なりなし・昇順"""
    if not (isinstance(mark, list) and len(mark) >= 1):
        return False
    prev_end = 0
    for sp in mark:
        if not (isinstance(sp, list) and len(sp) == 2 and all(isinstance(x, int) for x in sp)):
            return False
        start, length = sp
        if start < 0 or length < 1 or start + length > limit or start < prev_end:
            return False
        prev_end = start + length
    return True


def review_line(kind, qid, lemma, jp, mark, manual):
    texts = " / ".join(jp[a:a + n] for a, n in mark) if mark else ""
    note = (manual.get((qid, jp)) or {}).get("note", "")
    return "\t".join([kind, qid, lemma, texts, jp, note])


def check_corpus(errors, v2_words, manual, used, review):
    """実戦例文 public/corpus-examples.json の mark を全件検査する（2026-10-06〜）。
      (e) 各範囲が 0<=開始・長さ>=1・本文（末尾の出典括弧の手前）の内側、重なりなし・昇順、U+FFFF 超の文字なし
      (f) 追加の行（corpus-additions.jsonl、jp =「sentence（work）」）は必ず mark を持ち、範囲の文字列が
          その行の target の出現形と一致する。それ以外（教材由来）の行の mark は decide_marks の結果と一致する
          （2026-10-25〜。それまでは教材由来の行は mark を持たなかった）
    戻り値: 集計の行のリスト
    """
    with open(CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)
    adds = {}
    with open(ADDITIONS, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                a = json.loads(line)
                s = a["sentence"].strip()
                jp = f"{s}（{a['work']}）" if a.get("work") else s
                adds[(a["qid"], jp)] = a
    n_rows = n_mark = n_add = n_derived = 0
    for qid, rows in corpus.items():
        for i, r in enumerate(rows):
            n_rows += 1
            where = f"corpus {qid}#{i}"
            jp = r.get("jp") or ""
            mark = r.get("mark")
            a = adds.get((qid, jp))
            if a is not None:
                n_add += 1
                if mark is None:
                    errors.append(f"{where}: (f) 追加の例文 {a['id']} に mark が無い: {jp}")
                    continue
            else:
                # 教材由来の行: decide_marks と一致すること
                w = v2_words.get(qid)
                if w is None:
                    errors.append(f"{where}: (f) qid が kobunQ.v2 に無い: {jp}")
                    continue
                try:
                    want, how = decide_marks(qid, w["lemma"], w.get("pos"), jp, None, manual)
                except ValueError as ex:
                    errors.append(f"{where}: (f) 手の表の target が不正: {ex}")
                    continue
                if (qid, jp) in manual:
                    used.add((qid, jp))
                if mark != want:
                    errors.append(f"{where}: (f) mark {mark} が decide_marks の結果 {want}（{how}）と一致しない: {jp}")
                    continue
                review[how].append(review_line("corpus", qid, w["lemma"], jp, mark, manual))
                if not mark:
                    continue  # 印なし（決まらない・手の表で印なし）
                n_derived += 1
            n_mark += 1
            limit = body_length(jp)
            if not spans_ok(mark, limit):
                errors.append(f"{where}: (e) 範囲が不正 {mark}: {jp}")
                continue
            if any(ord(c) > 0xFFFF for c in jp):
                errors.append(f"{where}: (e) jp に U+FFFF 超の文字（JS の添字とずれる）: {jp}")
            if a is None:
                continue
            # target（出現形, 何番目）から位置を求め直し、mark と位置・文字列とも一致することを見る
            body = jp[:limit]
            want = []
            for form, nth in a["target"]:
                pos = [x.start() for x in re.finditer(re.escape(form), body)]
                want.append((pos[nth], len(form)) if nth < len(pos) else (-1, 0))
            texts = [jp[s:s + n] for s, n in mark]
            if sorted(want) != [tuple(sp) for sp in mark] or sorted(texts) != sorted(t[0] for t in a["target"]):
                errors.append(f"{where}: (f) 範囲 {mark} {texts} が target {a['target']} と一致しない: {jp}")
    return [f"corpus: rows={n_rows} markあり={n_mark} (追加の例文={n_add} 教材由来={n_derived})"]


def main():
    with open(SRC, encoding="utf-8") as f:
        v2 = json.load(f)
    with open(SLIM, encoding="utf-8") as f:
        slim = json.load(f)

    errors = []
    multi = []   # 複数範囲
    longer = []  # 見出し語より3文字以上長い範囲
    review = {h: [] for h in HOWS}  # 空欄の無い例文の決め方ごとの一覧
    used = set()  # 使われた手の表の行
    n_examples = n_blank = n_mark = n_single = 0
    try:
        manual = load_manual(ROOT)
    except ValueError as ex:
        errors.append(f"(g) 手の表が不正: {ex}")
        manual = {}

    # (d) qid の並びと件数
    if len(v2) != EXPECTED_WORDS or len(slim) != EXPECTED_WORDS:
        errors.append(f"(d) 件数: v2={len(v2)} slim={len(slim)} 期待={EXPECTED_WORDS}")
    if [w["qid"] for w in v2] != [w["qid"] for w in slim]:
        errors.append("(d) qid の並びが v2 と slim で一致しない")
    if len({w["qid"] for w in slim}) != len(slim):
        errors.append("(d) slim に qid の重複がある")

    for w, s in zip(v2, slim):
        qid = w["qid"]
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
                # (c) jpBlank があれば mark がある
                if mark is None:
                    errors.append(f"{where}: (c) jpBlank があるのに mark が無い: {jp}")
                    continue
            else:
                # (c) jpBlank が無ければ decide_marks の結果と一致する
                try:
                    want, how = decide_marks(qid, w["lemma"], w.get("pos"), jp, None, manual)
                except ValueError as ex:
                    errors.append(f"{where}: (c) 手の表の target が不正: {ex}")
                    continue
                if (qid, jp) in manual:
                    used.add((qid, jp))
                if mark != want:
                    errors.append(f"{where}: (c) jpBlank の無い例文の mark {mark} が decide_marks の結果 {want}（{how}）と一致しない: {jp}")
                    continue
                review[how].append(review_line("slim", qid, w["lemma"], jp, mark, manual))
                if not mark:
                    continue  # 印なし
            n_mark += 1

            # (a) 範囲の形
            if not spans_ok(mark, len(jp)):
                errors.append(f"{where}: (a) 範囲が不正 {mark}: {jp}")
                continue
            if any(ord(c) > 0xFFFF for c in jp):
                errors.append(f"{where}: jp に U+FFFF 超の文字（JS の添字とずれる）: {jp}")

            # (b) 空欄に戻すと jpBlank と一致する（空欄つき例文だけ）
            if blank and apply_blank(jp, mark) != normalize_blank(jp_blank):
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

    n_err_slim = len(errors)
    v2_words = {w["qid"]: w for w in v2}
    corpus_lines = check_corpus(errors, v2_words, manual, used, review)

    # (g) 手の表の行がどれも使われている
    for key in manual:
        if key not in used:
            errors.append(f"(g) 手の表の行が、どの例文にも当たらない（qid か jp の書き違い・例文の削除）: {key[0]} {key[1]}")

    def count(kind):
        return " ".join(f"{h}={sum(1 for x in review[h] if x.startswith(kind + chr(9)))}" for h in HOWS)

    lines = [
        f"words: v2={len(v2)} slim={len(slim)}",
        *corpus_lines,
        f"examples={n_examples} jpBlankあり={n_blank} markあり={n_mark} (単一範囲={n_single} 複数範囲={len(multi)})",
        f"空欄の無い例文の決め方: slim {count('slim')} / corpus {count('corpus')}",
        f"手の表: {len(manual)} 行",
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
    titles = {
        "none": "決まらない（mark なし。画面の照合に任せる）",
        "manual-none": "手の表で印を付けない（mark: []）",
        "manual": "手の表で決めた",
        "match": "照合で1か所に決まった",
    }
    for h in ("none", "manual-none", "manual", "match"):
        lines += ["", f"## 空欄の無い例文: {titles[h]} ({len(review[h])})  種別 / qid / 見出し語 / 範囲 / 例文 / 注", *review[h]]
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    # 標準出力には集計と件数だけ（cp932 で落ちる文字を出さない）
    print(f"words v2={len(v2)} slim={len(slim)} / examples={n_examples} blank={n_blank} "
          f"mark={n_mark} single={n_single} multi={len(multi)} longer={len(longer)} / errors={len(errors)}"
          f" (corpus/manual {len(errors) - n_err_slim})")
    print(corpus_lines[0].replace("markあり", "mark").replace("追加の例文", "additions").replace("教材由来", "derived"))
    print(f"no-blank: slim {count('slim')} / corpus {count('corpus')} / manual rows={len(manual)}")
    if errors:
        print("NG")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
