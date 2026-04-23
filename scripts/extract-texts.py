"""Extract 教材 corpus from 30-教材/古文/ MDs.

Output:
  public/texts/index.json      -- [{id, title, source_work, genre, textbook, part, chapter, slug}]
  public/texts/<slug>.json     -- full record per text

Each text record:
  {
    id, slug, title, source_work, author, era, genre, tags,
    metadata: {textbook, part, chapter, chapter_title},
    sections: {
      出典_背景, 学習ポイント, 登場人物と敬語分析,
      本文, 品詞分解, 現代語訳, 設問
    }
  }
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import yaml

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
VAULT = Path('F:/A2A/NotebookLM/kokugo-vault/30-教材/古文')
OUT_DIR = ROOT / 'public' / 'texts'

# Skip list: MDs excluded from the public corpus.
# Keeps source MDs in the vault but removes them from the app.
SKIP_FILES = {
    '2024-東大-讃岐典侍日記.md',
    '『源氏物語』の虚構.md',
}


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


# Allowed section header variants (flexible)
SECTION_PATTERNS = {
    '出典_背景': [r'出典[・\s]*背景'],
    '学習ポイント': [r'学習ポイント'],
    '登場人物と敬語分析': [r'登場人物.*敬語.*分析', r'登場人物.*作品背景', r'歌人一覧.*修辞分析'],
    '本文': [r'\d+\.?\s*本文', r'本文'],
    '品詞分解': [r'\d+\.?\s*品詞分解', r'品詞分解'],
    '現代語訳': [r'\d+\.?\s*現代語訳', r'現代語訳'],
    '設問': [r'\d+\.?\s*テスト問題', r'\d+\.?\s*設問', r'設問解説', r'テスト問題'],
    '関連リンク': [r'関連リンク', r'\d+\.?\s*関連リンク'],
    '重要語句': [r'\d+\.?\s*重要語句一覧', r'重要語句'],
}


def parse_sections(body: str) -> dict[str, str]:
    """Split body into h2 sections, return {section_key: text}."""
    lines = body.split('\n')
    # Find h2 positions
    h2_positions = []
    for i, l in enumerate(lines):
        m = re.match(r'^##\s+(.*?)\s*$', l)
        if m:
            h2_positions.append((i, m.group(1).strip()))
    # Extract content per h2
    raw_sections = {}
    for idx, (pos, title) in enumerate(h2_positions):
        end_pos = h2_positions[idx + 1][0] if idx + 1 < len(h2_positions) else len(lines)
        content = '\n'.join(lines[pos + 1:end_pos]).strip()
        raw_sections[title] = content

    # Map to canonical keys
    result = {}
    for key, patterns in SECTION_PATTERNS.items():
        matched = None
        for title, content in raw_sections.items():
            for pat in patterns:
                if re.match(pat, title):
                    matched = content
                    break
            if matched is not None:
                break
        if matched is not None:
            result[key] = matched

    # Also include original section titles -> content for unmatched sections
    result['_all_sections_meta'] = [t for _, t in h2_positions]
    return result


def slugify(title: str) -> str:
    return hashlib.sha1(title.encode('utf-8')).hexdigest()[:10]


def process_file(md_path: Path) -> dict | None:
    text = md_path.read_text(encoding='utf-8')
    fm, body = parse_frontmatter(text)
    title = fm.get('title') or md_path.stem
    if not title:
        return None

    sections = parse_sections(body)
    all_titles = sections.pop('_all_sections_meta', [])

    # Quality flags
    has_text = '本文' in sections and sections['本文'].strip()
    has_translation = '現代語訳' in sections and sections['現代語訳'].strip()

    slug = slugify(md_path.stem)
    record = {
        'id': slug,
        'slug': slug,
        'title': title,
        'source_work': fm.get('source_work', ''),
        'genre': fm.get('genre', ''),
        'tags': fm.get('tags', []),
        'metadata': {
            'textbook': fm.get('textbook', ''),
            'part': fm.get('part'),
            'chapter': fm.get('chapter'),
            'chapter_title': fm.get('chapter_title', ''),
            'year': fm.get('year'),
            'university': fm.get('university', ''),
            'work': fm.get('work', ''),
        },
        'file_name': str(md_path.relative_to(VAULT)),
        'sections': sections,
        'section_titles': all_titles,
        'has_text': bool(has_text),
        'has_translation': bool(has_translation),
    }
    return record


def iter_md_files():
    """All .md under VAULT (recursive), excluding _index.md and skip list."""
    for p in VAULT.rglob('*.md'):
        if p.name == '_index.md':
            continue
        if p.name in SKIP_FILES:
            continue
        yield p


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Remove old vocab- only, keep other files
    records = []
    genre_count = {}
    empty_count = 0

    for md_path in iter_md_files():
        rec = process_file(md_path)
        if not rec:
            continue
        # Write per-text file
        (OUT_DIR / f"{rec['slug']}.json").write_text(
            json.dumps(rec, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )
        records.append(rec)
        g = rec['genre'] or '不明'
        genre_count[g] = genre_count.get(g, 0) + 1
        if not rec['has_text']:
            empty_count += 1

    # Build index (lightweight, no full sections)
    index = []
    for r in records:
        index.append({
            'id': r['id'],
            'slug': r['slug'],
            'title': r['title'],
            'source_work': r['source_work'],
            'genre': r['genre'],
            'tags': r['tags'],
            'textbook': r['metadata']['textbook'],
            'chapter': r['metadata']['chapter'],
            'has_text': r['has_text'],
            'has_translation': r['has_translation'],
        })
    # Sort by genre then title
    index.sort(key=lambda x: (x.get('genre') or '', x.get('title') or ''))

    (OUT_DIR / 'index.json').write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )

    print(f"教材総数: {len(records)}")
    print(f"ジャンル別:")
    for g, n in sorted(genre_count.items(), key=lambda x: -x[1]):
        print(f"  {g}: {n}")
    print(f"本文セクション欠落: {empty_count} 件")
    print(f"出力: {OUT_DIR}/index.json + {len(records)} 個別ファイル")


if __name__ == '__main__':
    main()
