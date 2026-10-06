# -*- coding: utf-8 -*-
"""
単語クイズ用: qid → 教材実例文 の対応表を生成する。

examples-by-lemma.json（教材由来の実例文）を kobun_q の各 qid（lemma×sense）に
**意味テキストの照合**で割り当てる。番号(meaning_idx/sub)は語によって意味の
並び順が food い違うため使わない（「おどろく」で実際に逆転を確認済み）。
さらに data/enrich/corpus-additions.jsonl の人が選んだ例文（qid 明示）を足す（4回目）。

出力: public/corpus-examples.json  { qid: [{jp, translation, mark?}] }
  mark = 問われている語の位置 [[開始, 長さ], …]（JS の文字列添字。slim の examples[].mark と同じ形）。
  corpus-additions.jsonl の target（出現形と何番目の出現か）から計算する。
  教材由来（examples-by-lemma.json）の例文は入力に位置の手がかりが無いので mark を持たない
  （画面では従来どおり活用照合で印を付ける）。
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
# 1行 = {id（候補番号）, qid, sentence（出典本文どおり）, target, target_by, target_note?,
#        work（表示する作品名）, translation, translation_rule, source, where（取得元）, conf, basis}。
#        jp は「sentence（work）」で作る。
# target = [[出現形, 何番目の出現か(0始まり)], …]。対象語そのものの出現形（活用形・漢字表記込み、
#   複合語は対象の語の部分だけ）。呼応など対象が複数語にまたがるときは複数。target_by = 機械（活用照合の
#   候補が1つで決定と一致）/ 人（本文と根拠を読んで決めた。理由は target_note）。2026-10-06。
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

def target_mark(a):
    """target から mark を計算し、形を assert する（範囲内・重なりなし・昇順・文字列が出現形と一致）。"""
    sent = a["sentence"].strip()
    tg = a.get("target")
    if not (isinstance(tg, list) and tg):
        raise SystemExit(f"{ADDITIONS_FILE}: {a['id']} に target が無い")
    if any(ord(c) > 0xFFFF for c in sent):
        raise SystemExit(f"{ADDITIONS_FILE}: {a['id']} の本文に U+FFFF 超の文字（JS の添字とずれる）")
    mark = []
    for item in tg:
        if not (isinstance(item, list) and len(item) == 2 and isinstance(item[0], str) and item[0]
                and isinstance(item[1], int) and item[1] >= 0):
            raise SystemExit(f"{ADDITIONS_FILE}: {a['id']} の target の形が不正 {item}")
        form, nth = item
        pos = [m.start() for m in re.finditer(re.escape(form), sent)]
        if nth >= len(pos):
            raise SystemExit(f"{ADDITIONS_FILE}: {a['id']} の「{form}」の{nth}番目の出現が本文に無い（{len(pos)}か所）")
        mark.append((pos[nth], len(form), form))
    mark.sort()
    end = 0
    for s, n, form in mark:
        if not (s >= end and n >= 1 and s + n <= len(sent) and sent[s:s + n] == form):
            raise SystemExit(f"{ADDITIONS_FILE}: {a['id']} の範囲が不正（範囲外・重なり・文字列の不一致） {mark}")
        end = s + n
    return [[s, n] for s, n, _ in mark]

qid_lemma = {q["qid"]: q["lemma"] for q in qs}
adds = [json.loads(l) for l in open(ADDITIONS_FILE, encoding="utf-8") if l.strip()]
add_marks = {a["id"]: target_mark(a) for a in adds}  # 外す行も含めて全行を検査する
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
    # jp は sentence で始まるので、sentence 内の位置がそのまま jp の位置になる
    assert jp.startswith(sent)
    rows.append({"jp": jp, "translation": (a.get("translation") or "").strip(), "mark": add_marks[a["id"]]})
    added += 1
total += added

json.dump(out, open("public/corpus-examples.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"qid {len(out)}/{len(qs)} に {total} 例文を割り当て（複数の意味に当てはまる文 {dropped} 件、多義語の{MIN_BODY_LEN_POLYSEMOUS}字未満の文 {dropped_short} 件を外した）→ public/corpus-examples.json")
print(f"うち {ADDITIONS_FILE} から {added}/{len(adds)} 件を追加（外した {len(add_skipped)} 件）")
for cid, why in add_skipped:
    print(f"  外した: {cid} {why}")
