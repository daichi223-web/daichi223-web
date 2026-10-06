# -*- coding: utf-8 -*-
"""
単語クイズ用: qid → 教材実例文 の対応表を生成する。

examples-by-lemma.json（教材由来の実例文）を kobun_q の各 qid（lemma×sense）に
**意味テキストの照合**で割り当てる。番号(meaning_idx/sub)は語によって意味の
並び順が food い違うため使わない（「おどろく」で実際に逆転を確認済み）。
さらに data/enrich/corpus-additions.jsonl の人が選んだ例文（qid 明示）を足す（4回目）。

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

# 4回目: 人が選んだ出典つき例文（qid を明示）を足す。
# 2026-10-06 ユーザー決定: 基本動詞16語（group 353〜368）の候補116件から、確定91件＋要確認8件を採用。
# 採用一覧は ADDITIONS_FILE だけに置く（差し替えはこのファイルの行の増減で行う）。
# 1行 = {id（候補番号）, qid, sentence（出典本文どおり）, work（表示する作品名）, translation,
#        translation_rule, source, where（取得元）, conf, basis}。jp は「sentence（work）」で作る。
# 1〜3回目と同じ条件を当てる:
#   - 同じ文を同じ見出し語の複数 qid に指定している → どの qid にも足さない
#     （追加分どうしに加え、1回目で別の qid に当たった教材文と同じ文も対象）
#   - 多義語で本文が MIN_BODY_LEN_POLYSEMOUS 字未満 → 足さない
#   - 本文が80字を超える → 足さない（1回目と同じ上限）
#   - 同じ qid に同じ文が既にある → 重複させない
ADDITIONS_FILE = "data/enrich/corpus-additions.jsonl"

def same_sentence(a, b):
    """出典の括弧・空白・句読点を除いた本文で比べ、一方が他方を含めば同じ文とみなす（抜粋と全文の重なり）。"""
    def norm(jp):
        s = jp.strip()
        prev = None
        while prev != s:
            prev = s
            s = _TAIL_SRC.sub("", s).strip()
        return re.sub(r"[\s。．、，,・「」『』/／]", "", s)
    x, y = norm(a), norm(b)
    if not x or not y:
        return False
    short, long_ = (x, y) if len(x) <= len(y) else (y, x)
    return short == long_ or (len(short) >= 8 and short in long_)

qid_lemma = {q["qid"]: q["lemma"] for q in qs}
adds = [json.loads(l) for l in open(ADDITIONS_FILE, encoding="utf-8") if l.strip()]
added = 0
add_skipped = []   # (候補番号, 理由)
for a in adds:
    qid = a["qid"]
    if qid not in qid_lemma:
        raise SystemExit(f"{ADDITIONS_FILE}: {a['id']} の qid {qid} が kobun_q に無い")
    lemma = qid_lemma[qid]
    sent = a["sentence"].strip()
    jp = f"{sent}（{a['work']}）" if a.get("work") else sent
    if len(sent) > 80:
        add_skipped.append((a["id"], "80字超")); continue
    others = [b for b in adds if b is not a and qid_lemma.get(b["qid"]) == lemma and b["qid"] != qid
              and same_sentence(b["sentence"], sent)]
    if others:
        add_skipped.append((a["id"], "同じ文を同じ語の別 qid にも指定（" + "・".join(b["id"] for b in others) + "）")); continue
    clash = [q2 for q2, rows in assigned.items() if q2 != qid and qid_lemma.get(q2) == lemma
             and any(same_sentence(r["jp"], jp) for r in rows)]
    if clash:
        add_skipped.append((a["id"], "同じ文が教材の照合で同じ語の別 qid に当たっている（" + "・".join(clash) + "）")); continue
    if lemma_qid_count[lemma] >= 2 and body_len(jp) < MIN_BODY_LEN_POLYSEMOUS:
        add_skipped.append((a["id"], f"多義語の{MIN_BODY_LEN_POLYSEMOUS}字未満")); continue
    rows = out.setdefault(qid, [])
    if any(same_sentence(r["jp"], jp) for r in rows):
        add_skipped.append((a["id"], "同じ qid に同じ文が既にある")); continue
    rows.append({"jp": jp, "translation": (a.get("translation") or "").strip()})
    added += 1
total += added

json.dump(out, open("public/corpus-examples.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"qid {len(out)}/{len(qs)} に {total} 例文を割り当て（複数の意味に当てはまる文 {dropped} 件、多義語の{MIN_BODY_LEN_POLYSEMOUS}字未満の文 {dropped_short} 件を外した）→ public/corpus-examples.json")
print(f"うち {ADDITIONS_FILE} から {added}/{len(adds)} 件を追加（外した {len(add_skipped)} 件）")
for cid, why in add_skipped:
    print(f"  外した: {cid} {why}")
