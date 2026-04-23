import { useMemo } from 'react';

type Row = { word: string; pos: string };

type Props = {
  source: string;
  onWordClick?: (word: string) => void;
};

function stripWikilink(text: string): { label: string; link?: string } {
  // [[path/to|label]] or [[name]]
  const m = text.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!m) return { label: text };
  return { label: m[2] || m[1].split('/').pop() || m[1], link: m[1] };
}

function parseTable(source: string): Row[] {
  const lines = source.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 3) return [];
  const rows: Row[] = [];
  // skip header + separator
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .trim()
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    const wordInfo = stripWikilink(cells[0]);
    const posInfo = stripWikilink(cells[1]);
    rows.push({ word: wordInfo.label, pos: posInfo.label });
  }
  return rows;
}

// Colors by part-of-speech prefix
function posClass(pos: string): string {
  if (!pos) return '';
  if (pos.startsWith('係助') || pos.startsWith('格助') || pos.startsWith('副助') || pos.startsWith('終助') || pos.startsWith('接助'))
    return 'pos-particle';
  if (pos.match(/^(ラ四|カ四|サ変|ナ変|カ変|ラ変|ラ下|カ下|サ下|ナ下|ヤ下|カ上|ガ上|ラ上|サ上|バ上|マ上|ラ上一|ハ四|マ四|ガ四|バ四|タ四|ナ四|サ四|ガ変)/))
    return 'pos-verb';
  if (pos.startsWith('ク') || pos.startsWith('シク'))
    return 'pos-adj';
  if (pos.startsWith('ナリ') || pos.startsWith('タリ'))
    return 'pos-adjv';
  if (pos === '副') return 'pos-adv';
  if (pos === '接') return 'pos-conj';
  if (pos === '代') return 'pos-pronoun';
  if (pos.includes('存続') || pos.includes('完了') || pos.includes('打消') || pos.includes('推量') || pos.includes('過去'))
    return 'pos-aux';
  return '';
}

export default function MorphologyTable({ source, onWordClick }: Props) {
  const rows = useMemo(() => parseTable(source), [source]);

  if (rows.length === 0) {
    return <pre className="morph-raw">{source}</pre>;
  }

  return (
    <table className="morph-table">
      <thead>
        <tr>
          <th>語</th>
          <th>品詞・活用</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>
              {onWordClick && r.word.trim() !== '' ? (
                <button
                  className="morph-word-btn"
                  onClick={() => onWordClick(r.word)}
                  title={`本文で「${r.word}」を探す`}
                  type="button"
                >
                  {r.word}
                </button>
              ) : (
                r.word
              )}
            </td>
            <td>
              {r.pos && (
                <span className={`morph-pos ${posClass(r.pos)}`}>{r.pos}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
