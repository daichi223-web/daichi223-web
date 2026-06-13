# -*- coding: utf-8 -*-
"""
教材コーパス(public/texts-v3)の助動詞タグから Lv2/Lv3 ドリルを自動生成する。

- Lv2 (sort 100-199): 教材実文の意味判別（「この文の『ける』の意味は？」）
- Lv3 (sort 200-299): 同形の正体識別（に・ぬ・ね・る・れ・なり・せ）
- level は sort 帯域でエンコード（DDL不要）: <100=Lv1, 100-199=Lv2, 200+=Lv3

出力: supabase/seeds/grammar-corpus-lv23.json（apply-drills.mjs で投入）
使い方: python -X utf8 scripts/mine-aux-drills.py
"""
import json, glob, collections, io, sys, random, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
random.seed(42)  # 再現可能に

MAX_LV2_PER_TOPIC = 8
MAX_LV3_PER_TOPIC = 6
MAX_LV4_PER_TOPIC = 6  # 文脈総合（長文・助動詞密度の高い文）
MAX_PER_SURFACE_MEANING = 2
MAX_SENT = 60  # これを超える文はトークン周辺を切り出す

FORM_NAME = {"未": "未然形", "用": "連用形", "終": "終止形", "体": "連体形", "已": "已然形", "命": "命令形"}

# 文と現代語訳のアライメントが崩れている教材（監査 2026-06-12 で確認）
TITLE_BAN = {"花山院の出家", "萩のうは露", "廃院の怪", "里にまかでたるに", "若紫の君",
             "宣耀殿の女御", "賀茂の祭りを見物する翁", "鷲にさらわれた赤子", "渚の院", "千早城の戦い"}
# 個別に訳ズレ・タグ疑義を確認した文（部分一致で除外）
SUBSTR_BAN = ["刈る早飯", "御局は桐壺", "年も返りぬ", "同じ所に住まむ限り",
              "おどろかせたまへ", "寝入りたまひにけり", "紙燭持て参れり", "とぞ付けたりける",
              "予が趣向", "人心うしみつ", "御車ども立てつづけ"]

def sentence_ok(sent, trans):
    """引用符の壊れ・訳の欠落を弾く"""
    if not sent or not trans or len(trans.strip()) < 4:
        return False
    if sent[0] in "」』。、）":
        return False
    if "「」" in sent or "『』" in sent or "（）" in sent:
        return False
    if trans.strip().startswith(("」", "』")):
        return False
    if any(b in sent for b in SUBSTR_BAN):
        return False
    return True

def topic_for(surface, meaning):
    m, s = meaning, surface
    if m == "打消":
        return "jodoshi-zu"
    if m in ("過去", "詠嘆"):
        return "jodoshi-keri" if s.startswith("け") else None  # き(し・しか)は個別単元なし
    if m in ("完了", "強意", "存続"):
        if s in ("て", "つ", "つる", "つれ", "てよ"): return "jodoshi-tsu"
        if s in ("な", "に", "ぬ", "ぬる", "ぬれ", "ね"): return "jodoshi-nu"
        if s.startswith("た"): return "jodoshi-tari"
        if s in ("ら", "り", "る", "れ"): return "jodoshi-ri"
        return None
    if m in ("推量", "意志", "勧誘", "婉曲", "仮定", "適当", "当然", "命令", "義務"):
        if s.startswith("べ"): return "jodoshi-beshi"
        if s in ("む", "め", "ん"): return "jodoshi-mu"
        return None  # らむ・けむ・まし等は個別単元なし
    if m in ("受身", "自発"):
        return "jodoshi-ru"
    if m == "可能":
        return "jodoshi-beshi" if s.startswith("べ") else "jodoshi-ru"
    if m == "尊敬":
        if s in ("せ", "させ", "す", "さす", "する", "すれ", "しめ", "しむ"): return "jodoshi-su"
        if s in ("れ", "る", "るる", "るれ", "られ", "らる"): return "jodoshi-ru"
        return None
    if m == "使役":
        return "jodoshi-su"
    if m in ("断定", "存在"):
        if s.startswith("た"): return None  # 断定「たり」は別系
        return "jodoshi-nari"
    if m in ("伝聞", "推定", "伝聞推定"):
        return "jodoshi-nari" if s in ("なり", "なる", "なれ", "な") else None
    return None

# Lv2 意味選択肢（answer を必ず含め、残りをこの順で充填して4つ）
MEANING_CHOICES = {
    "jodoshi-keri": ["過去", "詠嘆", "完了", "伝聞推定"],
    "jodoshi-tsu": ["完了", "強意", "打消", "受身"],
    "jodoshi-nu": ["完了", "強意", "打消", "断定"],
    "jodoshi-tari": ["完了", "存続", "断定", "打消"],
    "jodoshi-ri": ["完了", "存続", "受身", "可能"],
    "jodoshi-mu": ["推量", "意志", "勧誘", "婉曲", "仮定", "適当"],
    "jodoshi-beshi": ["推量", "意志", "可能", "当然", "命令", "適当"],
    "jodoshi-ru": ["受身", "尊敬", "自発", "可能"],
    "jodoshi-su": ["使役", "尊敬", "受身", "自発"],
    "jodoshi-nari": ["断定", "伝聞推定", "完了", "存在"],
}

# 意味判別の一行ヒント
HINT = {
    ("jodoshi-keri", "過去"): "地の文の「けり」＝伝聞過去。",
    ("jodoshi-keri", "詠嘆"): "会話・和歌の感動の文脈→詠嘆「〜だなあ」。",
    ("jodoshi-mu", "意志"): "主語が一人称→意志「〜しよう」。",
    ("jodoshi-mu", "推量"): "主語が三人称→推量「〜だろう」。",
    ("jodoshi-mu", "婉曲"): "文中・下に体言（連体形の「む」）→婉曲「〜ような」。",
    ("jodoshi-mu", "勧誘"): "相手への呼びかけ→勧誘「〜しませんか」。",
    ("jodoshi-mu", "仮定"): "「〜むは・〜むに」の形→仮定「〜としたら」。",
    ("jodoshi-ru", "受身"): "動作を受ける側が主語→受身「〜される」。",
    ("jodoshi-ru", "尊敬"): "主語が貴人→尊敬「〜なさる」。",
    ("jodoshi-ru", "自発"): "心情・知覚の動詞→自発「自然と〜される」。",
    ("jodoshi-ru", "可能"): "打消を伴う→可能「〜できない」。",
    ("jodoshi-su", "使役"): "動作させる相手（〜に）がいる→使役。",
    ("jodoshi-su", "尊敬"): "「せ給ふ」型・貴人が主語→尊敬。",
    ("jodoshi-nu", "完了"): "直前が連用形→完了「〜てしまった」。",
    ("jodoshi-nu", "強意"): "下に推量（べし・む）→強意「きっと〜」。",
    ("jodoshi-tsu", "完了"): "直前が連用形→完了。",
    ("jodoshi-tsu", "強意"): "下に推量（む・べし）→強意。",
    ("jodoshi-tari", "完了"): "動作がし終わった→完了「〜た」。",
    ("jodoshi-tari", "存続"): "結果・状態が続いている→存続「〜ている」。",
    ("jodoshi-ri", "完了"): "動作がし終わった→完了。",
    ("jodoshi-ri", "存続"): "状態が続いている→存続「〜ている」。",
    ("jodoshi-nari", "断定"): "体言・連体形＋なり→断定「〜である」。",
    ("jodoshi-nari", "伝聞推定"): "終止形＋なり／音や噂が根拠→伝聞推定。",
    ("jodoshi-nari", "存在"): "場所＋なり→存在「〜にある」。",
}

REF2 = {
    "jodoshi-keri": "意味の判別", "jodoshi-mu": "意味の判別", "jodoshi-beshi": "意味の判別",
    "jodoshi-ru": "意味の判別", "jodoshi-su": "意味の判別", "jodoshi-tari": "意味の判別",
    "jodoshi-tsu": "意味", "jodoshi-nu": "意味", "jodoshi-ri": "意味",
    "jodoshi-nari": "判別のポイント", "jodoshi-zu": "接続と活用",
}
REF3 = {
    "jodoshi-nu": "打消「ぬ」との識別", "jodoshi-zu": "重要な識別",
    "jodoshi-nari": "判別のポイント", "jodoshi-ru": "接続と活用",
    "jodoshi-ri": "接続と活用", "jodoshi-su": "意味の判別", "jodoshi-tari": "意味の判別",
}

# Lv3: 同形の正体識別（surface ごとの選択肢と、(topic,meaning)→正解ラベル）
IDENTITY = {
    "に": {
        "choices": ["完了「ぬ」の連用形", "断定「なり」の連用形", "格助詞", "接続助詞"],
        "answer": {("jodoshi-nu", "完了"): "完了「ぬ」の連用形", ("jodoshi-nu", "強意"): "完了「ぬ」の連用形",
                   ("jodoshi-nari", "断定"): "断定「なり」の連用形", ("jodoshi-nari", "存在"): "断定「なり」の連用形"},
    },
    "ぬ": {
        "choices": ["完了「ぬ」", "打消「ず」の連体形", "ナ変動詞の語尾", "強意"],
        "answer": {("jodoshi-nu", "完了"): "完了「ぬ」", ("jodoshi-zu", "打消"): "打消「ず」の連体形"},
    },
    "ね": {
        "choices": ["完了「ぬ」の命令形", "打消「ず」の已然形", "ナ変動詞の語尾", "願望の終助詞"],
        "answer": {("jodoshi-nu", "完了"): "完了「ぬ」の命令形", ("jodoshi-zu", "打消"): "打消「ず」の已然形"},
    },
    "る": {
        "choices": ["完了・存続「り」の連体形", "受身・尊敬など「る」", "動詞の一部", "可能のみ"],
        "answer": {("jodoshi-ri", "完了"): "完了・存続「り」の連体形", ("jodoshi-ri", "存続"): "完了・存続「り」の連体形",
                   ("jodoshi-ru", "受身"): "受身・尊敬など「る」", ("jodoshi-ru", "尊敬"): "受身・尊敬など「る」",
                   ("jodoshi-ru", "自発"): "受身・尊敬など「る」", ("jodoshi-ru", "可能"): "受身・尊敬など「る」"},
    },
    "れ": {
        "choices": ["完了・存続「り」の已然形", "受身・尊敬など「る」の連用形", "動詞の一部", "命令の終助詞"],
        "answer": {("jodoshi-ri", "完了"): "完了・存続「り」の已然形", ("jodoshi-ri", "存続"): "完了・存続「り」の已然形",
                   ("jodoshi-ru", "受身"): "受身・尊敬など「る」の連用形", ("jodoshi-ru", "尊敬"): "受身・尊敬など「る」の連用形",
                   ("jodoshi-ru", "自発"): "受身・尊敬など「る」の連用形", ("jodoshi-ru", "可能"): "受身・尊敬など「る」の連用形"},
    },
    "なり": {
        "choices": ["断定「なり」", "伝聞推定「なり」", "ナリ活用の語尾", "動詞「成る」"],
        "answer": {("jodoshi-nari", "断定"): "断定「なり」", ("jodoshi-nari", "伝聞推定"): "伝聞推定「なり」",
                   ("jodoshi-nari", "伝聞"): "伝聞推定「なり」", ("jodoshi-nari", "推定"): "伝聞推定「なり」"},
    },
    "せ": {
        "choices": ["使役「す」", "尊敬「す」", "過去「き」の未然形", "サ変動詞"],
        "answer": {("jodoshi-su", "使役"): "使役「す」", ("jodoshi-su", "尊敬"): "尊敬「す」"},
    },
}

def clip(sent, start, end, window=24, maxlen=MAX_SENT):
    """トークンを【 】で強調し、長文はトークン周辺を切り出す"""
    marked = sent[:start] + "【" + sent[start:end] + "】" + sent[end:]
    if len(marked) <= maxlen + 2:
        return marked
    s = max(0, start - window)
    e = min(len(sent), end + window)
    out = ("…" if s > 0 else "") + sent[s:start] + "【" + sent[start:end] + "】" + sent[end:e] + ("…" if e < len(sent) else "")
    return out

def trans_clip(t, n=42):
    t = (t or "").strip()
    return t if len(t) <= n else t[:n] + "…"

# ---- 収集 ----
instances = collections.defaultdict(list)  # topic -> [inst]
for f in sorted(glob.glob("public/texts-v3/*.json")):
    try:
        d = json.load(open(f, encoding="utf-8"))
        if not isinstance(d, dict): continue
    except Exception:
        continue
    title = d.get("title", "")
    if title in TITLE_BAN: continue
    # 同じ訳文が複数の文で共有されている教材＝訳が文単位でない（段落訳・冒頭訳の繰り返し）。
    # その訳は文と対応しないので解説に載せない。
    trans_count = collections.Counter()
    for sen in d.get("sentences") or []:
        if isinstance(sen, dict):
            t = (sen.get("modernTranslation") or "").strip()
            if t: trans_count[t] += 1
    for si, sen in enumerate(d.get("sentences") or []):
        if not isinstance(sen, dict): continue
        sent = sen.get("originalText") or ""
        trans = (sen.get("modernTranslation") or "").strip()
        if not sentence_ok(sent, trans): continue
        if trans_count[trans] >= 2:
            trans = ""
        toks = [tk for tk in (sen.get("tokens") or []) if isinstance(tk, dict)]
        naux = sum(1 for tk in toks if isinstance(tk.get("grammarTag"), dict) and tk["grammarTag"].get("pos") == "助動詞")
        PUNCT = set("、。「」『』・！？　")
        words = [t for t in toks if t.get("text") and t["text"] not in PUNCT and t.get("start") is not None]
        for ti, tk in enumerate(toks):
            g = tk.get("grammarTag") or {}
            if not (isinstance(g, dict) and g.get("pos") == "助動詞"): continue
            s, m, c = tk.get("text", ""), g.get("meaning", ""), g.get("conjugationForm", "")
            t = topic_for(s, m)
            if not t or not sent or tk.get("start") is None: continue
            # 呼応ハイライト用: 直前語・直後の助動詞・直後の語
            wi = next((i for i, w in enumerate(words) if w is tk), None)
            prev_sp = nexttok_sp = nextaux_sp = None
            nextaux_info = ("", "")
            if wi is not None:
                if wi > 0:
                    pw = words[wi - 1]; prev_sp = (pw["start"], pw["end"])
                if wi + 1 < len(words):
                    nw = words[wi + 1]; nexttok_sp = (nw["start"], nw["end"])
                for w in words[wi + 1:]:
                    gg = w.get("grammarTag") or {}
                    if isinstance(gg, dict) and gg.get("pos") == "助動詞":
                        nextaux_sp = (w["start"], w["end"]); nextaux_info = (w.get("text", ""), gg.get("meaning", ""))
                        break
            instances[t].append({
                "prev": prev_sp, "nextaux": nextaux_sp, "nextaux_text": nextaux_info[0],
                "nextaux_meaning": nextaux_info[1], "nexttok": nexttok_sp,
                "surface": s, "meaning": m, "form": c, "title": title, "sent": sent,
                "tstart": tk["start"], "tend": tk["end"],
                "ctx": clip(sent, tk["start"], tk["end"]),
                "ctx_wide": clip(sent, tk["start"], tk["end"], window=46, maxlen=100),
                "ctx_full": sent[:tk["start"]] + "【" + sent[tk["start"]:tk["end"]] + "】" + sent[tk["end"]:],
                "trans": trans_clip(trans, 50), "trans_l": trans_clip(trans, 110), "sentlen": len(sent), "naux": naux,
            })

def mark(sent, tspan, cue=None):
    """対象語を【 】、呼応の手がかりを《 》で囲んで全文を返す"""
    spans = [(tspan[0], tspan[1], "【", "】")]
    if cue and not (cue[0] < tspan[1] and tspan[0] < cue[1]):  # 重なりは無視
        spans.append((cue[0], cue[1], "《", "》"))
    out = sent
    for s0, e0, a, b in sorted(spans, key=lambda x: -x[0]):
        out = out[:s0] + a + out[s0:e0] + b + out[e0:]
    return out

SUIRYO_AUX = ("べ", "む", "ん", "まし", "らむ", "けむ", "じ", "まじ")
NEG_AUX = ("ず", "じ", "まじ", "ね", "ざ")

def cue_for(topic, inst):
    """(topic, meaning) から呼応先スパンを返す。無ければ None"""
    m = inst["meaning"]
    if m == "強意" and inst["nextaux"] and inst["nextaux_text"].startswith(SUIRYO_AUX):
        return inst["nextaux"]
    if m == "完了" and inst["nextaux"] and inst["nextaux_text"] and (
        inst["nextaux_text"][0] in "きけたし" and inst["nextaux_meaning"] in ("過去", "詠嘆", "完了", "存続")
    ) and inst["surface"] in ("に", "て"):
        return inst["nextaux"]
    if m == "可能" and inst["nextaux"] and inst["nextaux_text"].startswith(NEG_AUX):
        return inst["nextaux"]
    if m == "尊敬":
        mt = re.search(r"(たまは|たまひ|たまふ|たまへ|給は|給ひ|給ふ|給へ|おはしま)", inst["sent"][inst["tend"]:inst["tend"] + 8])
        if mt:
            return (inst["tend"] + mt.start(), inst["tend"] + mt.end())
    if m == "自発" and inst["prev"]:
        return inst["prev"]
    if m == "婉曲" and inst["nexttok"]:
        return inst["nexttok"]
    if m == "打消" and inst["prev"]:
        return inst["prev"]
    return None

def cue_identity(topic, inst):
    """正体識別問題の手がかり: 原則直前の語（接続）。に＋き/けり等は後続も優先"""
    if inst["surface"] in ("に", "て") and inst["nextaux"] and inst["nextaux_text"] and inst["nextaux_text"][0] in "きけたし":
        return inst["nextaux"]
    if inst["surface"] == "に":
        mt = re.search(r"(あら|あり|ある|あれ|はべ|侍|候|さぶら)", inst["sent"][inst["tend"]:inst["tend"] + 6])
        if mt:
            return (inst["tend"] + mt.start(), inst["tend"] + mt.end())
    return inst["prev"]

def cite(inst, long=False):
    """解説末尾の出典表記。訳が信頼できない教材では訳を載せない"""
    t = inst["trans_l"] if long else inst["trans"]
    if t:
        return f"訳:「{t}」（{inst['title']}）"
    return f"（{inst['title']}）"

# ---- 生成 ----
drills = []
report = []
for topic in sorted(instances):
    pool = instances[topic]
    # 短い文優先・(surface,meaning)ごとに上限・同一文脈の重複排除
    pool.sort(key=lambda x: x["sentlen"])
    used_ctx, used_sm = set(), collections.Counter()

    # Lv2: 意味判別（zu は活用形）
    lv2 = []
    lv2_sent = set()
    for inst in pool:
        if len(lv2) >= MAX_LV2_PER_TOPIC: break
        key = (inst["surface"], inst["meaning"])
        if not inst["trans"] or inst["ctx"] in used_ctx or used_sm[key] >= MAX_PER_SURFACE_MEANING: continue
        if inst["sentlen"] > (70 if topic == "jodoshi-zu" else MAX_SENT): continue  # 全文が見える文のみ
        if inst["sent"] in lv2_sent: continue
        if topic == "jodoshi-zu":
            if inst["form"] not in FORM_NAME: continue
            ans = FORM_NAME[inst["form"]]
            choices = [ans] + [v for v in ["未然形", "連用形", "終止形", "連体形", "已然形"] if v != ans][:3]
            q = {"kind": "katsuyo-fill",
                 "prompt": f"この「{inst['surface']}」は打消「ず」の何形？",
                 "answer": ans, "choices": choices,
                 "explanation": f"打消「ず」（ず・ず・ず・ぬ・ね／ザリ活用）。{cite(inst)}"}
        else:
            ans = inst["meaning"]
            base = MEANING_CHOICES[topic]
            if ans not in base: continue
            choices = [ans] + [v for v in base if v != ans][:3]
            hint = HINT.get((topic, ans), "文脈と訳から判断。")
            q = {"kind": "imi",
                 "prompt": f"この文の「{inst['surface']}」の意味は？",
                 "answer": ans, "choices": choices,
                 "explanation": f"{hint}{cite(inst)}"}
        used_ctx.add(inst["ctx"]); used_sm[key] += 1; lv2_sent.add(inst["sent"])
        lv2.append((q, inst))

    # Lv3: 同形の正体識別
    lv3 = []
    used_sm3 = collections.Counter()
    for inst in pool:
        if len(lv3) >= MAX_LV3_PER_TOPIC: break
        if inst["sentlen"] > 70: continue
        ident = IDENTITY.get(inst["surface"])
        if not ident: continue
        ans = ident["answer"].get((topic, inst["meaning"]))
        if not ans: continue
        key = (inst["surface"], inst["meaning"])
        if inst["ctx"] in used_ctx or used_sm3[key] >= MAX_PER_SURFACE_MEANING: continue
        q = {"kind": "shikibetsu",
             "prompt": f"この「{inst['surface']}」の正体は？",
             "answer": ans, "choices": list(ident["choices"]),
             "explanation": f"{HINT.get((topic, inst['meaning']), '')}{cite(inst)}"}
        used_ctx.add(inst["ctx"]); used_sm3[key] += 1
        lv3.append((q, inst))

    for i, (q, inst) in enumerate(lv2, 1):
        ctx_marked = mark(inst["sent"], (inst["tstart"], inst["tend"]), cue_for(topic, inst))
        drills.append({"id": f"{topic}-c{i:02}", "topic_id": topic, "kind": q["kind"],
                       "prompt": q["prompt"], "context": ctx_marked, "choices": q["choices"],
                       "answer": q["answer"], "explanation": q["explanation"],
                       "ref_heading": REF2.get(topic), "sort": 100 + i})
    for i, (q, inst) in enumerate(lv3, 1):
        ctx_marked = mark(inst["sent"], (inst["tstart"], inst["tend"]), cue_identity(topic, inst))
        drills.append({"id": f"{topic}-x{i:02}", "topic_id": topic, "kind": q["kind"],
                       "prompt": q["prompt"], "context": ctx_marked, "choices": q["choices"],
                       "answer": q["answer"], "explanation": q["explanation"],
                       "ref_heading": REF3.get(topic, REF2.get(topic)), "sort": 200 + i})

    # Lv4: 文脈総合（長文 or 助動詞が3つ以上の密な文。広いウィンドウで出題）
    lv4 = []
    used_sm4 = collections.Counter()
    used_sent = set(i["sent"] for _, i in lv2) | set(i["sent"] for _, i in lv3)
    for inst in sorted(pool, key=lambda x: -x["naux"]):
        if len(lv4) >= MAX_LV4_PER_TOPIC: break
        if not (55 <= inst["sentlen"] <= 160 or (inst["naux"] >= 3 and inst["sentlen"] <= 160)): continue
        if inst["sent"] in used_sent: continue
        key = (inst["surface"], inst["meaning"])
        if inst["ctx_wide"] in used_ctx or inst["ctx"] in used_ctx or used_sm4[key] >= MAX_PER_SURFACE_MEANING: continue
        if topic == "jodoshi-zu":
            if inst["form"] not in FORM_NAME: continue
            ans = FORM_NAME[inst["form"]]
            choices = [ans] + [v for v in ["未然形", "連用形", "終止形", "連体形", "已然形"] if v != ans][:3]
            q = {"kind": "katsuyo-fill", "prompt": f"この「{inst['surface']}」は打消「ず」の何形？",
                 "answer": ans, "choices": choices,
                 "explanation": f"打消「ず」（ず・ず・ず・ぬ・ね／ザリ活用）。{cite(inst, long=True)}"}
        else:
            ans = inst["meaning"]
            base = MEANING_CHOICES[topic]
            if ans not in base: continue
            choices = [ans] + [v for v in base if v != ans][:3]
            hint = HINT.get((topic, ans), "文脈と訳から判断。")
            q = {"kind": "imi", "prompt": f"この文の「{inst['surface']}」の意味は？",
                 "answer": ans, "choices": choices,
                 "explanation": f"{hint}{cite(inst, long=True)}"}
        used_ctx.add(inst["ctx_wide"]); used_sm4[key] += 1; used_sent.add(inst["sent"])
        lv4.append((q, inst))
    for i, (q, inst) in enumerate(lv4, 1):
        ctx_marked = mark(inst["sent"], (inst["tstart"], inst["tend"]), cue_for(topic, inst))
        drills.append({"id": f"{topic}-d{i:02}", "topic_id": topic, "kind": q["kind"],
                       "prompt": q["prompt"], "context": ctx_marked, "choices": q["choices"],
                       "answer": q["answer"], "explanation": q["explanation"],
                       "ref_heading": REF2.get(topic), "sort": 300 + i})
    report.append(f"{topic}: 候補{len(pool)} → Lv2={len(lv2)} Lv3={len(lv3)} Lv4={len(lv4)}")

# 識別クラスターの Lv4（教材実文での正体判別。単元横断なのでヒントが消える）
CLUSTER = {"に": "shikibetsu-ni", "ぬ": "shikibetsu-nu-ne", "ね": "shikibetsu-nu-ne",
           "る": "shikibetsu-ru-re", "れ": "shikibetsu-ru-re", "なり": "shikibetsu-nari"}
cl_used = collections.defaultdict(set)
cl_n = collections.Counter()
all_insts = [(t, i) for t in sorted(instances) for i in instances[t]]
all_insts.sort(key=lambda x: x[1]["sentlen"])
for topic, inst in all_insts:
    cl = CLUSTER.get(inst["surface"])
    if not cl: continue
    ident = IDENTITY[inst["surface"]]
    ans = ident["answer"].get((topic, inst["meaning"]))
    if not ans: continue
    if cl_n[cl] >= 8 or inst["sent"] in cl_used[cl] or inst["sentlen"] < 25: continue
    cl_used[cl].add(inst["sent"]); cl_n[cl] += 1
    drills.append({
        "id": f"{cl}-c{cl_n[cl]:02}", "topic_id": cl, "kind": "shikibetsu",
        "prompt": f"この「{inst['surface']}」の正体は？",
        "context": mark(inst["sent"], (inst["tstart"], inst["tend"]), cue_identity(topic, inst)),
        "choices": list(ident["choices"]), "answer": ans,
        "explanation": f"{HINT.get((topic, inst['meaning']), '')}{cite(inst, long=True)}",
        "ref_heading": "判別の手順", "sort": 300 + cl_n[cl],
    })
report.append("clusters Lv4: " + ", ".join(f"{k}={v}" for k, v in sorted(cl_n.items())))

out = "supabase/seeds/grammar-corpus-lv23.json"
json.dump(drills, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n".join(report))
print(f"\n計 {len(drills)} 問 → {out}")
print("\n--- サンプル ---")
for d in random.sample(drills, min(6, len(drills))):
    print(f"[{d['id']}] {d['context']}")
    print(f"  Q: {d['prompt']} → {d['answer']}")
    print(f"  解説: {d['explanation'][:80]}")
