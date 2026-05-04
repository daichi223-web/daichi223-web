import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublishedSlugs } from '../lib/textPublications';
import { hasFullAccess } from '../lib/fullAccess';
import bundledTextsIndex from '../data/textsIndex.json';
import './TextDetail.css';

type TextIndexEntry = {
  id: string;
  slug: string;
  title: string;
  source_work: string;
  genre: string;
  tags: string[];
  textbook: string;
  chapter: number | null;
  has_text: boolean;
  has_translation: boolean;
  author?: string;
  era?: string;
};

const ERA_ORDER = ['奈良', '平安', '鎌倉', '室町', '江戸', '近代'];

export default function TextsIndex() {
  const [index] = useState<TextIndexEntry[]>(bundledTextsIndex as TextIndexEntry[]);
  const [query, setQuery] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterEra, setFilterEra] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [publishedSet, setPublishedSet] = useState<Set<string> | null>(null);

  useEffect(() => {
    getPublishedSlugs().then((s) => setPublishedSet(s));
  }, []);

  const genres = useMemo(() => {
    if (!index) return [];
    const s = new Set<string>();
    for (const t of index) if (t.genre) s.add(t.genre);
    return Array.from(s).sort();
  }, [index]);

  const eras = useMemo(() => {
    if (!index) return [];
    const s = new Set<string>();
    for (const t of index) if (t.era) s.add(t.era);
    return ERA_ORDER.filter((e) => s.has(e)).concat(
      Array.from(s).filter((e) => !ERA_ORDER.includes(e))
    );
  }, [index]);

  const authors = useMemo(() => {
    if (!index) return [];
    const counts: Record<string, number> = {};
    for (const t of index) {
      if (t.author && t.author !== '不明') {
        counts[t.author] = (counts[t.author] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [index]);

  const filtered = useMemo(() => {
    if (!index) return [];
    const fullAccess = hasFullAccess();
    return index.filter((t) => {
      // When publishedSet is a Set (=table exists), hide non-published texts
      if (!fullAccess && publishedSet && !publishedSet.has(t.slug)) return false;
      if (filterGenre && t.genre !== filterGenre) return false;
      if (filterEra && t.era !== filterEra) return false;
      if (filterAuthor && t.author !== filterAuthor) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.source_work.toLowerCase().includes(q) ||
          (t.author || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [index, query, filterGenre, filterEra, filterAuthor]);

  return (
    <div className="text-detail">
      <div className="text-detail-header">
        <Link to="/" className="back-link">← ホームへ</Link>
      </div>
      <div className="text-detail-title-block">
        <h1>古文教材一覧</h1>
        <div className="text-detail-meta">
          <span className="meta-chip">
            {index ? `${filtered.length} / ${index.length}本` : '読み込み中'}
          </span>
          {publishedSet && (
            <span className="meta-chip" style={{ fontSize: '0.72rem' }}>
              公開管理ON
            </span>
          )}
        </div>
      </div>

      <div className="texts-index-filters">
        <input
          type="search"
          placeholder="タイトル・作品・作者で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="texts-index-search"
        />
        <select
          value={filterEra}
          onChange={(e) => setFilterEra(e.target.value)}
          className="texts-index-filter"
        >
          <option value="">全時代</option>
          {eras.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={filterGenre}
          onChange={(e) => setFilterGenre(e.target.value)}
          className="texts-index-filter"
        >
          <option value="">全ジャンル</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={filterAuthor}
          onChange={(e) => setFilterAuthor(e.target.value)}
          className="texts-index-filter"
        >
          <option value="">全作者</option>
          {authors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {!index && <div className="text-detail-loading">読み込み中…</div>}
      {index && filtered.length === 0 && (
        <div className="text-detail-loading">該当する教材がありません</div>
      )}

      <div className="texts-index-grid">
        {filtered.map((t) => (
          <Link key={t.id} to={`/texts/${t.slug}`} className="text-card">
            <div className="text-card-title">{t.title}</div>
            <div className="text-card-source">
              {t.source_work}
              {t.author && t.author !== '不明' && (
                <span className="text-card-author"> · {t.author}</span>
              )}
            </div>
            <div className="text-card-badges">
              {t.era && <span className="text-card-badge era">{t.era}</span>}
              {t.genre && <span className="text-card-badge">{t.genre}</span>}
              {t.textbook && <span className="text-card-badge sub">{t.textbook}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
