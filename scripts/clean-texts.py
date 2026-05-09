#!/usr/bin/env python3
"""kobun-tan 読解テキストデータの一括クリーンアップ。

検出 + 自動修正:
  - originalText / modernTranslation / tokens の Markdown wiki-link [[X|Y]]
  - learningPoints の [古文常識] → 【古文常識】, ── → ：

検出のみ (要手動修正):
  - 訳膨張: len(modernTranslation) > 3 * len(originalText) + 30
    かつ 訳が MD ソースの「## 現代語訳」セクションに含まれない (true bug のみ)
  - 文プレフィックス重複: s_{N+1} が s_N の前半を含む
  - originalText に ASCII 英数字記号

Usage:
  python scripts/clean-texts.py            # dry-run (検出のみ)
  python scripts/clean-texts.py --apply    # 実適用
"""
import argparse
import glob
import hashlib
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'texts-v3')
ROOT = os.path.normpath(ROOT)
VAULT = 'F:/A2A/NotebookLM/kokugo-vault/30-教材/古文'


def slugify(stem):
    return hashlib.sha1(stem.encode('utf-8')).hexdigest()[:10]


def build_md_index():
    """slug → MD ファイルパス の辞書を作る (extract-texts.py の slugify と同じハッシュ)。"""
    idx = {}
    if not os.path.isdir(VAULT):
        return idx
    for root, _, files in os.walk(VAULT):
        for f in files:
            if not f.endswith('.md') or f == '_index.md':
                continue
            idx[slugify(f[:-3])] = os.path.join(root, f)
    return idx


def extract_translation_section(md_text):
    m = re.search(r'^##\s+(?:\d+\.\s*)?現代語訳\s*\n(.*?)(?=^## |\Z)', md_text, re.M | re.S)
    return m.group(1).strip() if m else ''


def normalize_ws(s):
    return re.sub(r'\s+', '', s)

MD_LINK = re.compile(r'\[\[([^\[\]|]*\|)?([^\[\]]+)\]\]')


def strip_md(s: str) -> str:
    return MD_LINK.sub(r'\2', s)


def clean_lp(s: str) -> str:
    return s.replace('[古文常識]', '【古文常識】').replace('──', '：')


def fix_file(path: str, apply: bool, md_index: dict):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    title = d.get('title', '?')
    md_count = 0
    lp_count = 0
    issues = []  # 手動レビュー対象

    # MD ソースの現代語訳全文 (false positive 除外用)
    file_id = os.path.basename(path)[:-5]
    md_path = md_index.get(file_id)
    md_yaku_norm = ''
    if md_path:
        try:
            md_text = open(md_path, encoding='utf-8').read()
            md_yaku_norm = normalize_ws(extract_translation_section(md_text))
        except OSError:
            md_yaku_norm = ''

    for s in d.get('sentences', []):
        for k in ('originalText', 'modernTranslation'):
            if k in s and '[[' in s[k]:
                new = strip_md(s[k])
                if new != s[k]:
                    s[k] = new
                    md_count += 1
        for tok in s.get('tokens', []):
            if 'text' in tok and '[[' in tok['text']:
                new = strip_md(tok['text'])
                if new != tok['text']:
                    tok['text'] = new
                    md_count += 1

    lp = d.get('learningPoints', {})
    for entry in lp.get('byLayer', []):
        if 'keyPoint' in entry:
            new = clean_lp(entry['keyPoint'])
            if new != entry['keyPoint']:
                entry['keyPoint'] = new
                lp_count += 1
        for pt in entry.get('points', []):
            if 'text' in pt:
                new = clean_lp(pt['text'])
                if new != pt['text']:
                    pt['text'] = new
                    lp_count += 1
    for i, ov in enumerate(lp.get('overview', [])):
        new = clean_lp(ov)
        if new != ov:
            lp['overview'][i] = new
            lp_count += 1

    sents = d.get('sentences', [])
    for i, s in enumerate(sents):
        o = s.get('originalText', '')
        m = s.get('modernTranslation', '')
        if len(o) > 0 and len(m) > 3 * len(o) + 30:
            # MD ソースに当該訳が存在すれば false positive として扱う
            m_norm = normalize_ws(m)
            if m_norm and md_yaku_norm and m_norm in md_yaku_norm:
                pass  # 正しい訳なので flag しない
            else:
                issues.append(f"訳膨張: {s['id']} ({len(o)}/{len(m)}文字)")
        if i + 1 < len(sents):
            nxt = sents[i + 1].get('originalText', '')
            if len(o) >= 10 and nxt.startswith(o[:min(len(o), 30)]):
                issues.append(f"プレフィックス重複: {s['id']} → {sents[i + 1]['id']}")
        if re.search(r'[A-Za-z0-9\[\]]+', o):
            issues.append(f"originalText に ASCII: {s['id']}")

    changed = md_count > 0 or lp_count > 0
    if changed and apply:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    return title, md_count, lp_count, issues, changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='実際に書き戻す (デフォルトは dry-run)')
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(ROOT, '*.json')))
    paths = [p for p in paths if not p.endswith('index.json')]

    md_index = build_md_index()

    total_changed = 0
    total_md = 0
    total_lp = 0
    total_issues = 0

    for p in paths:
        title, md, lp, issues, changed = fix_file(p, args.apply, md_index)
        if changed or issues:
            print(f'### {title} ({os.path.basename(p)})')
            if md:
                print(f'  ✓ Markdown link 修正: {md}')
            if lp:
                print(f'  ✓ learningPoints 記号置換: {lp}')
            for i in issues:
                print(f'  ⚠ {i}')
        if changed:
            total_changed += 1
        total_md += md
        total_lp += lp
        total_issues += len(issues)

    print(f'\n=== Summary ({"applied" if args.apply else "dry-run"}) ===')
    print(f'修正ファイル: {total_changed}')
    print(f'Markdown link 修正: {total_md}')
    print(f'learningPoints 記号置換: {total_lp}')
    print(f'要手動レビュー: {total_issues}')


if __name__ == '__main__':
    main()
