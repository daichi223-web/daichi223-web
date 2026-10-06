# -*- coding: utf-8 -*-
"""
apply-excel-fixes.py — 修正一覧 (fixes.json) を、単語データの正本 Excel の「複製」に当てる。

用途
  正本 Excel（F:\\古文単語テストリスト (回復済み).xlsx）の「リスト(n)」などのセルを、
  一覧に書いた before → after のとおりに直したファイルを別名で作る。
  手順の全体はスキル kobun-vocab-data-fix（F:\\knowledge\\skills\\kobun-vocab-data-fix\\SKILL.md）。

使い方
  python -X utf8 scripts/apply-excel-fixes.py --fixes fixes.json --in 入力.xlsx --out 出力.xlsx
         [--levels 確定,推定] [--include-cells K574,L574] [--overwrite]

  - 入力は読むだけ。出力は別パス（入力と同じパスは拒否。既にある出力は --overwrite が無ければ拒否）。
  - --levels に入る level の行と、--include-cells に挙げたセルの行だけを当てる（既定は 確定 のみ）。
  - 標準出力に1行の JSON（当てた件数と内訳、書き換えた zip 部品）を出す。

fixes.json の形（配列。1要素 = 1セル）
  {"sheet": "リスト(n)", "cell": "C418", "before": "もつなす", "after": "もてなす",
   "level": "確定", "qid": "192-1", "basis": "根拠（辞書・出典）",
   "copy_from": "K573"   # 任意。同じシートの別セルの値をそのまま移す（玉突きの戻し）。after はその値と一致させる
  }
  - after が "" ならセルを空にする。
  - row / col / lemma / cat などほかのキーは記録用で、スクリプトは見ない。

しくみ（xml 方式）
  xlsx(zip) の中の対象シートの XML と xl/sharedStrings.xml だけを書き換え、ほかの部品は
  バイト列のまま写す。数式のキャッシュ値・印刷設定・ほかのシートは変わらない。
  書く前に全件の「今の値」が before と一致することを確かめ、1件でも違えば何も書かずに止まる。
  変わる範囲が1つの書式の塊 (<t>) に収まるときは、その塊の書式を残して文字だけ差し替える。

注意
  - openpyxl で読み書きする方式は持たない。2026-10-05 の試験で、openpyxl で保存すると
    狙っていないほかのシートの524セルと印刷設定が変わった。正本には使わない。
  - 数式セル・数値セル・まだ無いセル（新規作成）は扱わない（止まる）。
  - 正本そのものを --out にしない。複製に当て、scripts/compare-xlsx.py で全セル比較してから、
    承認を得て正本を置き換える。
"""
import argparse
import html
import json
import os
import re
import sys
import zipfile


def load_fixes(path, levels, include_cells):
    fixes = json.load(open(path, encoding="utf-8"))
    sel = [f for f in fixes if f.get("level") in levels or f["cell"] in include_cells]
    seen = set()
    for f in sel:
        for k in ("sheet", "cell", "before", "after"):
            if k not in f:
                sys.exit("STOP: 一覧の行に %s が無い: %r" % (k, f))
        key = (f["sheet"], f["cell"])
        if key in seen:
            sys.exit("STOP: 同じセルへの修正が重複: %s" % (key,))
        seen.add(key)
    return sel


def diff_region(before, after):
    """before と after の共通の頭と尻を除いた、変わる範囲 [a, b) と差し込む文字列"""
    p = 0
    while p < min(len(before), len(after)) and before[p] == after[p]:
        p += 1
    s = 0
    while s < min(len(before), len(after)) - p and before[len(before) - 1 - s] == after[len(after) - 1 - s]:
        s += 1
    return p, len(before) - s, after[p:len(after) - s]


SI_RE = re.compile(r"<si>.*?</si>|<si/>", re.S)
T_RE = re.compile(r"(<t(?:\s[^>]*)?>)(.*?)(</t>)|<t(?:\s[^>]*)?/>", re.S)
RPH_RE = re.compile(r"<rPh\b.*?</rPh>|<phoneticPr\b[^>]*/>", re.S)


def si_text(si):
    body = RPH_RE.sub("", si)
    return "".join(html.unescape(m.group(2)) if m.group(2) is not None else "" for m in T_RE.finditer(body))


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def si_edit(si, before, after):
    """変わる範囲が1つの <t> に収まるときは、その <t> の中身だけ差し替える。だめなら None"""
    if RPH_RE.search(si):
        return None
    a, b, mid = diff_region(before, after)
    pos = 0
    out = []
    last = 0
    done = False
    ms = [m for m in T_RE.finditer(si)]
    for i, m in enumerate(ms):
        t = html.unescape(m.group(2)) if m.group(2) is not None else ""
        lo, hi = pos, pos + len(t)
        if not done and m.group(2) is not None and lo <= a and b <= hi and (a < hi or i == len(ms) - 1):
            nt = t[:a - lo] + mid + t[b - lo:]
            out.append(si[last:m.start()] + '<t xml:space="preserve">' + esc(nt) + "</t>")
            last = m.end()
            done = True
        pos = hi
    if not done:
        return None
    new = "".join(out) + si[last:]
    return new if si_text(new) == after else None


def run_xml(fixes, src, dst):
    zin = zipfile.ZipFile(src)
    wbx = zin.read("xl/workbook.xml").decode("utf-8")
    rels = zin.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    sheets = {}
    for m in re.finditer(r"<sheet\b[^>]*>", wbx):
        tag = m.group(0)
        name = html.unescape(re.search(r'name="([^"]*)"', tag).group(1))
        rid = re.search(r'r:id="([^"]*)"', tag).group(1)
        for rm in re.finditer(r"<Relationship\b[^>]*>", rels):
            if re.search(r'Id="%s"' % re.escape(rid), rm.group(0)):
                target = re.search(r'Target="([^"]*)"', rm.group(0)).group(1)
                sheets[name] = target.lstrip("/") if target.startswith("/") else "xl/" + target
    ss = zin.read("xl/sharedStrings.xml").decode("utf-8")
    head_end = ss.index(">", ss.index("<sst")) + 1
    sst_head, sst_body = ss[:head_end], ss[head_end:ss.rindex("</sst>")]
    sis = SI_RE.findall(sst_body)
    if "".join(sis) != sst_body:
        sys.exit("STOP: sharedStrings.xml を <si> の並びとして読み切れない")
    n_orig = len(sis)
    by_sheet = {}
    for f in fixes:
        if f["sheet"] not in sheets:
            sys.exit("STOP: シート %r が無い（あるのは %s）" % (f["sheet"], sorted(sheets)))
        by_sheet.setdefault(f["sheet"], []).append(f)
    new_parts = {}
    stats = {"copied_index": 0, "edited_in_run": 0, "plain": 0, "cleared": 0, "new_si": 0}
    for sname, fs in by_sheet.items():
        part = sheets[sname]
        x = zin.read(part).decode("utf-8")

        def find_cell(ref):
            return re.search(r'<c r="%s"(?:\s[^>]*?)?(?:/>|>.*?</c>)' % ref, x, re.S)

        def cell_state(ref):
            m = find_cell(ref)
            if not m:
                return None, None, ""
            tag = m.group(0)
            t = re.search(r'^<c\b[^>]*\bt="([^"]*)"', tag)
            v = re.search(r"<v>(.*?)</v>", tag, re.S)
            if "<f" in tag:
                sys.exit("STOP: %s!%s は数式セル" % (sname, ref))
            if v is None:
                return m, None, ""
            if t and t.group(1) == "s":
                return m, int(v.group(1)), si_text(sis[int(v.group(1))])
            sys.exit("STOP: %s!%s は共有文字列でない型 (%s)" % (sname, ref, t.group(1) if t else "n"))

        plan = []
        for f in fs:  # 1) 全件の照合（ここで1件でも違えば、何も書かずに止まる）
            m, idx, cur = cell_state(f["cell"])
            if cur != f["before"]:
                sys.exit("STOP: %s!%s の今の値が一覧と違う\n  一覧: %r\n  実際: %r" % (sname, f["cell"], f["before"], cur))
            src_idx = None
            if f.get("copy_from") and f["after"] != "":
                _, src_idx, src_text = cell_state(f["copy_from"])
                if src_text != f["after"]:
                    sys.exit("STOP: %s!%s の値が after と違う" % (sname, f["copy_from"]))
            plan.append((f, idx, src_idx))
        edits = []
        for f, idx, src_idx in plan:  # 2) 新しい値の決定
            m = find_cell(f["cell"])
            if m is None:
                sys.exit("STOP: %s!%s のセル要素が無い（新規作成は未対応）" % (sname, f["cell"]))
            if f["after"] == "":
                new_v = None
                stats["cleared"] += 1
            elif src_idx is not None:
                new_v = src_idx
                stats["copied_index"] += 1
            else:
                new_si = si_edit(sis[idx], f["before"], f["after"]) if idx is not None else None
                if new_si is not None:
                    stats["edited_in_run"] += 1
                else:
                    new_si = '<si><t xml:space="preserve">' + esc(f["after"]) + "</t></si>"
                    stats["plain"] += 1
                sis.append(new_si)
                stats["new_si"] += 1
                new_v = len(sis) - 1
            tag = m.group(0)
            open_tag = re.match(r"<c\b[^>]*?(/?)>", tag).group(0)
            attrs = re.sub(r'\s+t="[^"]*"', "", open_tag.rstrip("/>").rstrip(">"))
            new_tag = attrs + "/>" if new_v is None else attrs + ' t="s"><v>%d</v></c>' % new_v
            edits.append((m.start(), m.end(), new_tag))
        for s, e, nt in sorted(edits, reverse=True):
            x = x[:s] + nt + x[e:]
        new_parts[part] = x.encode("utf-8")
    added = len(sis) - n_orig
    if added:
        def bump(m):
            return '%s="%d"' % (m.group(1), int(m.group(2)) + added)
        sst_head2 = re.sub(r'\b(uniqueCount)="(\d+)"', bump, sst_head)
        sst_head2 = re.sub(r'\b(count)="(\d+)"', bump, sst_head2)
        new_parts["xl/sharedStrings.xml"] = (sst_head2 + "".join(sis) + "</sst>").encode("utf-8")
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = new_parts.get(info.filename)
            if data is None:
                data = zin.read(info.filename)
            ni = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            ni.compress_type = zipfile.ZIP_DEFLATED
            ni.external_attr = info.external_attr
            zout.writestr(ni, data)
    stats["changed_parts"] = sorted(new_parts)
    return stats


def main():
    ap = argparse.ArgumentParser(description="修正一覧を Excel の複製に当てる（xml 方式・before 照合つき）")
    ap.add_argument("--fixes", required=True, help="修正一覧 JSON")
    ap.add_argument("--in", dest="src", required=True, help="入力 xlsx（読むだけ）")
    ap.add_argument("--out", dest="dst", required=True, help="出力 xlsx（入力と別のパス）")
    ap.add_argument("--levels", default="確定", help="当てる level をカンマ区切りで（既定: 確定）")
    ap.add_argument("--include-cells", default="", help="level に関係なく当てるセル（例 K574,L574）")
    ap.add_argument("--engine", default="xml", choices=["xml"], help="xml 方式だけ（openpyxl は他シートを壊すので持たない）")
    ap.add_argument("--overwrite", action="store_true", help="既にある出力を上書きしてよい")
    a = ap.parse_args()
    if os.path.abspath(a.src) == os.path.abspath(a.dst):
        sys.exit("STOP: 入力と出力が同じパス。別名で出すこと")
    if os.path.exists(a.dst) and not a.overwrite:
        sys.exit("STOP: 出力が既にある: %s（上書きするなら --overwrite）" % a.dst)
    fixes = load_fixes(a.fixes, set(a.levels.split(",")), set(filter(None, a.include_cells.split(","))))
    if not fixes:
        sys.exit("STOP: 当てる行が0件（--levels / --include-cells を確かめる）")
    stats = run_xml(fixes, a.src, a.dst)
    print(json.dumps({"engine": "xml", "applied": len(fixes), "stats": stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
