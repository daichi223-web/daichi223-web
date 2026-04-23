"""Match kobun_q.jsonl lemmas against vocab DB markdown filenames."""
import json
import re
import sys
from pathlib import Path

# Ensure UTF-8 stdout on Windows
sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
VAULT = Path('F:/A2A/NotebookLM/kokugo-vault/20-文法/語彙DB')
INBOX = Path('F:/A2A/NotebookLM/kokugo-vault/00-inbox/AI生成語彙')
CATS = ["重要動詞", "重要形容詞", "重要名詞", "重要副詞", "多義語",
        "現古異義語", "敬語動詞", "助動詞判別", "接尾辞", "接頭辞"]


def norm_tilde(s):
    return s.replace('〜', '～')


def load_q_lemmas():
    lemmas = set()
    with open(ROOT / 'data/kobun_q.jsonl.txt', encoding='utf-8') as f:
        for line in f:
            obj = json.loads(line)
            lemmas.add(obj['lemma'])
    return lemmas


def load_md_stems():
    stems = set()
    # Original vault categories
    for c in CATS:
        d = VAULT / c
        if not d.exists():
            continue
        for p in d.glob('*.md'):
            if p.stem != '_index':
                stems.add(norm_tilde(p.stem))
    # AI-generated inbox
    if INBOX.exists():
        for p in INBOX.glob('*.md'):
            if p.stem != '_index':
                stems.add(norm_tilde(p.stem))
    return stems


def norm(s):
    s = re.sub(r'^[～〜]', '', s)
    s = re.sub(r'なり$', '', s)
    return s


# Known typo corrections: map original (possibly misspelled) lemma → corrected filename
TYPO_ALIASES = {
    'もつなす': 'もてなす',
    'ものもおもぼえず': 'ものもおぼえず',
    'らうなげなり': 'らうたげなり',
}


def variants(s):
    res = {s, norm(s)}
    if '・' in s:
        for part in s.split('・'):
            res.add(part)
            res.add(norm(part))
    if s in TYPO_ALIASES:
        res.add(TYPO_ALIASES[s])
    return res


def main():
    lemmas_q = load_q_lemmas()
    md_stems = load_md_stems()
    md_norm_map = {norm(m): m for m in md_stems}

    # Apply tilde normalization to quiz lemmas too
    lemmas_q_norm = {norm_tilde(l) for l in lemmas_q}
    matched_exact = lemmas_q_norm & md_stems
    matched_norm = set()
    match_src = {}  # q -> matched md filename stem
    for q in matched_exact:
        match_src[q] = q

    for q in lemmas_q_norm - matched_exact:
        for v in variants(q):
            vn = norm_tilde(v)
            if vn in md_stems:
                matched_norm.add(q)
                match_src[q] = vn
                break
            if vn in md_norm_map:
                matched_norm.add(q)
                match_src[q] = md_norm_map[vn]
                break

    total_q = len(lemmas_q_norm)
    exact_n = len(matched_exact)
    norm_n = len(matched_norm)
    unmatched = lemmas_q_norm - matched_exact - matched_norm

    print(f"問題lemma数:       {total_q}")
    print(f"語彙DBファイル数:   {len(md_stems)}")
    print(f"完全一致:          {exact_n} ({exact_n/total_q*100:.1f}%)")
    print(f"正規化後に一致:     +{norm_n} ({norm_n/total_q*100:.1f}%)")
    print(f"合計カバー率:       {(exact_n+norm_n)/total_q*100:.1f}%")
    print(f"未カバー lemma:     {len(unmatched)}")
    print()
    print("=== 未カバー lemma 全件 ===")
    for l in sorted(unmatched):
        print(f"  {l}")
    print()
    print("=== 正規化でマッチした例 (先頭15) ===")
    for q in sorted(matched_norm)[:15]:
        print(f"  {q}  →  {match_src[q]}.md")

    # Write match table to JSON for later use
    out = ROOT / 'exports' / 'vocab_match.json'
    out.parent.mkdir(exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({
            'total_q': total_q,
            'exact': sorted(matched_exact),
            'normalized': {q: match_src[q] for q in matched_norm},
            'unmatched': sorted(unmatched),
        }, f, ensure_ascii=False, indent=2)
    print(f"\n照合結果を {out} に書き出しました")


if __name__ == '__main__':
    main()
