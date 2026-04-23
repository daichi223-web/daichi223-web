import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import VocabModal from '../components/VocabModal';
import MorphologyTable from '../components/MorphologyTable';
import { getPublishedSlugs } from '../lib/textPublications';
import './TextDetail.css';

type TextRecord = {
  id: string;
  slug: string;
  title: string;
  source_work: string;
  genre: string;
  tags: string[];
  metadata: {
    textbook: string;
    part: number | null;
    chapter: number | null;
    chapter_title: string;
    year: number | null;
    university: string;
    work: string;
  };
  sections: Record<string, string>;
  section_titles: string[];
  has_text: boolean;
  has_translation: boolean;
};

type ViewMode = 'side-by-side' | 'original' | 'translation';

const SECTION_ORDER: { key: string; label: string }[] = [
  { key: '出典_背景', label: '出典・背景' },
  { key: '登場人物と敬語分析', label: '登場人物・敬語分析' },
  { key: '品詞分解', label: '品詞分解' },
  { key: '学習ポイント', label: '学習ポイント' },
  { key: '設問', label: '設問' },
  { key: '重要語句', label: '重要語句' },
  { key: '関連リンク', label: '関連リンク' },
];

let vocabLemmasCache: string[] | null = null;

async function loadVocabLemmas(): Promise<string[]> {
  if (vocabLemmasCache) return vocabLemmasCache;
  try {
    const res = await fetch('/vocab/index.json');
    if (!res.ok) throw new Error('failed');
    const idx = await res.json();
    // Sort by length desc so longest matches are tried first
    vocabLemmasCache = Object.keys(idx).sort((a, b) => b.length - a.length);
  } catch {
    vocabLemmasCache = [];
  }
  return vocabLemmasCache;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function TextDetail() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<TextRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('side-by-side');
  const [highlight, setHighlight] = useState<string>('');
  const [lemmas, setLemmas] = useState<string[]>([]);
  const [showLemmaLinks, setShowLemmaLinks] = useState(true);
  const [openVocabLemma, setOpenVocabLemma] = useState<string | null>(null);
  const [morphWordFocus, setMorphWordFocus] = useState<string>('');
  const [publishedSet, setPublishedSet] = useState<Set<string> | null>(null);
  const originalTextRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getPublishedSlugs().then((s) => setPublishedSet(s));
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setRecord(null);
    setError(null);
    fetch(`/texts/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: TextRecord) => {
        if (!cancelled) setRecord(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || '読み込み失敗');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    loadVocabLemmas().then(setLemmas);
  }, []);

  useEffect(() => {
    const m = window.location.search.match(/[?&]q=([^&]+)/);
    if (m) {
      try {
        setHighlight(decodeURIComponent(m[1]));
      } catch {
        setHighlight(m[1]);
      }
    }
  }, [id]);

  // Combined regex: highlight query + known lemmas + morph word focus
  const markupRe = useMemo(() => {
    const parts: string[] = [];
    if (highlight) {
      parts.push(`(?<hl>${escapeRegex(highlight)})`);
    }
    if (morphWordFocus) {
      parts.push(`(?<morph>${escapeRegex(morphWordFocus)})`);
    }
    if (showLemmaLinks && lemmas.length > 0) {
      const usable = lemmas.filter((l) => l.length >= 2);
      if (usable.length > 0) {
        const alts = usable.map(escapeRegex).join('|');
        parts.push(`(?<lemma>${alts})`);
      }
    }
    if (parts.length === 0) return null;
    return new RegExp(parts.join('|'), 'g');
  }, [highlight, lemmas, showLemmaLinks, morphWordFocus]);

  const renderWithMarkup = (text: string) => {
    if (!markupRe || !text) return text;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = markupRe.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const groups = m.groups || {};
      if (groups.hl) {
        parts.push(
          <mark key={key++} className="text-highlight">
            {m[0]}
          </mark>
        );
      } else if (groups.morph) {
        parts.push(
          <mark key={key++} className="text-morph-highlight">
            {m[0]}
          </mark>
        );
      } else if (groups.lemma) {
        const lemma = m[0];
        parts.push(
          <button
            key={key++}
            className="inline-lemma"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setOpenVocabLemma(lemma);
            }}
            title={`「${lemma}」の解説を表示`}
          >
            {lemma}
          </button>
        );
      } else {
        parts.push(m[0]);
      }
      last = m.index + m[0].length;
      if (m.index === markupRe.lastIndex) markupRe.lastIndex++;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  if (error) {
    return (
      <div className="text-detail">
        <div className="text-detail-header">
          <Link to="/" className="back-link">← ホームへ</Link>
        </div>
        <div className="text-detail-error">読み込みエラー: {error}</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-detail">
        <div className="text-detail-header">
          <Link to="/" className="back-link">← ホームへ</Link>
        </div>
        <div className="text-detail-loading">読み込み中…</div>
      </div>
    );
  }

  // If public visibility list exists and this text is not in it, block access
  if (publishedSet && id && !publishedSet.has(id)) {
    return (
      <div className="text-detail">
        <div className="text-detail-header">
          <Link to="/" className="back-link">← ホームへ</Link>
          <Link to="/texts" className="texts-index-link">教材一覧</Link>
        </div>
        <div className="text-detail-error">
          この教材は現在非公開です。
        </div>
      </div>
    );
  }

  const originalText = record.sections['本文'] || '';
  const translation = record.sections['現代語訳'] || '';

  return (
    <div className="text-detail">
      {openVocabLemma && (
        <VocabModal
          lemma={openVocabLemma}
          onClose={() => setOpenVocabLemma(null)}
        />
      )}

      <div className="text-detail-header">
        <Link to="/" className="back-link">← ホームへ</Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: '0.82rem', color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={showLemmaLinks}
              onChange={(e) => setShowLemmaLinks(e.target.checked)}
            />
            単語リンク
          </label>
          <Link to="/texts" className="texts-index-link">教材一覧</Link>
        </div>
      </div>

      <div className="text-detail-title-block">
        <h1>{record.title}</h1>
        <div className="text-detail-meta">
          {record.source_work && <span className="meta-chip">{record.source_work}</span>}
          {record.genre && <span className="meta-chip genre">{record.genre}</span>}
          {record.metadata.textbook && (
            <span className="meta-chip">{record.metadata.textbook}</span>
          )}
        </div>
      </div>

      <div className="text-detail-viewmode">
        <button
          className={mode === 'side-by-side' ? 'active' : ''}
          onClick={() => setMode('side-by-side')}
          disabled={!record.has_text || !record.has_translation}
        >
          対訳
        </button>
        <button
          className={mode === 'original' ? 'active' : ''}
          onClick={() => setMode('original')}
          disabled={!record.has_text}
        >
          原文のみ
        </button>
        <button
          className={mode === 'translation' ? 'active' : ''}
          onClick={() => setMode('translation')}
          disabled={!record.has_translation}
        >
          現代語訳のみ
        </button>
      </div>

      {mode === 'side-by-side' && (
        <div className="text-detail-columns">
          <div className="text-col">
            <h2>原文</h2>
            <div className="text-col-body original" ref={originalTextRef}>
              {renderWithMarkup(originalText)}
            </div>
          </div>
          <div className="text-col">
            <h2>現代語訳</h2>
            <div className="text-col-body translation">
              {renderWithMarkup(translation)}
            </div>
          </div>
        </div>
      )}

      {mode === 'original' && (
        <section className="text-section">
          <h2>原文</h2>
          <div className="text-block original" ref={originalTextRef}>
            {renderWithMarkup(originalText)}
          </div>
        </section>
      )}

      {mode === 'translation' && (
        <section className="text-section">
          <h2>現代語訳</h2>
          <div className="text-block translation">{renderWithMarkup(translation)}</div>
        </section>
      )}

      {/* Other sections, collapsed by default */}
      {SECTION_ORDER.map(({ key, label }) => {
        const content = record.sections[key];
        if (!content) return null;
        if (key === '品詞分解') {
          return (
            <details key={key} className="text-section-details" open>
              <summary>{label}</summary>
              <div className="text-block morph-wrap">
                <MorphologyTable
                  source={content}
                  onWordClick={(w) => {
                    setMorphWordFocus(w);
                    if (originalTextRef.current) {
                      // Scroll to first match in original text
                      setTimeout(() => {
                        const mark = originalTextRef.current?.querySelector(
                          '.text-morph-highlight'
                        );
                        mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 50);
                    }
                  }}
                />
              </div>
            </details>
          );
        }
        return (
          <details key={key} className="text-section-details">
            <summary>{label}</summary>
            <div className="text-block markdown">
              <pre>{content}</pre>
            </div>
          </details>
        );
      })}
    </div>
  );
}
