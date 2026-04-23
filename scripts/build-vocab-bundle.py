"""Build vocab bundle from kokugo-vault MD files into public/vocab/.

Output:
  public/vocab/index.json   -- { lemma: {title, pos, category, file} }
  public/vocab/<slug>.html  -- rendered HTML for each vocab entry

Uses vocab_match.json (output of scripts/match-vocab.py) to map quiz lemmas
to MD filenames with normalization.
"""
import json
import re
import sys
import hashlib
from pathlib import Path

import markdown
import yaml

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
VAULT = Path('F:/A2A/NotebookLM/kokugo-vault/20-文法/語彙DB')
INBOX = Path('F:/A2A/NotebookLM/kokugo-vault/00-inbox/AI生成語彙')
CATS = ["重要動詞", "重要形容詞", "重要名詞", "重要副詞", "多義語",
        "現古異義語", "敬語動詞", "助動詞判別", "接尾辞", "接頭辞"]
OUT_DIR = ROOT / 'public' / 'vocab'


def normalize_tilde(s: str) -> str:
    """Normalize wave-dash variants to fullwidth tilde for consistent matching."""
    return s.replace('〜', '～')


# --- Obsidian callout conversion ---
# > [!info] Optional Title
# > body line 1
# > body line 2
# →
# <div class="callout callout-info">
#   <div class="callout-title">Optional Title</div>
#   <div class="callout-body">body line 1\nbody line 2</div>
# </div>

CALLOUT_RE = re.compile(
    r'(?m)^(?P<block>(?:^> \[!(?P<kind>\w+)\](?P<title>[^\n]*)\n(?:^>[^\n]*\n?)*))',
)


def convert_callouts(md_text: str) -> str:
    """Convert Obsidian callouts to HTML divs before markdown rendering."""
    def repl(m):
        kind = m.group('kind').lower()
        title = m.group('title').strip()
        # Gather body lines
        block = m.group('block')
        lines = block.split('\n')
        body_lines = []
        for i, line in enumerate(lines):
            if i == 0:
                continue  # skip header line
            # strip leading "> " or ">"
            if line.startswith('> '):
                body_lines.append(line[2:])
            elif line.startswith('>'):
                body_lines.append(line[1:])
            elif line.strip() == '':
                body_lines.append('')
        body_md = '\n'.join(body_lines).strip()
        # Render body as markdown
        body_html = markdown.markdown(
            body_md,
            extensions=['extra', 'tables', 'sane_lists'],
        )
        title_html = f'<div class="callout-title">{title}</div>' if title else ''
        return (
            f'<div class="callout callout-{kind}">'
            f'{title_html}'
            f'<div class="callout-body">{body_html}</div>'
            f'</div>\n'
        )
    return CALLOUT_RE.sub(repl, md_text)


def parse_frontmatter(text: str):
    if not text.startswith('---\n'):
        return {}, text
    end = text.find('\n---\n', 4)
    if end < 0:
        return {}, text
    fm_text = text[4:end]
    body = text[end + 5:]
    try:
        fm = yaml.safe_load(fm_text) or {}
    except Exception:
        fm = {}
    return fm, body


def md_to_html(md_body: str) -> str:
    # First convert callouts (they need to be preserved through markdown rendering)
    pre = convert_callouts(md_body)
    html = markdown.markdown(
        pre,
        extensions=['extra', 'tables', 'sane_lists', 'toc'],
    )
    # Strip Obsidian wikilinks [[foo]] -> foo
    html = re.sub(r'\[\[([^\]|]+)(\|[^\]]+)?\]\]', r'\1', html)
    return html


def slugify(name: str) -> str:
    """Produce a filesystem-safe slug (hash since Japanese filenames are fine but
    let's keep things short & deterministic)."""
    digest = hashlib.sha1(name.encode('utf-8')).hexdigest()[:10]
    return digest


def load_match_table():
    mf = ROOT / 'exports' / 'vocab_match.json'
    if mf.exists():
        with open(mf, encoding='utf-8') as f:
            return json.load(f)
    return {'exact': [], 'normalized': {}, 'unmatched': []}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Read all MD files from vault categories + AI-generated inbox
    entries = {}  # md_stem -> {title, pos, category, html, slug}
    sources = [(VAULT / c, c) for c in CATS] + [(INBOX, 'AI生成語彙')]
    for src_dir, cat in sources:
        if not src_dir.exists():
            continue
        for md_path in src_dir.glob('*.md'):
            if md_path.stem == '_index':
                continue
            text = md_path.read_text(encoding='utf-8')
            fm, body = parse_frontmatter(text)
            html = md_to_html(body)
            # Normalize tilde variants in stem for consistent lookup
            stem = normalize_tilde(md_path.stem)
            slug = slugify(stem)
            title = fm.get('title', md_path.stem)
            entries[stem] = {
                'title': title,
                'reading': fm.get('reading', ''),
                'pos': fm.get('pos', ''),
                'category': fm.get('category', cat),
                'tags': fm.get('tags', []),
                'html': html,
                'slug': slug,
            }
            # Also index by normalized title (in case title differs from stem)
            nt = normalize_tilde(title)
            if nt != stem and nt not in entries:
                entries[nt] = entries[stem]

    # Build lemma → slug mapping using match table
    match = load_match_table()
    lemma_map = {}

    for lemma in match.get('exact', []):
        if lemma in entries:
            e = entries[lemma]
            lemma_map[lemma] = {
                'slug': e['slug'],
                'title': e['title'],
                'pos': e['pos'],
                'category': e['category'],
            }

    for lemma, md_stem in match.get('normalized', {}).items():
        if md_stem in entries:
            e = entries[md_stem]
            lemma_map[lemma] = {
                'slug': e['slug'],
                'title': e['title'],
                'pos': e['pos'],
                'category': e['category'],
            }

    # Additionally: re-match all quiz lemmas against the now-expanded entries
    # (for lemmas in the 'unmatched' list, see if INBOX MDs cover them)
    quiz_lemmas_file = ROOT / 'exports' / 'vocab_match.json'
    if quiz_lemmas_file.exists():
        # The match table's 'unmatched' list may now be covered
        for lemma in match.get('unmatched', []):
            if lemma in lemma_map:
                continue
            nt = normalize_tilde(lemma)
            # Try exact, normalized, and title-only match
            candidate = nt if nt in entries else None
            if candidate:
                e = entries[candidate]
                lemma_map[lemma] = {
                    'slug': e['slug'],
                    'title': e['title'],
                    'pos': e['pos'],
                    'category': e['category'],
                }

    # Write per-entry HTML files (deduped by slug)
    seen_slugs = set()
    for stem, e in entries.items():
        if e['slug'] in seen_slugs:
            continue
        seen_slugs.add(e['slug'])
        f = OUT_DIR / f"{e['slug']}.html"
        # Wrap with meta info for context
        meta_json = json.dumps({
            'title': e['title'],
            'reading': e['reading'],
            'pos': e['pos'],
            'category': e['category'],
            'tags': e['tags'],
        }, ensure_ascii=False)
        f.write_text(
            f'<!--META:{meta_json}-->\n{e["html"]}',
            encoding='utf-8',
        )

    # Write lemma index
    idx_file = OUT_DIR / 'index.json'
    idx_file.write_text(
        json.dumps(lemma_map, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )

    print(f"MDエントリ書き出し: {len(seen_slugs)} 件 → {OUT_DIR}/")
    print(f"問題lemma→vocab 索引: {len(lemma_map)} 件 → {idx_file}")
    unmatched_after = [l for l in match.get('unmatched', []) if l not in lemma_map]
    print(f"未カバー lemma: {len(unmatched_after)} 件")
    if unmatched_after:
        for l in unmatched_after[:10]:
            print(f"  残: {l}")


if __name__ == '__main__':
    main()
