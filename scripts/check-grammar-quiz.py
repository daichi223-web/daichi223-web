# -*- coding: utf-8 -*-
"""
文法道場クイズ QA チェッカー
活用形クイズ(katsuyo-*)で、係り結びの「手がかり(《》)」と説明が
誤っている問題を検出する。

検出ルール:
  係助詞 ぞ・なむ(なん)・や・か → 結びは【連体形】
  係助詞 こそ                  → 結びは【已然形】
これらが対象語【】より前に在るのに、手がかり《》が係助詞でない
（=後続語に振られている）場合、「下に続く下線の語から判断して」
という説明は誤り。手がかりは係助詞であるべき。

使い方:
  python scripts/check-grammar-quiz.py [file1.json file2.json ...]
  引数なしなら係り結びパターンを使う全シードを走査。
"""
import json, re, sys, glob, os

KAKARI_RENTAI = ["ぞ", "なむ", "なん", "や", "か"]  # → 連体形
KAKARI_IZEN   = ["こそ"]                            # → 已然形

DEFAULT_FILES = [
    "supabase/seeds/grammar-corpus-lv23.json",
    "supabase/seeds/grammar-authored.json",
    "supabase/seeds/grammar-jodoshi-lv5.json",
    "supabase/seeds/grammar-meaning-lv3.json",
    "supabase/seeds/grammar-doushi-types.json",
    "supabase/seeds/grammar-verb-lv4.json",
]

def strip_marks(s):
    return s.replace("【","").replace("】","").replace("《","").replace("》","")

def find_span(ctx, op, cl):
    m = re.search(re.escape(op)+r"(.*?)"+re.escape(cl), ctx)
    if not m: return None, None, None
    return m.group(1), m.start(), m.end()

def analyze_item(item, fname):
    ctx = item.get("context","") or ""
    ans = item.get("answer","") or ""
    exp = item.get("explanation","") or ""
    kind = item.get("kind","") or ""
    if "【" not in ctx:        # 活用形クイズでない
        return None
    target, tpos, _ = find_span(ctx, "【", "】")
    clue,   cpos, _ = find_span(ctx, "《", "》")
    # 対象語より前の本文（マーク除去）
    pre = strip_marks(ctx[:tpos]) if tpos is not None else ""
    issues = []

    def kakari_before(particles):
        hit = [p for p in particles if p in pre]
        return hit

    if ans == "連体形":
        hit = kakari_before(KAKARI_RENTAI)
        # 連体形は「後続の体言・断定なり・接続助詞」でも正当に説明できる。
        # その場合は『下に続く語』の説明でも誤りでない＝係り結び誤りとはしない。
        # 後続語が体言等を正当化しない（句読点始まり・引用「と」・空）場合のみ係り結び誤りと判定。
        c = (clue or "").strip()
        non_justifying = (c == "" or c[0] in "、。「」（）" or c.startswith("と") or c.startswith("また"))
        if hit and non_justifying and (clue is None or all(p not in clue for p in hit)):
            issues.append({
                "type":"KAKARI_RENTAI_MISLABEL",
                "detail":f"対象語より前に疑問・係助詞「{'/'.join(hit)}」系があり連体形（係り結び）。"
                         f"手がかりは係助詞であるべきだが後続語《{clue}》に振られている。",
            })
    if ans == "已然形":
        hit = kakari_before(KAKARI_IZEN)
        # 已然形+ば/ど/ども（順接/逆接）は後続語が正しい手がかり
        follows_ba = bool(clue) and clue.strip().startswith(("ば","ど","ども"))
        if hit and not follows_ba and (clue is None or all(p not in clue for p in hit)):
            issues.append({
                "type":"KAKARI_IZEN_MISLABEL",
                "detail":f"係助詞「{'/'.join(hit)}」の係り結びで已然形。"
                         f"手がかりは「こそ」であるべきだが《{clue}》に振られている。",
            })

    # 説明文の機械的な定型が係り結びに対して誤り
    if issues and "下に続く下線の語" in exp:
        issues.append({
            "type":"EXPLANATION_WRONG",
            "detail":"説明「下に続く下線の語から判断して」は係り結びには不適切（語は前の係助詞で決まる）。",
        })

    if not issues:
        return None
    return {
        "file":os.path.basename(fname),
        "id":item.get("id"),
        "topic_id":item.get("topic_id"),
        "prompt":item.get("prompt"),
        "context":ctx,
        "answer":ans,
        "explanation":exp,
        "target":target,
        "clue":clue,
        "issues":issues,
    }

def main():
    files = sys.argv[1:] or DEFAULT_FILES
    flagged = []
    scanned = 0
    for f in files:
        if not os.path.exists(f):
            continue
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print(f"!! skip {f}: {e}")
            continue
        if not isinstance(data, list):
            continue
        for it in data:
            if not isinstance(it, dict): continue
            scanned += 1
            r = analyze_item(it, f)
            if r: flagged.append(r)
    out = {"scanned":scanned, "flagged_count":len(flagged), "items":flagged}
    with open("scripts/grammar-quiz-report.json","w",encoding="utf-8") as w:
        json.dump(out, w, ensure_ascii=False, indent=2)
    print(f"scanned={scanned} flagged={len(flagged)} -> scripts/grammar-quiz-report.json")
    for r in flagged:
        print(f"  [{r['file']}] {r['id']} ans={r['answer']} clue=《{r['clue']}》 :: {r['context'][:50]}")

if __name__=="__main__":
    main()
