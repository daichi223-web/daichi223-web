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

def match(sense, meaning):
    c = core(sense)
    if not c:
        return False
    cands = [c] + ([c[:-1]] if len(c) >= 3 else [])  # 活用語尾のゆれ（気づい/気づく）を吸収
    return any(x and x in meaning for x in cands)

out = {}
total = 0
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
        out[q["qid"]] = rows
        total += len(rows)

json.dump(out, open("public/corpus-examples.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"qid {len(out)}/{len(qs)} に {total} 例文を割り当て → public/corpus-examples.json")
