"""Extract example sentences from vocab MDs.

Output:
  public/examples.json  -- array of {lemma, meaning_idx, meaning, sentence, source_work, context}

Source tables:
  - 「## 辞書的意味」table: canonical meanings per ❶❷❸
  - 「## 用例（意味番号付き）」 / 「## 用例」 / 「## 例文」 table: rich examples
  - Fallback: "典型的な例文" column from 辞書的意味 table
"""
import json
import re
import sys
from pathlib import Path

import yaml

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
VAULT = Path('F:/A2A/NotebookLM/kokugo-vault/20-文法/語彙DB')
INBOX = Path('F:/A2A/NotebookLM/kokugo-vault/00-inbox/AI生成語彙')
CATS = ["重要動詞", "重要形容詞", "重要名詞", "重要副詞", "多義語",
        "現古異義語", "敬語動詞", "助動詞判別", "接尾辞", "接頭辞"]

# Meaning-number detection
MEANING_NUM_RE = re.compile(r'[❶❷❸❹❺❻❼❽❾❿①②③④⑤⑥⑦⑧⑨⑩]')
# Map to index
CIRCLED_BLACK = '❶❷❸❹❺❻❼❽❾❿'
CIRCLED_WHITE = '①②③④⑤⑥⑦⑧⑨⑩'


def meaning_num_to_idx(ch: str) -> int | None:
    if ch in CIRCLED_BLACK:
        return CIRCLED_BLACK.index(ch) + 1
    if ch in CIRCLED_WHITE:
        return CIRCLED_WHITE.index(ch) + 1
    return None


# 「引用文」（出典）  /  「引用文」(出典)  /  just 「引用文」
QUOTED_SRC_RE = re.compile(r'「([^」]+)」\s*[（(]?([^）)\n]*?)[）)]?\s*$')
QUOTED_ONLY_RE = re.compile(r'「([^」]+)」')


def parse_frontmatter(text: str):
    if not text.startswith('---\n'):
        return {}, text
    end = text.find('\n---\n', 4)
    if end < 0:
        return {}, text
    try:
        fm = yaml.safe_load(text[4:end]) or {}
    except Exception:
        fm = {}
    return fm, text[end + 5:]


def find_section(md: str, header_patterns: list[str]) -> str | None:
    """Return body under first matching h2 section, or None."""
    lines = md.split('\n')
    for pat in header_patterns:
        rx = re.compile(rf'^##\s+{pat}\s*$')
        start = None
        for i, line in enumerate(lines):
            if rx.match(line):
                start = i
                break
        if start is None:
            continue
        # collect until next ## (h2)
        body = []
        for line in lines[start + 1:]:
            if re.match(r'^##\s', line):
                break
            body.append(line)
        return '\n'.join(body)
    return None


def parse_md_table(body: str) -> list[list[str]]:
    """Parse a markdown table, return list of rows (list of cell strings).
    Skips header and separator rows."""
    if not body:
        return []
    rows = []
    lines = [l for l in body.split('\n') if l.strip().startswith('|')]
    # Drop header (first) and separator (second) — but only if separator exists
    if len(lines) >= 2 and re.match(r'^\|[\s\-:|]+\|$', lines[1].strip()):
        data_lines = lines[2:]
    else:
        data_lines = lines[1:] if len(lines) >= 1 else []
    for line in data_lines:
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows.append(cells)
    return rows


def extract_from_meaning_table(rows: list[list[str]]) -> dict[int, dict]:
    """From 辞書的意味 table. Expected columns: 番号 | 意味 | 典型的な例文 | 出典"""
    out = {}
    for r in rows:
        if len(r) < 2:
            continue
        num_cell = r[0]
        m = MEANING_NUM_RE.search(num_cell)
        if not m:
            continue
        idx = meaning_num_to_idx(m.group(0))
        if idx is None:
            continue
        meaning = r[1] if len(r) > 1 else ''
        example = r[2] if len(r) > 2 else ''
        source = r[3] if len(r) > 3 else ''
        out[idx] = {
            'meaning': meaning,
            'example': example,
            'source': source,
        }
    return out


def extract_from_usage_table(rows: list[list[str]]) -> list[dict]:
    """From 用例 table. Expected columns: 意味 | 用例 | 文脈解説"""
    examples = []
    for r in rows:
        if len(r) < 2:
            continue
        meaning_cell = r[0]
        usage_cell = r[1] if len(r) > 1 else ''
        context_cell = r[2] if len(r) > 2 else ''

        m = MEANING_NUM_RE.search(meaning_cell)
        if not m:
            continue
        idx = meaning_num_to_idx(m.group(0))
        if idx is None:
            continue

        # Extract quoted sentence and source
        sentence = ''
        source = ''
        qm = QUOTED_SRC_RE.search(usage_cell)
        if qm:
            sentence = qm.group(1).strip()
            source = qm.group(2).strip()
        else:
            qm2 = QUOTED_ONLY_RE.search(usage_cell)
            if qm2:
                sentence = qm2.group(1).strip()
        if not sentence:
            continue

        examples.append({
            'meaning_idx': idx,
            'meaning_label': meaning_cell,  # e.g. "❶魂がさまよい出る"
            'sentence': sentence,
            'source_work': source,
            'context': context_cell,
        })
    return examples


def process_file(md_path: Path, category: str) -> list[dict]:
    text = md_path.read_text(encoding='utf-8')
    fm, body = parse_frontmatter(text)
    lemma = fm.get('title', md_path.stem)
    reading = fm.get('reading', '')
    pos = fm.get('pos', '')

    # Strip any "（variant）" from lemma (e.g. "あながち（あながちに）")
    lemma_clean = re.sub(r'[（(].*?[）)]', '', lemma).strip()

    # 1. From 用例 table
    usage_body = find_section(body, [
        r'用例（意味番号付き）',
        r'用例',
        r'例文',
    ])
    usage_rows = parse_md_table(usage_body) if usage_body else []
    usage_examples = extract_from_usage_table(usage_rows)

    # 2. From 辞書的意味 table (meanings lookup)
    meaning_body = find_section(body, [r'辞書的意味'])
    meaning_rows = parse_md_table(meaning_body) if meaning_body else []
    meanings_map = extract_from_meaning_table(meaning_rows)

    # Enrich examples with clean meaning text
    out = []
    for ex in usage_examples:
        m = meanings_map.get(ex['meaning_idx'])
        out.append({
            'lemma': lemma_clean,
            'reading': reading,
            'pos': pos,
            'category': category,
            'meaning_idx': ex['meaning_idx'],
            'meaning': m['meaning'] if m else ex['meaning_label'],
            'sentence': ex['sentence'],
            'source_work': ex['source_work'] or (m['source'] if m else ''),
            'context': ex['context'],
            'source_file': md_path.name,
        })

    # Fallback: if no usage examples but 辞書的意味 has 典型的な例文, use those
    if not out:
        for idx, m in meanings_map.items():
            if m['example'] and m['example'] != '—':
                out.append({
                    'lemma': lemma_clean,
                    'reading': reading,
                    'pos': pos,
                    'category': category,
                    'meaning_idx': idx,
                    'meaning': m['meaning'],
                    'sentence': re.sub(r'^「|」$', '', m['example']).strip('「」'),
                    'source_work': m['source'],
                    'context': '',
                    'source_file': md_path.name,
                })

    return out


def main():
    all_examples = []
    per_category = {}
    per_lemma = {}
    sources = [(VAULT / c, c) for c in CATS] + [(INBOX, 'AI生成語彙')]
    for d, cat in sources:
        if not d.exists():
            continue
        count = 0
        for p in d.glob('*.md'):
            if p.stem == '_index':
                continue
            exs = process_file(p, cat)
            if exs:
                count += len(exs)
                for e in exs:
                    all_examples.append(e)
                    per_lemma.setdefault(e['lemma'], []).append(e)
        per_category[cat] = count

    out = ROOT / 'public' / 'examples.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(all_examples, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )

    # Also by-lemma index (for quick vocab modal lookup)
    idx_out = ROOT / 'public' / 'examples-by-lemma.json'
    by_lemma = {}
    for lemma, exs in per_lemma.items():
        # Sort by meaning_idx
        by_lemma[lemma] = sorted(exs, key=lambda e: (e['meaning_idx'], e['source_work']))
    idx_out.write_text(
        json.dumps(by_lemma, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )

    print(f"総例文数: {len(all_examples)}")
    print(f"カバーlemma数: {len(per_lemma)}")
    print(f"カテゴリ別:")
    for c, n in per_category.items():
        print(f"  {c}: {n}")
    print(f"出力: {out}")
    print(f"出力: {idx_out}")


if __name__ == '__main__':
    main()
