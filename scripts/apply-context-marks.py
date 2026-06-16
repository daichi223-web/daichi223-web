# -*- coding: utf-8 -*-
"""
手がかり下線（《》）の追加を seed に適用する。
scripts/_marks.json = { "<drill id>": "<新しい context 文字列>", ... }
context 文字列だけを置き換える（他フィールドは不変）。検証付き。
"""
import json, glob, sys

def main():
    marks = json.load(open("scripts/_marks.json", encoding="utf-8"))
    # 検証: 新context が 【】《》 を含み、マーク除去後が元と一致するか（本文改変防止）
    files = sorted(glob.glob("supabase/seeds/*.json"))
    idx = {}   # id -> (file, i)
    data = {}
    for f in files:
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        if not isinstance(d, list): continue
        data[f] = d
        for i, x in enumerate(d):
            if isinstance(x, dict) and x.get("id"):
                idx[x["id"]] = (f, i)

    def strip(s):
        for ch in "【】《》": s = s.replace(ch, "")
        return s

    applied, errors = 0, []
    for iid, newctx in marks.items():
        if iid not in idx:
            errors.append(f"{iid}: id 不在"); continue
        f, i = idx[iid]
        old = data[f][i].get("context") or ""
        if strip(old) != strip(newctx):
            errors.append(f"{iid}: 本文が変化している（マーク以外を変えるな）"); continue
        if newctx.count("【") != newctx.count("】") or newctx.count("《") != newctx.count("》"):
            errors.append(f"{iid}: 括弧不均衡"); continue
        data[f][i]["context"] = newctx
        applied += 1

    if errors:
        print("x 適用中止。エラー:")
        for e in errors: print("  ", e)
        sys.exit(1)
    for f, d in data.items():
        json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"OK: {applied} 件の context を更新")

if __name__ == "__main__":
    main()
