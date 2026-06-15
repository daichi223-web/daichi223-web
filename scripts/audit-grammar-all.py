# -*- coding: utf-8 -*-
"""
文法道場ドリル 総合QA監査。すべての seed を横断し、構造・整合・要再検討点を洗う。
出力: scripts/audit-report.txt（標準出力は集計のみ）。
"""
import json, glob, re
from collections import defaultdict, Counter

REQUIRED = ["id","topic_id","kind","prompt","choices","answer","explanation"]
KATSUYO = {"未然形","連用形","終止形","連体形","已然形","命令形"}

def is_drill(x):
    return isinstance(x,dict) and x.get("topic_id") and "choices" in x and "answer" in x

def main():
    files=sorted(glob.glob("supabase/seeds/*.json"))
    items=[]
    for f in files:
        try: d=json.load(open(f,encoding="utf-8"))
        except Exception as e:
            print("PARSE FAIL",f,e); continue
        if isinstance(d,list):
            for x in d:
                if is_drill(x): items.append((f.split("/")[-1],x))

    issues=defaultdict(list)   # type -> [msg]
    seen_ids={}
    for fn,x in items:
        iid=x.get("id")
        # 1 重複 id
        if iid in seen_ids:
            issues["DUP_ID"].append(f"{iid} ({fn} & {seen_ids[iid]})")
        else:
            seen_ids[iid]=fn
        # 2 必須欠落
        miss=[k for k in REQUIRED if x.get(k) is None]
        if miss: issues["MISSING_FIELD"].append(f"{iid}: {miss}")
        ch=x.get("choices") or []
        ans=x.get("answer")
        # 3 選択肢が答を含むか（answer が list の場合は各要素）
        ansset = set(ans) if isinstance(ans,list) else {ans}
        if isinstance(ch,list) and ch:
            if not ansset.issubset(set(ch)):
                issues["ANSWER_NOT_IN_CHOICES"].append(f"{iid}: ans={ans} choices={ch}")
            if len(ch)<2: issues["TOO_FEW_CHOICES"].append(f"{iid}: {ch}")
            if len(ch)!=len(set(ch)): issues["DUP_CHOICE"].append(f"{iid}: {ch}")
        # 4 活用形クイズの答が活用形名か
        if (x.get("kind") or "").startswith("katsuyo-fill") and isinstance(ans,str):
            if ans not in KATSUYO:
                issues["KATSUYO_ANS_ODD"].append(f"{iid}: answer={ans}")
        # 5 マークアップ均衡 【】《》
        ctx=x.get("context") or ""
        if ctx.count("【")!=ctx.count("】") or ctx.count("《")!=ctx.count("》"):
            issues["MARKUP_UNBALANCED"].append(f"{iid}: {ctx[:30]}")
        # 6 説明と答の不整合（完了/強意/打消/受身/可能 等の語が説明冒頭にあるのに答と食い違い）
        exp=x.get("explanation") or ""
        if isinstance(ans,str) and ans and (x.get("kind")=="imi"):
            # 答の語が説明に全く出てこない場合は要確認（弱いシグナル）
            if ans not in exp and len(ans)<=4:
                issues["ANS_NOT_IN_EXPL"].append(f"{iid}: ans={ans}")
        # 7 完了/強意（確述）要再検討： ぬ・つ で 推量語/命令形を伴うのに「完了」
        topic=x.get("topic_id")
        if topic in ("jodoshi-nu","jodoshi-tsu") and ans=="完了":
            # 対象語の直後に推量語が連接する場合のみ確述候補（文中の連用形完了は除外）
            adj = re.search(r"【(ぬ|つ|な|て)】《?(べ|らむ|らん|む|まし)", ctx)
            imper = re.search(r"【(ね|てよ)】", ctx)
            if adj or imper:
                issues["KANYU_KAKUJUTSU_REVIEW"].append(f"{iid}: ctx={ctx[:34]}")

    lines=[]
    total=0
    order=["PARSE FAIL","DUP_ID","MISSING_FIELD","ANSWER_NOT_IN_CHOICES","TOO_FEW_CHOICES",
           "DUP_CHOICE","KATSUYO_ANS_ODD","MARKUP_UNBALANCED","ANS_NOT_IN_EXPL","KANYU_KAKUJUTSU_REVIEW"]
    for t in order:
        msgs=issues.get(t,[])
        if not msgs: continue
        total+=len(msgs)
        lines.append(f"\n## {t}  ({len(msgs)})")
        for m in msgs[:80]: lines.append(f"  - {m}")
    header=f"items={len(items)} 検出={total}"
    open("scripts/audit-report.txt","w",encoding="utf-8").write(header+"\n"+"\n".join(lines))
    print(header)
    for t in order:
        if issues.get(t): print(f"  {t}: {len(issues[t])}")

if __name__=="__main__":
    main()
