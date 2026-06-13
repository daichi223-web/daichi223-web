# -*- coding: utf-8 -*-
"""
教材コーパスの動詞タグ(conjugationType/conjugationForm/baseForm)から
用言単元の Lv4(文脈総合・sort 300+) ドリルを生成する。

- doushi-katsuyo: 実文の動詞の「活用の種類」判別（9種から4択）
- doushi-yodan 等の型別単元: その型の実文で「活用形」判別
出力: supabase/seeds/grammar-verb-lv4.json（--merge で投入）
"""
import json, glob, collections, io, sys, random

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
random.seed(7)

FORM_NAME = {"未": "未然形", "用": "連用形", "終": "終止形", "体": "連体形", "已": "已然形", "命": "命令形"}

# conjugationType → (種類ラベル, 型別topic)
TYPE_INFO = {}
for gyo in "カガサタダハバマヤラワ":
    TYPE_INFO[f"{gyo}四"] = (f"{gyo}行四段活用", "doushi-yodan")
    TYPE_INFO[f"{gyo}上二"] = (f"{gyo}行上二段活用", "doushi-katsuyo")
    TYPE_INFO[f"{gyo}下二"] = (f"{gyo}行下二段活用", "doushi-shimo-nidan")
    TYPE_INFO[f"{gyo}上一"] = (f"{gyo}行上一段活用", "doushi-kami-ichidan")
TYPE_INFO["ア下二"] = ("ア行下二段活用", "doushi-shimo-nidan")
TYPE_INFO["カ変"] = ("カ行変格活用", "doushi-kahen")
TYPE_INFO["サ変"] = ("サ行変格活用", "doushi-sahen")
TYPE_INFO["ナ変"] = ("ナ行変格活用", "doushi-katsuyo")
TYPE_INFO["ラ変"] = ("ラ行変格活用", "doushi-rahen")

# 種類4択の誤答（正解の型に応じて紛らわしいものを優先）
def type_choices(label):
    base = label[0]  # 行
    kind = label[2:]  # 四段活用 等
    pool = [f"{base}行四段活用", f"{base}行上二段活用", f"{base}行下二段活用", f"{base}行上一段活用",
            "カ行変格活用", "サ行変格活用", "ナ行変格活用", "ラ行変格活用"]
    out = [label] + [c for c in pool if c != label]
    return out[:4]

def mark(sent, ts, te, cue=None):
    spans=[(ts,te,"【","】")]
    if cue and not (cue[0]<te and ts<cue[1]): spans.append((cue[0],cue[1],"《","》"))
    out=sent
    for s0,e0,a,b in sorted(spans,key=lambda x:-x[0]):
        out=out[:s0]+a+out[s0:e0]+b+out[e0:]
    return out

def clip(sent, start, end, window=30, maxlen=70):
    marked = sent[:start] + "【" + sent[start:end] + "】" + sent[end:]
    if len(marked) <= maxlen + 2:
        return marked
    s = max(0, start - window)
    e = min(len(sent), end + window)
    return ("…" if s > 0 else "") + sent[s:start] + "【" + sent[start:end] + "】" + sent[end:e] + ("…" if e < len(sent) else "")

insts = []
for f in sorted(glob.glob("public/texts-v3/*.json")):
    try:
        d = json.load(open(f, encoding="utf-8"))
        if not isinstance(d, dict): continue
    except Exception:
        continue
    title = d.get("title", "")
    for sen in d.get("sentences") or []:
        if not isinstance(sen, dict): continue
        sent = sen.get("originalText") or ""
        if not sent or sent[0] in "」』。、）" or "「」" in sent: continue
        for tk in sen.get("tokens") or []:
            if not isinstance(tk, dict): continue
            g = tk.get("grammarTag") or {}
            if not (isinstance(g, dict) and g.get("pos") == "動詞"): continue
            ct, cf, bf = g.get("conjugationType", ""), g.get("conjugationForm", ""), g.get("baseForm", "")
            if ct not in TYPE_INFO or cf not in FORM_NAME or not bf: continue
            if tk.get("start") is None: continue
            surf = tk.get("text", "")
            if not surf or len(sent) > 90: continue
            # 呼応用: 直後の語（活用形判断の根拠）
            PUNCT=set("、。「」『』・！？　")
            words=[t for t in (sen.get("tokens") or []) if isinstance(t,dict) and t.get("text") and t["text"] not in PUNCT and t.get("start") is not None]
            wi=next((i for i,w in enumerate(words) if w is tk),None)
            nxt=None
            if wi is not None and wi+1<len(words):
                nw=words[wi+1]; nxt=(nw["start"],nw["end"])
            insts.append({
                "surface": surf, "base": bf, "type": ct, "form": cf, "title": title,
                "ts": tk["start"], "te": tk["end"], "nxt": nxt, "sent": sent,
                "ctx": clip(sent, tk["start"], tk["end"]), "sentlen": len(sent),
            })

print(f"動詞インスタンス: {len(insts)}")

drills = []
# A) doushi-katsuyo Lv4: 活用の種類判別（多様な型からバランスよく）
by_type = collections.defaultdict(list)
for i in insts:
    by_type[i["type"]].append(i)
seq = 0
used_base = set()
for ct in ["カ四", "ラ四", "ハ四", "サ四", "マ四", "カ上二", "ダ上二", "ハ下二", "ヤ下二", "ア下二", "カ上一", "マ上一", "ワ上一", "カ変", "サ変", "ナ変", "ラ変"]:
    pool = [i for i in by_type.get(ct, []) if i["base"] not in used_base]
    pool.sort(key=lambda x: x["sentlen"])
    if not pool: continue
    i = pool[0]
    used_base.add(i["base"])
    label, _ = TYPE_INFO[ct]
    seq += 1
    if seq > 12: break
    drills.append({
        "id": f"doushi-katsuyo-d{seq:02}", "topic_id": "doushi-katsuyo", "kind": "katsuyo-type",
        "prompt": f"この文の「{i['surface']}」（基本形「{i['base']}」）の活用の種類は？",
        "context": mark(i["sent"], i["ts"], i["te"]), "choices": type_choices(label), "answer": label,
        "explanation": f"「{i['base']}」は{label}。「ず」を付けた未然形の段と、暗記動詞かどうかで判別する。（{i['title']}）",
        "ref_heading": "活用の種類", "sort": 300 + seq,
    })

# B) 型別単元 Lv4: 活用形判別（その型の実文）
REF = {"doushi-yodan": "活用表", "doushi-shimo-nidan": "活用表", "doushi-kami-ichidan": "活用表",
       "doushi-kahen": "活用表", "doushi-sahen": "活用表", "doushi-rahen": "活用表"}
per_topic = collections.defaultdict(list)
for i in insts:
    label, topic = TYPE_INFO[i["type"]]
    if topic == "doushi-katsuyo": continue
    per_topic[topic].append((i, label))
for topic, pool in per_topic.items():
    pool.sort(key=lambda x: x[0]["sentlen"])
    used = set(); n = 0
    for i, label in pool:
        if n >= 6: break
        key = (i["base"], i["form"])
        if key in used or i["ctx"] in used: continue
        used.add(key); used.add(i["ctx"]); n += 1
        ans = FORM_NAME[i["form"]]
        choices = [ans] + [v for v in ["未然形", "連用形", "終止形", "連体形", "已然形", "命令形"] if v != ans][:3]
        drills.append({
            "id": f"{topic}-d{n:02}", "topic_id": topic, "kind": "katsuyo-fill",
            "prompt": f"この文の「{i['surface']}」（{label}「{i['base']}」）の活用形は？",
            "context": mark(i["sent"], i["ts"], i["te"], i["nxt"]), "choices": choices, "answer": ans,
            "explanation": f"{label}「{i['base']}」の{ans}。下に続く語から判断する。（{i['title']}）",
            "ref_heading": REF.get(topic, "活用表"), "sort": 300 + n,
        })

out = "supabase/seeds/grammar-verb-lv4.json"
json.dump(drills, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
cnt = collections.Counter(d["topic_id"] for d in drills)
for t, n in sorted(cnt.items()): print(f"  {n:2} {t}")
print(f"計 {len(drills)} 問 → {out}")
