import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { getVocabEntries, removeVocabEntry, type VocabEntry } from "@/lib/kobun/progress";
import { getWordStats } from "@/lib/wordStats";
import bundledKobunQ from "@/data/kobunQ.json";
import bundledVocabIndex from "@/data/vocabIndex.json";
import { getQuizQidsForLemma } from "@/lib/vocabLookup";
import VocabModal from "@/components/VocabModal";

const vocabIndexKeys = new Set(Object.keys(bundledVocabIndex as Record<string, unknown>));

// baseForm + pos → qids[] の逆引き索引 (1 baseForm に複数 sense あり得るため)
type LemmaPosToQids = Record<string, string[]>;
function buildLemmaPosIndex(): LemmaPosToQids {
  const map: LemmaPosToQids = {};
  for (const w of bundledKobunQ as Array<{ qid: string; lemma: string; pos?: string }>) {
    if (!w?.qid || !w?.lemma) continue;
    const key = `${w.lemma}:${w.pos ?? ''}`;
    (map[key] ??= []).push(w.qid);
    // pos 不一致でも lemma だけで引けるフォールバック
    const fallback = `${w.lemma}:`;
    if (key !== fallback) {
      (map[fallback] ??= []).push(w.qid);
    }
  }
  return map;
}

type EntryStat = { correct: number; incorrect: number; lastSeen: string | null };

export default function VocabPage() {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [statsByEntry, setStatsByEntry] = useState<Record<string, EntryStat>>({});
  const [vocabLemma, setVocabLemma] = useState<string | null>(null);

  const lemmaPosIndex = useMemo(buildLemmaPosIndex, []);

  useEffect(() => {
    setEntries(getVocabEntries());
  }, []);

  // word_stats を取得して baseForm:pos → 集計 にマップ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await getWordStats();
        if (cancelled) return;
        const out: Record<string, EntryStat> = {};
        for (const e of entries) {
          const qidsExact = lemmaPosIndex[`${e.baseForm}:${e.pos}`] ?? [];
          const qidsFallback = lemmaPosIndex[`${e.baseForm}:`] ?? [];
          const qids = qidsExact.length > 0 ? qidsExact : qidsFallback;
          let correct = 0;
          let incorrect = 0;
          let last: string | null = null;
          for (const qid of qids) {
            const s = stats[qid];
            if (!s) continue;
            correct += s.correct;
            incorrect += s.incorrect;
            if (!last || s.lastSeen > last) last = s.lastSeen;
          }
          out[`${e.baseForm}:${e.pos}`] = { correct, incorrect, lastSeen: last };
        }
        setStatsByEntry(out);
      } catch {
        // silent fail (ログイン無し / オフライン)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, lemmaPosIndex]);

  const handleRemove = (baseForm: string, pos: string) => {
    removeVocabEntry(baseForm, pos);
    setEntries(getVocabEntries());
  };

  const grouped = entries.reduce<Record<string, VocabEntry[]>>((acc, e) => {
    (acc[e.pos] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-7">
          <Link
            to="/read"
            className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 戻る
          </Link>
          <h1 className="mt-3 text-[30px] font-black tracking-tight text-rw-ink leading-none">
            単語帳
          </h1>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2">
            {entries.length === 0
              ? "テキスト中の語をタップして「単語帳に追加」すると、ここに表示されます。"
              : `${entries.length}語を登録中`}
          </p>
        </header>

        {entries.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center px-6">
            <div className="text-6xl mb-4" aria-hidden="true">
              📚
            </div>
            <p className="text-base font-bold text-rw-ink leading-relaxed">
              まだ単語が登録されていません
            </p>
            <p className="text-sm text-rw-ink-soft mt-2 leading-relaxed">
              テキスト中の語をタップして登録しよう
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([pos, items]) => (
            <section key={pos} className="mb-7">
              <div className="mb-3">
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-extrabold tracking-wide"
                  style={{
                    background: "var(--rw-primary-soft)",
                    color: "var(--rw-primary)",
                  }}
                >
                  {pos}
                </span>
              </div>
              <div className="space-y-2.5">
                {items.map((entry) => (
                  <div
                    key={`${entry.baseForm}:${entry.pos}`}
                    className="bg-rw-paper border border-rw-rule rounded-2xl p-4 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[19px] font-bold text-rw-ink leading-tight">
                          {entry.baseForm}
                        </span>
                        {entry.tokenText !== entry.baseForm && (
                          <span className="text-sm text-rw-ink-soft font-semibold">
                            ({entry.tokenText})
                          </span>
                        )}
                      </div>
                      {entry.hint && (
                        <p
                          className="text-sm text-rw-ink rounded-lg px-2.5 py-1.5 mt-2 font-medium leading-relaxed"
                          style={{
                            background: "color-mix(in srgb, var(--rw-pop) 30%, transparent)",
                          }}
                        >
                          {entry.hint}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                        {entry.grammarRefId && (
                          <Link
                            to={`/read/reference/${entry.grammarRefId}`}
                            className="text-xs font-extrabold text-rw-primary hover:underline"
                          >
                            解説 →
                          </Link>
                        )}
                        {entry.textId && (
                          <Link
                            to={`/read/texts/${entry.textId}`}
                            className="text-[11px] font-semibold text-rw-ink-soft hover:text-rw-ink hover:underline"
                            title={`${entry.textId} の本文を開く`}
                          >
                            📖 {entry.textId} →
                          </Link>
                        )}
                        {(() => {
                          const stat = statsByEntry[`${entry.baseForm}:${entry.pos}`];
                          if (!stat || stat.correct + stat.incorrect === 0) return null;
                          const total = stat.correct + stat.incorrect;
                          const accuracy = Math.round((stat.correct / total) * 100);
                          const tone =
                            accuracy >= 80
                              ? 'var(--rw-accent)'
                              : accuracy >= 50
                              ? 'var(--rw-pop)'
                              : 'var(--rw-primary)';
                          return (
                            <span
                              className="text-[11px] font-extrabold rounded-full px-2 py-0.5"
                              style={{
                                background: 'color-mix(in srgb, ' + tone + ' 18%, transparent)',
                                color: tone,
                              }}
                              title={`正解 ${stat.correct} / 誤答 ${stat.incorrect}`}
                            >
                              {accuracy}% ({total}回)
                            </span>
                          );
                        })()}
                      </div>
                      {/* アクションボタン: 詳細解説 / クイズ */}
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {vocabIndexKeys.has(entry.baseForm) && (
                          <button
                            onClick={() => setVocabLemma(entry.baseForm)}
                            className="text-[11px] font-black px-3 py-1 rounded-full border-2 transition-colors"
                            style={{
                              background: 'color-mix(in srgb, var(--layer-5) 8%, transparent)',
                              borderColor: 'color-mix(in srgb, var(--layer-5) 30%, transparent)',
                              color: 'var(--layer-5)',
                            }}
                          >
                            📖 詳しく
                          </button>
                        )}
                        {(() => {
                          const qids = getQuizQidsForLemma(entry.baseForm, entry.pos);
                          if (qids.length === 0) return null;
                          return (
                            <Link
                              to={`/?qid=${encodeURIComponent(qids.join(','))}`}
                              className="text-[11px] font-black px-3 py-1 rounded-full border-2 no-underline transition-colors"
                              style={{
                                background: 'color-mix(in srgb, var(--rw-pop) 25%, transparent)',
                                borderColor: 'var(--rw-pop)',
                                color: 'var(--rw-ink)',
                              }}
                              title={`「${entry.baseForm}」のクイズに挑戦 (${qids.length}問)`}
                            >
                              🔤 クイズ
                            </Link>
                          );
                        })()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(entry.baseForm, entry.pos)}
                      className="text-xs font-bold text-rw-ink-soft hover:text-rw-primary transition-colors shrink-0"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      {vocabLemma && (
        <VocabModal lemma={vocabLemma} onClose={() => setVocabLemma(null)} />
      )}
    </div>
  );
}
