# -*- coding: utf-8 -*-
"""
単語クイズ用: qid → 教材実例文 の対応表を生成する。

examples-by-lemma.json（教材由来の実例文）を kobun_q の各 qid（lemma×sense）に
**意味テキストの照合**で割り当てる。番号(meaning_idx/sub)は語によって意味の
並び順が food い違うため使わない（「おどろく」で実際に逆転を確認済み）。

出力: public/corpus-examples.json  { qid: [{jp, translation}] }
使い方: python -X utf8 scripts/build-corpus-examples.py
"""
import json, re, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ebl = json.load(open("public/examples-by-lemma.json", encoding="utf-8"))
qs = [json.loads(l) for l in open("public/kobun_q.jsonl.txt", encoding="utf-8") if l.strip()]

def core(s):
    return re.sub(r"[〔〕\s]", "", s or "")

# 多義語（同じ見出し語の qid が2つ以上）の短い文は割り当てない。
# 2026-10-06 ユーザー決定（案B）: 本文が短いと、文だけでは多義語のどの意味かが決まらない
# （出題すると正解が文脈次第になる）。単義語は短くても意味が1つなので残す。
MIN_BODY_LEN_POLYSEMOUS = 10

_TAIL_SRC = re.compile(r"\s*[（(〈<][^（()）〈〉<>]*[）)〉>]\s*$")

def body_len(jp):
    """出典の括弧（末尾の（…）・〈…〉、重なりも）・空白・文末の句読点を除いた本文の字数。"""
    s = jp.strip()
    prev = None
    while prev != s:
        prev = s
        s = _TAIL_SRC.sub("", s).strip()
    s = re.sub(r"\s+", "", s)
    return len(s.rstrip("。．、"))

lemma_qid_count = {}
for q in qs:
    lemma_qid_count[q["lemma"]] = lemma_qid_count.get(q["lemma"], 0) + 1

def match(sense, meaning):
    c = core(sense)
    if not c:
        return False
    cands = [c] + ([c[:-1]] if len(c) >= 3 else [])  # 活用語尾のゆれ（気づい/気づく）を吸収
    return any(x and x in meaning for x in cands)

# 1回目: 意味テキストの照合で各 qid に割り当てる
assigned = {}   # qid -> rows
owners = {}     # (lemma, jp) -> その文が当てはまった qid の集合
for q in qs:
    ents = [e for e in ebl.get(q["lemma"], []) if match(q["sense"], e.get("meaning", ""))]
    rows = []
    for e in ents:
        sent = (e.get("sentence") or "").strip()
        if not sent or len(sent) > 80:
            continue
        src = (e.get("source_work") or "").strip()
        jp = f"{sent}（{src}）" if src else sent
        rows.append({"jp": jp, "translation": (e.get("context") or "").strip()})
    if rows:
        assigned[q["qid"]] = rows
        for r in rows:
            owners.setdefault((q["lemma"], r["jp"]), set()).add(q["qid"])

# 2回目: 同じ見出し語の複数の意味（qid）に当てはまった文は、どの意味の用例か決められない
# （意味を併記した用例が両方に入る）ので、どの qid にも割り当てない。
# 出題でその文が出ると正解が2つになるため。
# 3回目: 多義語で本文が MIN_BODY_LEN_POLYSEMOUS 字未満の文も割り当てない（定数のコメント参照）。
out = {}
total = 0
dropped = 0
dropped_short = 0
for q in qs:
    rows = [r for r in assigned.get(q["qid"], []) if len(owners[(q["lemma"], r["jp"])]) == 1]
    dropped += len(assigned.get(q["qid"], [])) - len(rows)
    if lemma_qid_count[q["lemma"]] >= 2:
        kept = [r for r in rows if body_len(r["jp"]) >= MIN_BODY_LEN_POLYSEMOUS]
        dropped_short += len(rows) - len(kept)
        rows = kept
    if rows:
        out[q["qid"]] = rows
        total += len(rows)

json.dump(out, open("public/corpus-examples.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"qid {len(out)}/{len(qs)} に {total} 例文を割り当て（複数の意味に当てはまる文 {dropped} 件、多義語の{MIN_BODY_LEN_POLYSEMOUS}字未満の文 {dropped_short} 件を外した）→ public/corpus-examples.json")
