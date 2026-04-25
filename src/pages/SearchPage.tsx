import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const SEARCH_SCROLL_KEY = 'kobun-search-scroll-v1';
import { chapterFor, chapterColor } from '../utils/chapters';
import VocabModal from '../components/VocabModal';
import bundledKobunQ from '../data/kobunQ.json';
import bundledVocabIndex from '../data/vocabIndex.json';
import bundledTextsIndex from '../data/textsIndex.json';
import './SearchPage.css';

type VocabIndexEntry = {
  slug: string;
  title: string;
  pos: string;
  category: string;
  group?: number;
};

type Example = {
  lemma: string;
  meaning_idx: number;
  meaning: string;
  sentence: string;
  source_work: string;
  context: string;
};

type LemmaGroupMap = Record<string, number>;

type TextIndexEntry = {
  id: string;
  slug: string;
  title: string;
  source_work: string;
  genre: string;
  has_text: boolean;
};

type TextBody = {
  slug: string;
  title: string;
  source_work: string;
  genre: string;
  original: string;
  translation: string;
};

type VocabIndex = Record<string, VocabIndexEntry>;

const MAX_RESULTS = 30;
const SNIPPET_CONTEXT = 20;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate stem-based matcher. For a query like "あくがる", matches
 * variants like "あくがれ", "あくがる", "あくがり", "あくがら", etc.
 * Approach: strip trailing 1 hiragana char to get stem, then allow any
 * hiragana char(s) to follow.
 */
function buildInflectionRegex(query: string): RegExp {
  const q = query.trim();
  if (q.length <= 1) return new RegExp(escapeRegex(q), 'gi');
  const hiragana = /[぀-ゟ]/;
  // Find stem: strip trailing hiragana chars (up to 2)
  let stem = q;
  let suffixLen = 0;
  for (let i = 0; i < 2 && stem.length > 1; i++) {
    if (hiragana.test(stem[stem.length - 1])) {
      stem = stem.slice(0, -1);
      suffixLen++;
    } else break;
  }
  if (suffixLen === 0) {
    return new RegExp(escapeRegex(q), 'gi');
  }
  // Match stem + 0-3 hiragana characters (covers inflections)
  return new RegExp(
    escapeRegex(stem) + '[぀-ゟ]{0,3}',
    'gi'
  );
}

function findSnippets(
  text: string,
  query: string,
  useInflection: boolean,
  maxSnippets = 3
): string[] {
  if (!text || !query) return [];
  const rx = useInflection
    ? buildInflectionRegex(query)
    : new RegExp(escapeRegex(query), 'gi');
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null && snippets.length < maxSnippets) {
    const start = Math.max(0, m.index - SNIPPET_CONTEXT);
    const end = Math.min(text.length, m.index + m[0].length + SNIPPET_CONTEXT);
    const pre = start > 0 ? '…' : '';
    const post = end < text.length ? '…' : '';
    snippets.push(pre + text.slice(start, end) + post);
    if (m.index === rx.lastIndex) rx.lastIndex++;
  }
  return snippets;
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [includeBodies, setIncludeBodies] = useState(false);
  const [useInflection, setUseInflection] = useState(false);
  const [vocabIdx, setVocabIdx] = useState<VocabIndex | null>(null);
  const [lemmaGroup, setLemmaGroup] = useState<LemmaGroupMap>({});
  const [examples, setExamples] = useState<Example[]>([]);
  const [texts, setTexts] = useState<TextIndexEntry[]>([]);
  const [bodies, setBodies] = useState<TextBody[] | null>(null);
  const [bodiesLoading, setBodiesLoading] = useState(false);
  const [openVocabLemma, setOpenVocabLemma] = useState<string | null>(null);
  const bodiesRef = useRef<TextBody[] | null>(null);

  useEffect(() => {
    setVocabIdx(bundledVocabIndex as VocabIndex);
    setTexts(bundledTextsIndex as TextIndexEntry[]);
    const map: LemmaGroupMap = {};
    for (const row of bundledKobunQ as Array<{ lemma?: string; group?: number }>) {
      if (row.lemma && row.group && !(row.lemma in map)) {
        map[row.lemma] = row.group;
      }
    }
    setLemmaGroup(map);
    fetch('/examples.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setExamples);
  }, []);

  useEffect(() => {
    if (!includeBodies || bodiesRef.current) return;
    if (texts.length === 0) return;
    setBodiesLoading(true);
    Promise.all(
      texts.map((t) =>
        fetch(`/texts/${t.slug}.json`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) return null;
            return {
              slug: t.slug,
              title: d.title,
              source_work: d.source_work,
              genre: d.genre,
              original: d.sections?.['本文'] || '',
              translation: d.sections?.['現代語訳'] || '',
            } as TextBody;
          })
          .catch(() => null)
      )
    ).then((arr) => {
      const filtered = arr.filter((x): x is TextBody => !!x);
      bodiesRef.current = filtered;
      setBodies(filtered);
      setBodiesLoading(false);
    });
  }, [includeBodies, texts]);

  useEffect(() => {
    if (query) {
      const params: Record<string, string> = { q: query };
      if (includeBodies) params.bodies = '1';
      setSearchParams(params, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [query, includeBodies, setSearchParams]);

  useEffect(() => {
    // Restore "bodies" param from URL on mount
    if (searchParams.get('bodies') === '1') setIncludeBodies(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 検索結果から個別単語/教材へ飛んだあとブラウザ戻るで復帰した際に
  // 直前のスクロール位置を復元する。query をキーにしているので、
  // 別の語を検索しに来たときには復元しない。
  const scrollRestoredRef = useRef(false);
  useLayoutEffect(() => {
    if (scrollRestoredRef.current) return;
    if (!query) return;
    if (!vocabIdx) return;
    const raw = sessionStorage.getItem(SEARCH_SCROLL_KEY);
    if (!raw) return;
    try {
      const { q: savedQ, y } = JSON.parse(raw);
      if (savedQ !== query) return;
      if (typeof y !== 'number' || y <= 0) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
          scrollRestoredRef.current = true;
        });
      });
    } catch {
      /* ignore */
    }
  }, [query, vocabIdx]);

  // 現在の query と一緒にスクロール位置を保存する
  useEffect(() => {
    let pending = false;
    const save = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!query) return;
        try {
          sessionStorage.setItem(
            SEARCH_SCROLL_KEY,
            JSON.stringify({ q: query, y: window.scrollY })
          );
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [query]);

  const results = useMemo(() => {
    if (!query || query.length < 1) {
      return { vocab: [], examples: [], texts: [], bodies: [] as Array<{text: TextBody; origSnippets: string[]; transSnippets: string[]}> };
    }
    const q = query.trim().toLowerCase();
    const inflectionRe = useInflection ? buildInflectionRegex(q) : null;
    const matchesQuery = (text: string): boolean => {
      if (!text) return false;
      if (inflectionRe) {
        inflectionRe.lastIndex = 0;
        return inflectionRe.test(text);
      }
      return text.toLowerCase().includes(q);
    };

    const vocabMatches = vocabIdx
      ? Object.entries(vocabIdx)
          .filter(([lemma, v]) => matchesQuery(lemma) || matchesQuery(v.title))
          .slice(0, MAX_RESULTS)
          .map(([lemma, v]) => ({ lemma, ...v, group: lemmaGroup[lemma] }))
      : [];

    const exampleMatches = examples
      .filter((e) => matchesQuery(e.sentence) || matchesQuery(e.meaning))
      .slice(0, MAX_RESULTS);

    const textMatches = texts
      .filter(
        (t) =>
          matchesQuery(t.title) ||
          matchesQuery(t.source_work) ||
          matchesQuery(t.genre)
      )
      .slice(0, MAX_RESULTS);

    const bodyMatches: Array<{ text: TextBody; origSnippets: string[]; transSnippets: string[] }> = [];
    if (includeBodies && bodies) {
      for (const b of bodies) {
        const origSnippets = findSnippets(b.original, query, useInflection);
        const transSnippets = findSnippets(b.translation, query, useInflection);
        if (origSnippets.length > 0 || transSnippets.length > 0) {
          bodyMatches.push({ text: b, origSnippets, transSnippets });
        }
        if (bodyMatches.length >= MAX_RESULTS) break;
      }
    }

    return {
      vocab: vocabMatches,
      examples: exampleMatches,
      texts: textMatches,
      bodies: bodyMatches,
    };
  }, [query, vocabIdx, examples, texts, bodies, includeBodies, useInflection, lemmaGroup]);

  const findTextBySource = (work: string): TextIndexEntry | null => {
    if (!work) return null;
    const key = work.trim();
    for (const t of texts) {
      if (t.title === key || t.source_work === key) return t;
    }
    const main = key.split(/[・･]/)[0].trim();
    for (const t of texts) {
      if (t.source_work && t.source_work.includes(main)) return t;
      if (t.title.includes(main)) return t;
    }
    return null;
  };

  const highlightText = (text: string): React.ReactNode => {
    if (!query) return text;
    const rx = useInflection
      ? buildInflectionRegex(query)
      : new RegExp(escapeRegex(query), 'gi');
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(<mark key={key++}>{m[0]}</mark>);
      last = m.index + m[0].length;
      if (m.index === rx.lastIndex) rx.lastIndex++;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const totalResults =
    results.vocab.length +
    results.examples.length +
    results.texts.length +
    results.bodies.length;

  return (
    <div className="search-page">
      {openVocabLemma && (
        <VocabModal
          lemma={openVocabLemma}
          onClose={() => setOpenVocabLemma(null)}
        />
      )}
      <div className="search-page-header">
        <Link to="/" className="back-link">← ホームへ</Link>
      </div>

      <div className="search-box">
        <input
          type="search"
          autoFocus
          placeholder="単語・例文・作品名・本文で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <label className="search-toggle">
        <input
          type="checkbox"
          checked={includeBodies}
          onChange={(e) => setIncludeBodies(e.target.checked)}
        />
        <span>教材本文も検索対象にする (初回 ~3MB をダウンロード)</span>
        {bodiesLoading && <span className="search-toggle-status">読込中…</span>}
      </label>
      <label className="search-toggle">
        <input
          type="checkbox"
          checked={useInflection}
          onChange={(e) => setUseInflection(e.target.checked)}
        />
        <span>
          活用形も検索 (例: 「あくがる」→「あくがれ」「あくがる」「あくがり」 …)
        </span>
      </label>

      {query && vocabIdx && (
        <div className="search-summary">
          <strong>{totalResults}</strong> 件見つかりました
          {totalResults === 0 && (
            <span className="search-none">
              {' '}
              (ヒットなし。本文検索を有効にする/ひらがなで試す など)
            </span>
          )}
        </div>
      )}

      {results.vocab.length > 0 && (
        <section className="search-section">
          <h2>
            単語 <span className="count">{results.vocab.length}</span>
          </h2>
          <ul className="result-list">
            {results.vocab.map((v: any) => {
              const ch = chapterFor(v.group);
              const c = chapterColor(ch);
              return (
                <li key={v.lemma}>
                  <button
                    type="button"
                    onClick={() => setOpenVocabLemma(v.lemma)}
                    className="result-link vocab"
                    style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', font: 'inherit' }}
                  >
                    <div className="result-main">
                      {v.group && (
                        <span className="group-num">{v.group}</span>
                      )}
                      {highlightText(v.title)}
                      {ch && (
                        <span
                          className="result-chapter-badge"
                          style={{ background: c.bg, color: c.text }}
                        >
                          {ch.short}
                        </span>
                      )}
                    </div>
                    <div className="result-meta">
                      {v.pos} · {v.category}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {results.examples.length > 0 && (
        <section className="search-section">
          <h2>
            例文 <span className="count">{results.examples.length}</span>
          </h2>
          <ul className="result-list">
            {results.examples.map((e, i) => {
              const linked = findTextBySource(e.source_work);
              const g = lemmaGroup[e.lemma];
              const ch = chapterFor(g);
              const c = chapterColor(ch);
              return (
                <li key={i}>
                  <div className="result-link example">
                    <div className="result-main">「{highlightText(e.sentence)}」</div>
                    <div className="result-meta">
                      {g && <span className="group-num small">{g}</span>}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setOpenVocabLemma(e.lemma);
                        }}
                        className="lemma-inline-link"
                      >
                        {e.lemma}
                      </button>
                      {ch && (
                        <span
                          className="result-chapter-badge"
                          style={{ background: c.bg, color: c.text }}
                        >
                          {ch.short}
                        </span>
                      )}
                      {e.meaning && ` — ${e.meaning}`}
                    </div>
                    {e.source_work && (
                      <div className="result-source">
                        出典:{' '}
                        {linked ? (
                          <Link to={`/texts/${linked.slug}?q=${encodeURIComponent(e.sentence.slice(0, 12))}`}>
                            {e.source_work} →
                          </Link>
                        ) : (
                          e.source_work
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {results.bodies.length > 0 && (
        <section className="search-section">
          <h2>
            本文中の出現 <span className="count">{results.bodies.length}</span>
          </h2>
          <ul className="result-list">
            {results.bodies.map(({ text, origSnippets, transSnippets }) => (
              <li key={text.slug}>
                <Link
                  to={`/texts/${text.slug}?q=${encodeURIComponent(query)}`}
                  className="result-link body"
                >
                  <div className="result-main">{text.title}</div>
                  <div className="result-meta">
                    {text.source_work}
                    {text.genre && ` · ${text.genre}`}
                  </div>
                  {origSnippets.map((s, i) => (
                    <div key={`o${i}`} className="result-snippet">
                      <span className="snippet-label">原文</span> {highlightText(s)}
                    </div>
                  ))}
                  {transSnippets.map((s, i) => (
                    <div key={`t${i}`} className="result-snippet translation">
                      <span className="snippet-label">訳</span> {highlightText(s)}
                    </div>
                  ))}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.texts.length > 0 && (
        <section className="search-section">
          <h2>
            教材タイトル <span className="count">{results.texts.length}</span>
          </h2>
          <ul className="result-list">
            {results.texts.map((t) => (
              <li key={t.id}>
                <Link to={`/texts/${t.slug}`} className="result-link text">
                  <div className="result-main">{highlightText(t.title)}</div>
                  <div className="result-meta">
                    {t.source_work}
                    {t.genre && ` · ${t.genre}`}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
