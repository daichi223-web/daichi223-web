import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './VocabModal.css';

type VocabIndexEntry = {
  slug: string;
  title: string;
  pos: string;
  category: string;
};

type VocabIndex = Record<string, VocabIndexEntry>;

type Example = {
  lemma: string;
  meaning_idx: number;
  meaning: string;
  sentence: string;
  source_work: string;
  context: string;
};

type ExamplesByLemma = Record<string, Example[]>;

type TextIndexEntry = {
  id: string;
  slug: string;
  title: string;
  source_work: string;
  genre: string;
};

let vocabIdxCache: VocabIndex | null = null;
let examplesCache: ExamplesByLemma | null = null;
let textsIdxCache: TextIndexEntry[] | null = null;

async function loadVocabIndex(): Promise<VocabIndex> {
  if (vocabIdxCache) return vocabIdxCache;
  const res = await fetch('/vocab/index.json');
  if (!res.ok) throw new Error(`vocab index HTTP ${res.status}`);
  vocabIdxCache = (await res.json()) as VocabIndex;
  return vocabIdxCache;
}

async function loadExamples(): Promise<ExamplesByLemma> {
  if (examplesCache) return examplesCache;
  const res = await fetch('/examples-by-lemma.json');
  if (!res.ok) {
    examplesCache = {};
    return examplesCache;
  }
  examplesCache = (await res.json()) as ExamplesByLemma;
  return examplesCache;
}

async function loadTextsIndex(): Promise<TextIndexEntry[]> {
  if (textsIdxCache) return textsIdxCache;
  try {
    const res = await fetch('/texts/index.json');
    if (!res.ok) {
      textsIdxCache = [];
      return textsIdxCache;
    }
    textsIdxCache = (await res.json()) as TextIndexEntry[];
  } catch {
    textsIdxCache = [];
  }
  return textsIdxCache;
}

export async function hasVocabFor(lemma: string): Promise<boolean> {
  const idx = await loadVocabIndex();
  return lemma in idx;
}

type Props = {
  lemma: string;
  onClose: () => void;
};

type Tab = 'overview' | 'examples';

export default function VocabModal({ lemma, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [html, setHtml] = useState<string | null>(null);
  const [entry, setEntry] = useState<VocabIndexEntry | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [textsIdx, setTextsIdx] = useState<TextIndexEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setEntry(null);
    setExamples([]);
    setError(null);

    (async () => {
      try {
        const idx = await loadVocabIndex();
        const e = idx[lemma];
        if (!cancelled && e) setEntry(e);

        // Fetch HTML explanation (if available)
        if (e) {
          const res = await fetch(`/vocab/${e.slug}.html`);
          if (res.ok) {
            const text = await res.text();
            if (!cancelled) setHtml(text.replace(/^<!--META:.*?-->\n?/, ''));
          }
        }

        // Fetch examples
        const ex = await loadExamples();
        if (!cancelled) setExamples(ex[lemma] || []);

        // Fetch texts index for source lookup
        const ti = await loadTextsIndex();
        if (!cancelled) setTextsIdx(ti);

        if (!e && (!ex[lemma] || ex[lemma].length === 0)) {
          if (!cancelled) setError('この単語の解説と例文はまだ準備されていません');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '読み込み失敗');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lemma]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Group examples by meaning_idx
  const grouped = useMemo(() => {
    const groups: Record<number, Example[]> = {};
    for (const ex of examples) {
      (groups[ex.meaning_idx] ||= []).push(ex);
    }
    return groups;
  }, [examples]);

  // Split HTML into sections: each h2 starts a new collapsible section.
  // The first chunk (before any h2, usually just the callout 基本データ) is
  // shown as an always-visible header area.
  const sections = useMemo(() => {
    if (!html) return { lead: '', sections: [] as { title: string; body: string }[] };
    const parts = html.split(/(?=<h2\b[^>]*>)/i);
    const lead = parts.shift() || '';
    const out: { title: string; body: string }[] = [];
    for (const chunk of parts) {
      const m = chunk.match(/^<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
      if (!m) continue;
      const titleText = m[1].replace(/<[^>]+>/g, '').trim();
      const body = chunk.slice(m[0].length).trim();
      out.push({ title: titleText, body });
    }
    return { lead, sections: out };
  }, [html]);

  // Lookup text id by work name (best-effort match)
  const findTextBySource = (work: string): TextIndexEntry | null => {
    if (!work) return null;
    const key = work.trim();
    for (const t of textsIdx) {
      if (t.title === key || t.source_work === key) return t;
    }
    // Partial match (for chapters like "源氏物語・桐壺")
    const mainWork = key.split(/[・･]/)[0].trim();
    for (const t of textsIdx) {
      if (t.source_work && t.source_work.includes(mainWork)) return t;
      if (t.title.includes(mainWork)) return t;
    }
    return null;
  };

  const meaningIdxToSymbol = (idx: number): string => {
    const symbols = '❶❷❸❹❺❻❼❽❾❿';
    return symbols[idx - 1] || String(idx);
  };

  return (
    <div className="vocab-modal-backdrop" onClick={onClose}>
      <div className="vocab-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="vocab-modal-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>
        <div className="vocab-modal-header">
          <h2>{entry?.title || lemma}</h2>
          {entry && (
            <div className="vocab-modal-badges">
              {entry.pos && <span className="badge">{entry.pos}</span>}
              {entry.category && <span className="badge badge-cat">{entry.category}</span>}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="vocab-modal-tabs">
          <button
            className={`vocab-modal-tab ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
            disabled={!html}
          >
            解説
          </button>
          <button
            className={`vocab-modal-tab ${tab === 'examples' ? 'active' : ''}`}
            onClick={() => setTab('examples')}
            disabled={examples.length === 0}
          >
            例文 {examples.length > 0 && <span className="tab-badge">{examples.length}</span>}
          </button>
        </div>

        <div className="vocab-modal-body">
          {error && !html && examples.length === 0 ? (
            <p className="vocab-modal-error">{error}</p>
          ) : tab === 'overview' ? (
            html ? (
              <div className="vocab-modal-content">
                {sections.lead && (
                  <div
                    className="vocab-modal-lead"
                    dangerouslySetInnerHTML={{ __html: sections.lead }}
                  />
                )}
                {sections.sections.map((s, i) => (
                  <details key={i} className="vocab-modal-section">
                    <summary>{s.title}</summary>
                    <div
                      className="vocab-modal-section-body"
                      dangerouslySetInnerHTML={{ __html: s.body }}
                    />
                  </details>
                ))}
              </div>
            ) : (
              <p className="vocab-modal-loading">読み込み中…</p>
            )
          ) : (
            <div className="vocab-modal-examples">
              {Object.keys(grouped).length === 0 && (
                <p className="vocab-modal-loading">例文がありません</p>
              )}
              {Object.entries(grouped)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([idxStr, list]) => {
                  const idx = Number(idxStr);
                  const meaning = list[0]?.meaning || '';
                  return (
                    <div key={idx} className="example-group">
                      <h3 className="example-group-title">
                        <span className="meaning-symbol">{meaningIdxToSymbol(idx)}</span>
                        <span>{meaning}</span>
                      </h3>
                      <ul className="example-list">
                        {list.map((ex, i) => {
                          const linkedText = findTextBySource(ex.source_work);
                          return (
                            <li key={i} className="example-item">
                              <div className="example-sentence">「{ex.sentence}」</div>
                              {ex.context && (
                                <div className="example-context">{ex.context}</div>
                              )}
                              {ex.source_work && (
                                <div className="example-source">
                                  出典:{' '}
                                  {linkedText ? (
                                    <Link
                                      to={`/texts/${linkedText.slug}`}
                                      onClick={onClose}
                                      className="example-source-link"
                                    >
                                      {ex.source_work} →
                                    </Link>
                                  ) : (
                                    <span>{ex.source_work}</span>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
