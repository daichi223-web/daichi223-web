# -*- coding: utf-8 -*-
"""
target_marks.py — 例文の中で「問われている語」がどこにあるかを、空欄つき例文から復元する。

kobunQ.v2.json の example は jp（全文）と jpBlank（対象語を空欄にした文）を並べて持つ。
その差分が対象語の位置。活用した形のまま・正しい位置で印を付けるために使う。

  spans_from_blank(jp, jpBlank) -> [[開始, 長さ], ...] | None

build-kobunq-slim.py（mark の生成）と check-target-marks.py（検査）から import する。
"""
import re

# 空欄記号: 〔 + 空白類 + 〕（閉じが ] の表記ゆれも含む）。
# src/components/quiz/WordQuizContent.tsx の renderBlankSentence と同じ範囲。
BLANK = r"〔[\s　]*[〕\]]"
# 隣り合う空欄（二連空欄）は1つの範囲として扱う
BLANK_RUN = re.compile(r"(?:" + BLANK + r")+")


def has_blank(jp_blank):
    """jpBlank に空欄記号が1つでもあるか"""
    return bool(jp_blank) and BLANK_RUN.search(jp_blank) is not None


def normalize_blank(jp_blank, token="〔〕"):
    """空欄記号の表記ゆれをそろえ、二連空欄を1つにまとめた文字列を返す"""
    return BLANK_RUN.sub(token, jp_blank)


def spans_from_blank(jp, jp_blank):
    """
    jp と jpBlank の差分から、対象語の範囲を [[開始, 長さ], ...] で返す。
    空欄の前後の文字列を錨にして位置を決める。復元できなければ None。
    添字は Python の文字単位。JS の文字列添字（UTF-16）と一致させるため、
    jp に U+FFFF 超の文字が無いことを前提にする。
    """
    if not jp or not has_blank(jp_blank):
        return None
    assert all(ord(c) <= 0xFFFF for c in jp), f"U+FFFF 超の文字あり（UTF-16 換算が必要）: {jp}"

    # 空欄で区切った地の文。parts[0] が文頭、parts[-1] が文末、間が錨
    parts = BLANK_RUN.split(jp_blank)
    n = len(parts) - 1  # 空欄の数
    head, tail = parts[0], parts[-1]
    if not jp.startswith(head):
        return None
    end_limit = len(jp) - len(tail)
    if not jp.endswith(tail) or end_limit < len(head):
        return None

    spans = []
    pos = len(head)
    for i in range(1, n):
        anchor = parts[i]
        if not anchor:
            return None  # BLANK_RUN でまとめているので空の錨は出ないはず
        # 範囲は1文字以上。錨は最も手前の一致を採る
        at = jp.find(anchor, pos + 1, end_limit)
        if at < 0:
            return None
        spans.append([pos, at - pos])
        pos = at + len(anchor)
    if end_limit - pos < 1:
        return None
    spans.append([pos, end_limit - pos])
    return spans


def apply_blank(jp, spans, token="〔〕"):
    """jp の各範囲を空欄記号に置き換えた文字列を返す（検査用）"""
    out = []
    pos = 0
    for start, length in spans:
        out.append(jp[pos:start])
        out.append(token)
        pos = start + length
    out.append(jp[pos:])
    return "".join(out)
