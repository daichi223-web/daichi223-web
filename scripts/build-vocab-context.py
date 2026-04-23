"""Build per-lemma context JSON for MD generation.

For each unmatched lemma, aggregate all related entries from kobun_q.jsonl:
- sense (canonical meaning labels)
- examples (jp + translation, grouped by meaning_idx)
- group/sub info

Output:
  exports/vocab_context.json  -- {lemma: {senses: [...], examples: [{jp, translation, qid}], total_qs: int}}
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent


def main():
    match_file = ROOT / 'exports' / 'vocab_match.json'
    with open(match_file, encoding='utf-8') as f:
        match = json.load(f)
    unmatched = set(match.get('unmatched', []))

    # Build index: lemma -> list of entries
    lemma_entries = {}
    with open(ROOT / 'data' / 'kobun_q.jsonl.txt', encoding='utf-8') as f:
        for line in f:
            obj = json.loads(line)
            lemma_entries.setdefault(obj['lemma'], []).append(obj)

    # Build context for each unmatched lemma
    context = {}
    for lemma in sorted(unmatched):
        entries = lemma_entries.get(lemma, [])
        if not entries:
            # Maybe normalized form
            continue

        senses = {}
        examples = []
        for e in entries:
            mi = e.get('meaning_idx', e.get('sub', 0))
            sense = e.get('sense', '').strip()
            if sense:
                # Strip 〔 〕 brackets
                sense_clean = re.sub(r'[〔〕]', '', sense).strip()
                if mi not in senses:
                    senses[mi] = sense_clean
            for ex in e.get('examples', []):
                examples.append({
                    'meaning_idx': mi,
                    'jp': ex.get('jp', ''),
                    'translation': ex.get('translation', ''),
                    'qid': e.get('qid', ''),
                })

        context[lemma] = {
            'senses': [{'idx': i, 'text': senses[i]} for i in sorted(senses.keys())],
            'examples': examples,
            'total_qs': len(entries),
        }

    out = ROOT / 'exports' / 'vocab_context.json'
    out.write_text(
        json.dumps(context, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    print(f"未カバー lemma 数: {len(unmatched)}")
    print(f"コンテキスト付き: {len(context)}")
    print(f"出力: {out}")


if __name__ == '__main__':
    main()
