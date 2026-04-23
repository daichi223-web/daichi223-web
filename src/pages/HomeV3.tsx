import { Link } from "react-router-dom";
import { loadAllProgress } from "@/lib/kobun/progress";
import { getGemBaseUrl } from "@/lib/kobun/gem";
import { useState, useEffect } from "react";
import type { ReadingProgress } from "@/lib/kobun/types";

/** public/texts-v3/index.json の1エントリ */
interface TextIndexEntry {
  id: string;
  title: string;
  source: string;
  genre?: string;
  difficulty?: number;
  author?: string;
  era?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  sentenceCount?: number;
  tokenCount?: number;
  hasGuide?: boolean;
  hasQuestions?: boolean;
}

interface TextListItem {
  id: string;
  title: string;
  source: string;
  difficulty: number;
  totalLayers: number;
}

const grammarCategories = [
  { label: "用言", href: "/reference?cat=yougen", layer: 1 },
  { label: "助動詞", href: "/reference?cat=jodoshi", layer: 2 },
  { label: "助詞", href: "/reference?cat=joshi", layer: 3 },
  { label: "敬語", href: "/reference?cat=keigo", layer: 4 },
];

const layerBgColors: Record<number, string> = {
  1: "bg-layer-1",
  2: "bg-layer-2",
  3: "bg-layer-3",
  4: "bg-layer-4",
  5: "bg-layer-5",
};

export default function HomeV3() {
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [texts, setTexts] = useState<TextListItem[]>([]);

  useEffect(() => {
    setProgress(loadAllProgress());
  }, []);

  useEffect(() => {
    fetch("/texts-v3/index.json")
      .then((r) => r.json())
      .then((data: TextIndexEntry[]) => {
        setTexts(
          data.map((t) => ({
            id: t.id,
            title: t.title,
            source: t.source,
            difficulty: typeof t.difficulty === "number" ? t.difficulty : 1,
            totalLayers: 5,
          }))
        );
      })
      .catch(() => {
        setTexts([]);
      });
  }, []);

  return (
    <div className="min-h-dvh flex flex-col items-center p-6">
      {/* ヘッダー */}
      <div className="text-center space-y-2 mb-10 mt-8">
        <h1 className="text-3xl font-bold tracking-wide">古文読み</h1>
        <p className="text-sm opacity-60">
          テキストから始まり、テキストに戻る
        </p>
      </div>

      {/* テキスト一覧 */}
      <section className="w-full max-w-lg space-y-3 mb-10">
        <h2 className="text-sm font-bold text-scaffold uppercase tracking-wider">
          テキスト
        </h2>
        {texts.map((t) => {
          const p = progress[t.id];
          const currentLayer = p?.currentLayer ?? 1;
          const isStarted = !!p;
          const linkLayer = isStarted ? currentLayer : 1;

          return (
            <div
              key={t.id}
              className="bg-white/60 backdrop-blur rounded-xl p-5 shadow-sm border border-sumi/5"
            >
              <Link
                to={`/texts/${t.id}?layer=${linkLayer}`}
                className="block hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">{t.title}</h3>
                    <p className="text-xs opacity-50">{t.source}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {/* Layer進捗ドット */}
                      <div className="flex gap-1">
                        {Array.from({ length: t.totalLayers }, (_, i) => i + 1).map(
                          (layer) => (
                            <span
                              key={layer}
                              className={`h-5 rounded-full text-[10px] font-bold flex items-center justify-center
                                ${layer === 5 ? "px-1.5" : "w-5"}
                                ${
                                  p?.completedLayers?.includes(layer as 1 | 2 | 3 | 4 | 5)
                                    ? `${layerBgColors[layer]} text-white`
                                    : currentLayer === layer
                                    ? `border-2 border-current ${layerBgColors[layer]?.replace("bg-", "text-")}`
                                    : "bg-sumi/5 text-sumi/20"
                                }`}
                            >
                              {layer === 5 ? "読" : layer}
                            </span>
                          )
                        )}
                      </div>
                      <span className="text-xs text-scaffold">
                        {isStarted
                          ? `Layer ${currentLayer} / ${t.totalLayers}`
                          : "未着手"}
                      </span>
                    </div>
                  </div>
                  <span className="text-sumi/30 text-xl">&rsaquo;</span>
                </div>
              </Link>
              <div className="mt-3 pt-3 border-t border-sumi/5">
                <Link
                  to={`/texts/${t.id}/guide`}
                  className="text-xs font-bold text-scaffold hover:text-sumi transition-colors"
                >
                  解説を読む →
                </Link>
              </div>
            </div>
          );
        })}
      </section>

      {/* 文法リファレンス */}
      <section className="w-full max-w-lg space-y-3 mb-10">
        <h2 className="text-sm font-bold text-scaffold uppercase tracking-wider">
          文法リファレンス
        </h2>
        <div className="flex gap-2 flex-wrap">
          {grammarCategories.map((cat) => (
            <Link
              key={cat.label}
              to={cat.href}
              className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 ${layerBgColors[cat.layer]}`}
            >
              {cat.label}
            </Link>
          ))}
        </div>
      </section>

      {/* 単語帳 */}
      <section className="w-full max-w-lg space-y-3 mb-10">
        <Link
          to="/vocab"
          className="block w-full text-center px-4 py-3 rounded-lg border border-sumi/20 font-bold hover:bg-sumi/5 transition-colors"
        >
          単語帳
        </Link>
      </section>

      {/* 先生AIリンク */}
      <section className="w-full max-w-lg">
        <a
          href={getGemBaseUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center px-4 py-3 rounded-lg bg-shu text-white font-bold hover:bg-shu/90 transition-colors"
        >
          先生AIに聞く
        </a>
      </section>
    </div>
  );
}
