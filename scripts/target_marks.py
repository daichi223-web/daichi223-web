# -*- coding: utf-8 -*-
"""
target_marks.py — 例文の中で「問われている語」がどこにあるかを、空欄つき例文から復元する。

kobunQ.v2.json の example は jp（全文）と jpBlank（対象語を空欄にした文）を並べて持つ。
その差分が対象語の位置。活用した形のまま・正しい位置で印を付けるために使う。

  spans_from_blank(jp, jpBlank) -> [[開始, 長さ], ...] | None

  decide_marks(qid, lemma, pos, jp, jp_blank, manual) -> (範囲 | None, 決め方)

build-kobunq-slim.py・build-corpus-examples.py（mark の生成）と check-target-marks.py（検査）から import する。

■ 空欄つき例文が無い例文（2026-10-25〜）
  単語帳の例文のうち jpBlank の無いもの（旧 kobunQ 由来の135件）と、実戦例文の教材由来の文は
  差分の手がかりが無い。従来は画面の活用照合（src/lib/targetMark.ts の findInflectedSpan）
  だけに任せていたので、漢字表記（会ひ・仰せ・気色）や語幹1字の語（いづ・いふ）に印が付かなかった。
  そこで生成時に次の順で位置を決め、データの mark として持たせる:
    ① 手で決めた表 data/enrich/target-marks-manual.jsonl（qid＋jp ごとの target＝[出現形, 何番目]）。
       target が [] の行は「確かめたうえで印を付けない」（対象語が文に無い・別の語など）
    ② 照合（match_spans）: 見出し語と表記の表 SPELLINGS を活用させ、本文の中で候補が
       ちょうど1か所に決まるときだけ付ける。2か所以上・0か所なら付けない（推測しない）
  ①②で決まらなければ mark を持たず、画面は従来どおりの照合に任せる。
"""
import json
import os
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


# ---------------------------------------------------------------------------
# 空欄の無い例文の照合（2026-10-25〜）。src/lib/targetMark.ts の findInflectedSpan と同じ
# 活用の規則に、漢字表記（SPELLINGS）と「候補が1か所に決まるときだけ」の条件を足したもの。
# ---------------------------------------------------------------------------

# 照合での印を付けない語（src/lib/targetMark.ts の NO_MATCH_QIDS と同じ）。手の表は効く
NO_MATCH_QIDS = {"48-1", "55-1", "64-1", "64-3"}

# 見出し語の別の表記（終止形・言い切りの形で書く）。活用の規則は見出し語と同じに当てる。
# 漢字1字だけの表記（心・世・手・文・例 など）は別の語の一部に当たりやすいので入れない（手の表で決める）。
SPELLINGS = {
    "あく": ["飽く"],
    "あふ": ["会ふ", "逢ふ", "合ふ"],
    "いうなり": ["優なり"],
    "いづ": ["出づ"],
    "いふ": ["言ふ", "云ふ"],
    "いふかひなし": ["言ふかひなし", "言ふ甲斐なし"],
    "うす": ["失す"],
    "うれふ": ["憂ふ", "愁ふ"],
    "おとにきく": ["音に聞く"],
    "おぼす・おぼしめす": ["思す", "思しめす", "思し召す", "おぼし召す"],
    "おほす": ["仰す"],
    "おほとのごもる": ["大殿ごもる", "大殿籠る"],
    "おもはずなり": ["思はずなり"],
    "おもひやる": ["思ひやる"],
    "かちより": ["徒歩より"],
    "かぎり": ["限り"],
    "きようず": ["興ず"],
    "ぐす": ["具す"],
    "くもゐ": ["雲居"],
    "けしき": ["気色"],
    "こうず": ["困ず"],
    "こころぐるし": ["心苦し"],
    "こころづきなし": ["心づきなし"],
    "こころやすし": ["心やすし", "心安し"],
    "さた": ["沙汰"],
    "さはる": ["障る"],
    "しる": ["知る"],
    "せうそこ": ["消息"],
    "たまはす": ["賜はす"],
    "ちぎり": ["契り"],
    "ときめく": ["時めく"],
    "としごろ": ["年ごろ", "年頃"],
    "ひがごと": ["僻事"],
    "びんなし": ["便なし"],
    "ほい": ["本意"],
    "まうづ": ["詣づ"],
    "まさに": ["当に", "正に"],
    "またのひ": ["またの日"],
    "みゆ": ["見ゆ"],
    "よ・よのなか": ["世の中"],
    "よのつねなり": ["世の常なり"],
    "れいの": ["例の"],
    "をりふし": ["折節"],
}

_VERB_ROWS = {
    "く": "かきくけ", "ぐ": "がぎぐげ", "す": "さしすせ", "ず": "ざじずぜ",
    "つ": "たちつて", "づ": "だぢづで", "ぬ": "なにぬね", "ふ": "はひふへ",
    "ぶ": "ばびぶべ", "む": "まみむめ", "ゆ": "やいゆえ", "る": "らりるれ",
    "り": "らりるれ", "う": "わゐうゑあいえ",
}
_U_DAN = "くぐすずつづぬふぶむゆるう"
_ONBIN = "いうっん"
_ADJ_ENDINGS = ["けれ", "から", "かり", "かる", "かれ", "く", "き", "う"]
_ADJ_VERB_ENDINGS = ["なり", "なる", "なれ", "なら", "たり", "たる", "に", "な", "と"]
_KANJI = re.compile(r"[㐀-鿿々]")
_TAIL_PAREN = re.compile(r"[（(][^（）()]*[）)]\s*$")


def lemma_forms(lemma):
    """見出し語を照合に使う語へ分ける（targetMark.ts の lemmaForms と同じ）"""
    src = (lemma or "").strip()
    tilde = re.split(r"[～〜~]", src)
    if len(tilde) > 1:
        src = next((p for p in tilde if p.strip()), "")
    bare = re.sub(r"[（(][^（）()]*[）)]", "", src)
    inner = re.findall(r"[（(]([^（）()]*)[）)]", src)
    out = []
    for part in [bare, *inner]:
        for p in re.split(r"[・/／]", part):
            t = p.strip()
            if t and t not in out:
                out.append(t)
    return out


def body_length(text):
    """末尾の出典括弧の手前までの長さ"""
    m = _TAIL_PAREN.search(text)
    return m.start() if m else len(text)


def _stem_ok(stem):
    # かなの語幹は2字以上（誤爆を避ける。targetMark.ts と同じ）。漢字を含む語幹は1字でよい
    return len(stem) >= 2 or bool(_KANJI.search(stem))


def _inflected_length(text, at, form, pos, limit):
    """語幹が at にあるとして、活用語尾まで含めた長さ。読めなければ 0（targetMark.ts と同じ規則）"""
    if pos == "動詞":
        row = _VERB_ROWS.get(form[-1:])
        stem = form[:-1]
        if not row or not _stem_ok(stem):
            return 0
        i = at + len(stem)
        if i >= limit:
            return 0
        nxt = text[i]
        if nxt in row:
            after = text[i + 1] if i + 1 < limit else ""
            extend = nxt in _U_DAN and after in ("る", "れ")
            return len(stem) + (2 if extend else 1)
        return len(stem) + 1 if nxt in _ONBIN else 0
    if pos == "形容詞":
        last, stem = form[-1:], form[:-1]
        if not _stem_ok(stem) or last not in "しじき":
            return 0
        rest = text[at + len(stem):limit]
        sib = "じ" if last == "じ" else "し"
        if rest.startswith(sib):
            e = next((x for x in _ADJ_ENDINGS if rest.startswith(x, 1)), None)
            return len(stem) + 1 + (len(e) if e else 0)
        if last == "じ":
            return 0
        e = next((x for x in _ADJ_ENDINGS if rest.startswith(x)), None)
        return len(stem) + len(e) if e else 0
    if pos == "形容動詞":
        if not re.search(r"(なり|たり)$", form):
            return 0
        stem = form[:-2]
        if not _stem_ok(stem):
            return 0
        rest = text[at + len(stem):limit]
        e = next((x for x in _ADJ_VERB_ENDINGS if rest.startswith(x)), None)
        return len(stem) + len(e) if e else 0
    return 0


def match_candidates(text, lemma, pos):
    """見出し語（と SPELLINGS の表記）が本文に現れる候補の範囲をすべて返す。
    他の候補に含まれる候補（同じ位置からの短いものなど）は外す。"""
    limit = body_length(text)
    base = lemma_forms(lemma)
    forms = base + [f for f in SPELLINGS.get(lemma, []) if f not in base]
    cands = set()
    for form in forms:
        # 完全一致（かな1字の語は除く。どこにでも当たる）
        if len(form) >= 2 or _KANJI.search(form):
            for m in re.finditer(re.escape(form), text[:limit]):
                cands.add((m.start(), len(form)))
        if pos in ("動詞", "形容詞"):
            stem = form[:-1]
        elif pos == "形容動詞":
            stem = form[:-2]
        else:
            stem = ""
        if not stem or not _stem_ok(stem):
            continue
        for m in re.finditer(re.escape(stem), text[:limit]):
            n = _inflected_length(text, m.start(), form, pos, limit)
            if n > 0:
                cands.add((m.start(), n))
    keep = [c for c in cands
            if not any(o != c and o[0] <= c[0] and c[0] + c[1] <= o[0] + o[1] for o in cands)]
    return sorted(keep)


def match_spans(text, lemma, pos, qid=None):
    """候補がちょうど1か所のときだけ [[開始, 長さ]] を返す。0か所・2か所以上は None（推測しない）"""
    if not text or not lemma or qid in NO_MATCH_QIDS:
        return None
    assert all(ord(c) <= 0xFFFF for c in text), f"U+FFFF 超の文字あり（UTF-16 換算が必要）: {text}"
    cands = match_candidates(text, lemma, pos)
    if len(cands) != 1:
        return None
    return [list(cands[0])]


def spans_from_target(text, target):
    """target = [[出現形, 何番目(0始まり)], ...] から範囲を求める。本文（出典括弧の手前）の中だけを数える。
    不正なら ValueError。"""
    body = text[:body_length(text)]
    spans = []
    for item in target:
        if not (isinstance(item, list) and len(item) == 2 and isinstance(item[0], str) and item[0]
                and isinstance(item[1], int) and item[1] >= 0):
            raise ValueError(f"target の形が不正 {item}: {text}")
        form, nth = item
        pos = [m.start() for m in re.finditer(re.escape(form), body)]
        if nth >= len(pos):
            raise ValueError(f"「{form}」の{nth}番目の出現が本文に無い（{len(pos)}か所）: {text}")
        spans.append([pos[nth], len(form)])
    spans.sort()
    end = 0
    for s, n in spans:
        if s < end:
            raise ValueError(f"範囲が重なる {spans}: {text}")
        end = s + n
    return spans


MANUAL_PATH = "data/enrich/target-marks-manual.jsonl"


def load_manual(root):
    """手で決めた表を {(qid, jp): 行} で返す。1行 = {qid, lemma, jp, target, note}。
    jp は例文の全文（出典括弧も含めて、単語帳・実戦例文の jp と一字一句同じ）。"""
    out = {}
    with open(os.path.join(root, MANUAL_PATH), encoding="utf-8") as f:
        for no, line in enumerate(f, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            key = (row["qid"], row["jp"])
            if key in out:
                raise ValueError(f"{MANUAL_PATH}:{no} 同じ qid・jp の行が2つある: {key}")
            if not isinstance(row.get("target"), list):
                raise ValueError(f"{MANUAL_PATH}:{no} target が無い")
            spans_from_target(row["jp"], row["target"])  # 形の検査
            out[key] = row
    return out


def decide_marks(qid, lemma, pos, jp, jp_blank, manual):
    """例文1つの mark と決め方を返す。
    決め方: blank（空欄の差分）/ manual（手の表）/ manual-none（手の表で「印を付けない」。範囲は []）/
            match（照合で1か所に決まった）/ none（決まらない。範囲は None で、mark を持たない）
    mark: [] は「確かめたうえで印を付けない」（画面の照合も止める。src/lib/targetMark.ts）。"""
    if has_blank(jp_blank):
        return spans_from_blank(jp, jp_blank), "blank"
    row = manual.get((qid, jp))
    if row is not None:
        if not row["target"]:
            return [], "manual-none"
        return spans_from_target(jp, row["target"]), "manual"
    spans = match_spans(jp, lemma, pos, qid)
    if spans:
        return spans, "match"
    return None, "none"
