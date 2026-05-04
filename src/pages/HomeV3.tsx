import { Link } from "react-router-dom";
import { loadAllProgress } from "@/lib/kobun/progress";
import { getGemBaseUrl } from "@/lib/kobun/gem";
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import type { ReadingProgress } from "@/lib/kobun/types";
import { getPublishedSlugs } from "@/lib/textPublications";
import { hasFullAccess } from "@/lib/fullAccess";
import bundledTextsIndex from "@/data/textsIndex.json";

const HOME_SCROLL_KEY = "kobun-home-scroll-v1";

interface TextIndexEntry {
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
  hintCoverage?: number;
}

const ERA_ORDER = ["奈良", "平安", "鎌倉", "室町", "江戸", "近代"];
const ERA_OTHER = "その他";

const GENRE_ORDER = [
  "物語",
  "日記",
  "随筆",
  "説話",
  "評論",
  "和歌・歌謡・俳諧",
  "俳論・俳文",
  "芸能",
  "小説",
  "伝承",
];
const GENRE_OTHER = "その他";

// 物語（一）／随筆（二）等の末尾連番を取り除いて基底ジャンルに寄せる
function normalizeGenre(raw: string): string {
  if (!raw) return GENRE_OTHER;
  const base = raw.replace(/（[^）]*）$/, "").trim();
  return base || GENRE_OTHER;
}

function normalizeEra(raw: string | undefined): string {
  if (!raw) return ERA_OTHER;
  return ERA_ORDER.includes(raw) ? raw : ERA_OTHER;
}

const grammarCategories = [
  { label: "用言", href: "/read/reference?cat=yougen", layer: 1 },
  { label: "助動詞", href: "/read/reference?cat=jodoshi", layer: 2 },
  { label: "助詞", href: "/read/reference?cat=joshi", layer: 3 },
  { label: "敬語", href: "/read/reference?cat=keigo", layer: 4 },
];

const layerBgColors: Record<number, string> = {
  1: "bg-layer-1",
  2: "bg-layer-2",
  3: "bg-layer-3",
  4: "bg-layer-4",
  5: "bg-layer-5",
};

// レイヤー番号 (L1〜L5) のテキスト色用 CSS variable 参照。
// 動的なクラス名は Tailwind の purge を通らないので inline style で参照する。
const layerVar: Record<number, string> = {
  1: "var(--layer-1)",
  2: "var(--layer-2)",
  3: "var(--layer-3)",
  4: "var(--layer-4)",
  5: "var(--layer-5)",
};

export default function HomeV3() {
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [index] = useState<TextIndexEntry[]>(bundledTextsIndex as TextIndexEntry[]);
  const [publishedSet, setPublishedSet] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState("");
  const matrixWrapRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    setProgress(loadAllProgress());
    getPublishedSlugs().then((s) => setPublishedSet(s));
  }, []);

  // 検索/作品詳細から戻った際にスクロール位置を復元
  useLayoutEffect(() => {
    if (restoredRef.current) return;
    const raw = sessionStorage.getItem(HOME_SCROLL_KEY);
    if (!raw) return;
    try {
      const { x, y, winY } = JSON.parse(raw);
      // 描画完了を待ってから復元 (matrix が render される時間を確保)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (matrixWrapRef.current) {
            if (typeof x === "number") matrixWrapRef.current.scrollLeft = x;
            if (typeof y === "number") matrixWrapRef.current.scrollTop = y;
          }
          if (typeof winY === "number") window.scrollTo(0, winY);
          restoredRef.current = true;
        });
      });
    } catch {
      /* ignore */
    }
  }, []);

  // matrix 横スクロールとページ縦スクロールを sessionStorage に書き戻す
  useEffect(() => {
    let pending = false;
    const save = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const wrap = matrixWrapRef.current;
        const payload = {
          x: wrap?.scrollLeft ?? 0,
          y: wrap?.scrollTop ?? 0,
          winY: window.scrollY,
        };
        try {
          sessionStorage.setItem(HOME_SCROLL_KEY, JSON.stringify(payload));
        } catch {
          /* quota exceeded etc. */
        }
      });
    };
    const wrap = matrixWrapRef.current;
    wrap?.addEventListener("scroll", save, { passive: true });
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      wrap?.removeEventListener("scroll", save);
      window.removeEventListener("scroll", save);
    };
  }, []);

  const filtered = useMemo(() => {
    const fullAccess = hasFullAccess();
    return index.filter((t) => {
      if (!fullAccess && publishedSet && !publishedSet.has(t.slug)) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.source_work.toLowerCase().includes(q) ||
          (t.author || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [index, publishedSet, query]);

  // 使われている時代・ジャンルだけを抽出し、定義順で並べる
  const { eras, genres, matrix } = useMemo(() => {
    const usedEras = new Set<string>();
    const usedGenres = new Set<string>();
    const m: Record<string, TextIndexEntry[]> = {};
    for (const t of filtered) {
      const e = normalizeEra(t.era);
      const g = normalizeGenre(t.genre);
      usedEras.add(e);
      usedGenres.add(g);
      const key = `${e} ${g}`;
      (m[key] ||= []).push(t);
    }
    const erasArr = [...ERA_ORDER, ERA_OTHER].filter((e) => usedEras.has(e));
    const genresArr = [...GENRE_ORDER, GENRE_OTHER].filter((g) =>
      usedGenres.has(g)
    );
    return { eras: erasArr, genres: genresArr, matrix: m };
  }, [filtered]);

  return (
    <div className="bg-rw-bg min-h-dvh text-rw-ink font-noto">
      {/* ヘッダ */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/"
            className="text-rw-ink-soft font-bold tracking-wider text-[11px] no-underline hover:underline"
          >
            ← 単語クイズへ
          </Link>
          <h1 className="text-rw-ink font-black text-[26px] mt-1 leading-tight tracking-[-0.04em]">
            古文読み
          </h1>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
          <span className="bg-rw-primary-soft text-rw-primary font-bold text-xs px-2.5 py-1 rounded-full">
            {`${filtered.length} / ${index.length}本`}
          </span>
          {publishedSet && (
            <span className="bg-rw-accent-soft text-rw-accent font-bold text-[10px] px-2 py-1 rounded-full">
              公開ON
            </span>
          )}
        </div>
      </div>

      {/* 検索バー */}
      <div className="px-[18px] pb-3">
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-rw-paper border-2 border-rw-ink rounded-2xl">
          <span className="text-sm" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            placeholder="タイトル・作品・作者で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none border-none text-[13px] font-medium text-rw-ink placeholder:text-rw-ink-soft placeholder:font-medium"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-rw-ink-soft px-5 py-10 text-center text-sm">
          該当する教材がありません
        </div>
      ) : (
        <>
          <div className="text-[10px] text-rw-ink-soft px-[22px] pb-1.5 sm:hidden">
            ← 横スクロールでジャンル切替 →
          </div>
          <div
            ref={matrixWrapRef}
            className="px-3 pb-3.5 overflow-x-auto"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div
              className="grid border-2 border-rw-ink rounded-2xl overflow-hidden"
              style={{
                gridTemplateColumns: `minmax(60px, max-content) repeat(${genres.length}, minmax(150px, 1fr))`,
                gap: 1,
                background: "var(--rw-rule)",
                width: "max-content",
                minWidth: "100%",
              }}
            >
              {/* 左上の空セル */}
              <div className="bg-rw-primary-soft" />
              {/* ジャンル見出し（横軸） */}
              {genres.map((g) => (
                <div
                  key={`hdr-${g}`}
                  className="bg-rw-primary-soft text-rw-primary font-black text-[10px] py-2 px-1.5 text-center whitespace-nowrap"
                >
                  {g}
                </div>
              ))}
              {/* 時代ごとの行 */}
              {eras.map((e) => (
                <div key={`row-${e}`} className="contents">
                  <div className="bg-rw-primary-soft text-rw-primary font-black text-[11px] py-2 px-1.5 flex items-center justify-center sticky left-0 z-[1]">
                    {e}
                  </div>
                  {genres.map((g) => {
                    const cell = matrix[`${e} ${g}`] || [];
                    return (
                      <div
                        key={`${e}-${g}`}
                        className="bg-rw-paper p-1.5 flex flex-col gap-1"
                        style={{ minHeight: 56 }}
                      >
                        {cell.map((t) => {
                          const p = progress[t.id];
                          const currentLayer = p?.currentLayer ?? 1;
                          const linkLayer = p ? currentLayer : 1;
                          const showBadge = (t.hintCoverage ?? 0) >= 50;
                          return (
                            <Link
                              key={t.id}
                              to={`/read/texts/${t.slug}?layer=${linkLayer}`}
                              className="block bg-rw-bg rounded-lg px-2 py-1.5 no-underline text-rw-ink hover:bg-rw-primary-soft/40 transition-colors"
                              style={{ border: "1.5px solid var(--rw-ink)" }}
                            >
                              <div className="font-black text-[11px] leading-tight flex items-center gap-1 flex-wrap">
                                <span>{t.title}</span>
                                {showBadge && (
                                  <span
                                    className="bg-rw-accent text-white text-[8px] font-bold px-1 rounded"
                                    title={`重要ポイント入り (${t.hintCoverage}%)`}
                                  >
                                    ✓
                                  </span>
                                )}
                              </div>
                              {(t.source_work || t.author) && (
                                <div className="text-[9px] text-rw-ink-soft mt-0.5 leading-tight">
                                  {t.source_work}
                                  {t.author && t.author !== "不明" && (
                                    <span> · {t.author}</span>
                                  )}
                                </div>
                              )}
                              <div
                                className="text-[8px] font-black mt-0.5 tracking-wide"
                                style={{ color: layerVar[currentLayer] ?? layerVar[1] }}
                              >
                                L{currentLayer}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 文法リファレンス */}
      <div className="px-[18px] pt-2 pb-1">
        <div className="text-[10px] font-black text-rw-ink-soft tracking-[1.5px] mb-2">
          文法リファレンス
        </div>
        <div className="flex flex-wrap gap-1.5">
          {grammarCategories.map((cat) => (
            <Link
              key={cat.label}
              to={cat.href}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black text-white no-underline hover:opacity-85 transition-opacity ${layerBgColors[cat.layer]}`}
            >
              {cat.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 単語帳 */}
      <div className="px-[18px] pt-3.5 pb-1.5">
        <Link
          to="/read/vocab"
          className="block w-full text-center px-3 py-3 bg-rw-paper border-2 border-rw-ink rounded-2xl text-sm font-black text-rw-ink no-underline hover:bg-rw-primary-soft/40 transition-colors"
        >
          📖 単語帳
        </Link>
      </div>

      {/* 先生AI (段差ボタン) */}
      <div className="px-[18px] pt-2 pb-6">
        <a
          href={getGemBaseUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center px-3.5 py-3.5 bg-rw-ink text-rw-paper rounded-2xl text-sm font-black tracking-wider no-underline hover:opacity-95 transition-opacity"
          style={{ boxShadow: "0 4px 0 var(--rw-primary)" }}
        >
          ✨ 先生AIに聞く
        </a>
      </div>
    </div>
  );
}
