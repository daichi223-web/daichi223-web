# -*- coding: utf-8 -*-
"""
助詞（格助詞・係助詞・終助詞）の用法判別と、形容詞の活用判別を教材コーパスから生成。
Lv2/Lv3/Lv4 を文長でグレード（短→中→長）。各レベルのバンクを確保し、
シャッフル出題で「同じ問題しか出ない」を解消する。

出力: supabase/seeds/grammar-joshi-keiyoshi.json （--merge で投入）
"""
import json, glob, collections, io, sys, random

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
random.seed(11)

# 格助詞の用法ラベル（コーパスの meaning → 表示）
KAKU_LABEL = {
    "体修": "連体修飾（〜の）", "主格": "主格（〜が）", "対象": "対象（〜を・に）",
    "引用": "引用（〜と）", "場所": "場所（〜に・で）", "時間": "時間（〜に）",
    "状態": "状態（〜と・に）", "結果": "結果（〜に・と）", "起点": "起点（〜から・より）",
    "比較": "比較（〜より）", "手段": "手段（〜で・して）", "並列": "並列（〜と）",
    "資格": "資格（〜として）", "原因": "原因（〜で・に）",
}
KAKARI_LABEL = {"強意": "強意（訳さない）", "提示": "提示・主題（〜は）", "疑問": "疑問（〜か）",
                "反語": "反語（〜か、いや…ない）", "類似": "類推・添加（〜も）", "並列": "並列（〜も）"}
SHU_LABEL = {"詠嘆": "詠嘆（〜だなあ）", "念押": "念押し（〜よ）", "念押し": "念押し（〜よ）",
             "禁止": "禁止（〜な）", "願望": "願望（〜てほしい）", "希望": "希望（〜たい）",
             "自己願望": "自己願望（〜たい）"}

def mark(sent, ts, te):
    return sent[:ts] + "【" + sent[ts:te] + "】" + sent[te:]

def collect():
    rows = []
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
            trans = (sen.get("modernTranslation") or "").strip()
            if not sent or sent[0] in "」』。、）" or "「」" in sent or "（）" in sent: continue
            if len(trans) < 4: continue
            for tk in sen.get("tokens") or []:
                if not isinstance(tk, dict): continue
                g = tk.get("grammarTag") or {}
                if not isinstance(g, dict): continue
                if tk.get("start") is None: continue
                # トークン位置が原文と一致しないものは除外（空【】防止）
                if sent[tk["start"]:tk["end"]] != tk.get("text",""): continue
                if not tk.get("text"): continue
                rows.append((tk, g, sent, trans, title))
    return rows

rows = collect()
drills = []

def grade(sentlen):
    """文長で Lv2(短)/Lv3(中)/Lv4(長)"""
    if sentlen <= 22: return 2
    if sentlen <= 40: return 3
    return 4

def emit_group(items, topic, kind_label_map, prompt_word, ref, idprefix, surface_filter=None):
    """items: [(tk,g,sent,trans,title)] 用法判別を生成"""
    # surface ごとに実際に出る用法集合（誤答候補に使う）
    surf_usages = collections.defaultdict(set)
    for tk, g, *_ in items:
        m = g.get("meaning", "")
        if m in kind_label_map: surf_usages[tk["text"]].add(m)
    per_lv = collections.Counter()
    per_key = collections.Counter()
    used_sent = set()
    # 短文優先で詰める
    items = sorted(items, key=lambda x: len(x[2]))
    n = collections.Counter()
    for tk, g, sent, trans, title in items:
        m = g.get("meaning", "")
        if m not in kind_label_map: continue
        if len(sent) > 90: continue
        surf = tk["text"]
        if surface_filter and surf not in surface_filter: continue
        key = (surf, m)
        if per_key[key] >= 4: continue
        if sent in used_sent: continue
        lv = grade(len(sent))
        if per_lv[lv] >= 22: continue
        ans = kind_label_map[m]
        # 誤答: 同じ surface の他用法を優先、足りなければ全体から
        others = [kind_label_map[u] for u in surf_usages[surf] if u != m and u in kind_label_map]
        pool = others + [v for v in kind_label_map.values() if v != ans and v not in others]
        # 重複除去
        seen = set(); pool2 = []
        for c in pool:
            if c not in seen and c != ans: seen.add(c); pool2.append(c)
        choices = [ans] + pool2[:3]
        if len(choices) < 3: continue
        per_key[key] += 1; per_lv[lv] += 1; used_sent.add(sent); n[lv] += 1
        sortbase = {2: 100, 3: 200, 4: 300}[lv]
        drills.append({
            "id": f"{topic}-{idprefix}{sortbase + n[lv]:03}", "topic_id": topic, "kind": "shikibetsu",
            "prompt": f"この文の「{surf}」の{prompt_word}は？",
            "context": mark(sent, tk["start"], tk["end"]),
            "choices": choices, "answer": ans,
            "explanation": f"「{surf}」＝{ans}。文脈の意味から判断する。（{title}）" + (f" 訳:「{trans[:48]}」" if trans and len(trans) <= 70 else ""),
            "ref_heading": ref, "sort": sortbase + n[lv],
        })
    return n

# 格助詞 → joshi-kaku
kaku = [(tk, g, s, t, ti) for tk, g, s, t, ti in rows if g.get("pos") == "格助詞"]
emit_group(kaku, "joshi-kaku", KAKU_LABEL, "用法", "一覧", "u")
# 係助詞・副助詞 → joshi-fuku-kakari
kakari = [(tk, g, s, t, ti) for tk, g, s, t, ti in rows if g.get("pos") == "係助詞"]
emit_group(kakari, "joshi-fuku-kakari", KAKARI_LABEL, "意味", "係助詞とは", "u")
# 終助詞 → joshi-shujoshi
shu = [(tk, g, s, t, ti) for tk, g, s, t, ti in rows if g.get("pos") == "終助詞"]
emit_group(shu, "joshi-shujoshi", SHU_LABEL, "意味", "主な終助詞", "u")

# 形容詞 活用の種類(ク/シク)判別 + 活用形 → keiyoshi-katsuyo/ku/shiku
KEIYO_KIND = {"ク": "ク活用", "シク": "シク活用"}
FORM = {"未": "未然形", "用": "連用形", "終": "終止形", "体": "連体形", "已": "已然形", "命": "命令形"}
kei = [(tk, g, s, t, ti) for tk, g, s, t, ti in rows if g.get("pos") == "形容詞"
       and g.get("conjugationType") in KEIYO_KIND and g.get("conjugationForm") in FORM]
per_lv = collections.Counter(); used = set(); n = collections.Counter()
for tk, g, sent, trans, title in sorted(kei, key=lambda x: len(x[2])):
    if len(sent) > 90 or sent in used: continue
    ct = g["conjugationType"]; cf = g["conjugationForm"]; bf = g.get("baseForm", tk["text"])
    lv = grade(len(sent))
    if per_lv[lv] >= 20: continue
    # 種類判別と活用形判別を交互に
    if (n[lv]) % 2 == 0:
        ans = KEIYO_KIND[ct]
        q = {"prompt": f"この「{tk['text']}」（形容詞）の活用の種類は？",
             "choices": [ans] + [v for v in ["ク活用", "シク活用"] if v != ans] + ["ナリ活用", "タリ活用"],
             "answer": ans, "explanation": f"「{bf}」は{ans}。連用形が「〜く」ならク活用、「〜しく」ならシク活用。（{title}）"}
        q["choices"] = q["choices"][:4]
    else:
        ans = FORM[cf]
        q = {"prompt": f"この「{tk['text']}」（形容詞）の活用形は？",
             "choices": [ans] + [v for v in FORM.values() if v != ans][:3],
             "answer": ans, "explanation": f"「{bf}」（{KEIYO_KIND[ct]}）の{ans}。下に続く語から判断する。（{title}）"}
    topic = {"ク": "keiyoshi-ku", "シク": "keiyoshi-shiku"}[ct]
    used.add(sent); per_lv[lv] += 1; n[lv] += 1
    sortbase = {2: 100, 3: 200, 4: 300}[lv]
    drills.append({"id": f"{topic}-k{sortbase + n[lv]:03}", "topic_id": topic, "kind": "katsuyo-type" if (n[lv]) % 2 else "katsuyo-fill",
                   "prompt": q["prompt"], "context": mark(sent, tk["start"], tk["end"]),
                   "choices": q["choices"], "answer": q["answer"], "explanation": q["explanation"],
                   "ref_heading": "活用表", "sort": sortbase + n[lv]})
    # 総論にも一部複製（keiyoshi-katsuyo）
    if random.random() < 0.4 and per_lv[lv] <= 22:
        drills.append({**drills[-1], "id": f"keiyoshi-katsuyo-k{sortbase + n[lv]:03}", "topic_id": "keiyoshi-katsuyo"})

out = "supabase/seeds/grammar-joshi-keiyoshi.json"
json.dump(drills, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
cnt = collections.Counter((d["topic_id"], min(5, d["sort"] // 100 + 1)) for d in drills)
by_topic = collections.defaultdict(dict)
for (t, lv), c in cnt.items(): by_topic[t][lv] = c
for t in sorted(by_topic): print(f"  {t:20} " + " ".join(f"Lv{lv}={by_topic[t].get(lv,0)}" for lv in (2, 3, 4)))
print(f"計 {len(drills)} 問 → {out}")
