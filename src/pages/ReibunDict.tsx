import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAllReibun,
  fetchMeanings,
  meaningBadge,
  JODOSHI_ORDER,
} from "@/lib/kobun/reibunData";
import type { GrammarReibun, GrammarJodoshiMeaning } from "@/lib/kobun/types";
import { ReibunSentence, ReibunLegend } from "@/components/grammar/ReibunSentence";

export default function ReibunDict() {
  const [reibun, setReibun] = useState<GrammarReibun[]>([]);
  const [meanings, setMeanings] = useState<GrammarJodoshiMeaning[]>([]);
  const [jodoshi, setJodoshi] = useState<string>("けり");
  const [highOnly, setHighOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, m] = await Promise.all([fetchAllReibun(), fetchMeanings()]);
      if (!alive) return;
      setReibun(r);
      setMeanings(m);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 実在する助動詞だけタブに出す（例文集の順）
  const tabs = useMemo(
    () => JODOSHI_ORDER.filter((j) => reibun.some((x) => x.jodoshi === j)),
    [reibun]
  );

  // 選択中助動詞の意味セット
  const sections = useMemo(() => {
    return meanings
      .filter((m) => m.jodoshi === jodoshi)
      .map((m) => ({
        meaning: m,
        examples: reibun
          .filter((x) => x.meaningKey === m.meaningKey)
          .filter((x) => (highOnly ? x.confidence === "high" && x.verified : true)),
      }))
      .filter((s) => s.examples.length > 0);
  }, [meanings, reibun, jodoshi, highOnly]);

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-2">
          <Link to="/read/grammar" className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← 戻る
          </Link>
          <h1 className="text-[22px] sm:text-2xl font-black text-rw-ink tracking-tight">助動詞 例文事典</h1>
        </div>
        <div className="mb-5">
          <p className="text-[12px] text-rw-ink-soft mb-1.5 leading-relaxed">意味ごとの「決め手」と、出典つきの本文用例。</p>
          <ReibunLegend />
        </div>

        {/* 助動詞タブ */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {tabs.map((j) => {
            const active = jodoshi === j;
            return (
              <button
                key={j}
                onClick={() => setJodoshi(j)}
                className={`px-3.5 py-2 rounded-full text-xs font-extrabold transition-colors ${
                  active ? "bg-rw-ink text-rw-paper" : "bg-rw-paper text-rw-ink-soft border border-rw-rule hover:text-rw-ink"
                }`}
                style={active ? { boxShadow: "0 2px 0 var(--rw-primary)" } : undefined}
              >
                {j}
              </button>
            );
          })}
        </div>

        {/* 腕試し導線 */}
        <div className="flex gap-2 mb-4">
          <Link
            to={`/read/grammar/reibun/quiz?j=${encodeURIComponent(jodoshi)}`}
            className="flex-1 text-center py-2.5 rounded-xl bg-rw-ink text-rw-paper text-xs font-black"
            style={{ boxShadow: "0 2px 0 var(--rw-primary)" }}
          >
            ⚔️「{jodoshi}」で意味判別
          </Link>
          <Link
            to="/read/grammar/reibun/quiz?j=mix"
            className="flex-1 text-center py-2.5 rounded-xl bg-rw-paper border-2 border-rw-ink text-rw-ink text-xs font-black"
          >
            🎲 全部混合で腕試し
          </Link>
        </div>

        {/* 確信度フィルタ */}
        <label className="flex items-center gap-2 mb-5 text-[12px] text-rw-ink-soft cursor-pointer select-none">
          <input type="checkbox" checked={highOnly} onChange={(e) => setHighOnly(e.target.checked)} />
          確実な例（出題対象）のみ表示
        </label>

        {loading ? (
          <p className="text-scaffold">読み込み中…</p>
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map(({ meaning, examples }) => (
              <section key={meaning.meaningKey}>
                <h2 className="text-[15px] font-black text-rw-ink mb-1">
                  {meaning.meaning}
                  <span className="ml-2 text-[11px] font-bold text-rw-ink-soft">{examples.length}例</span>
                </h2>
                {/* 決め手の総則 */}
                <details className="mb-3 bg-rw-paper border border-rw-rule rounded-xl px-3 py-2">
                  <summary className="text-[11px] font-black text-rw-ink-soft cursor-pointer">🔑 決め手の総則</summary>
                  <p className="text-[12px] text-rw-ink leading-relaxed mt-1.5">{meaning.deciderRule}</p>
                </details>

                {/* 例カード */}
                <div className="flex flex-col gap-2.5">
                  {examples.map((e) => {
                    return (
                      <div key={e.id} className="bg-rw-paper border-2 border-rw-ink rounded-2xl px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[15px] text-rw-ink leading-relaxed flex-1">
                            <ReibunSentence text={e.sentence} cues={e.cues} />
                          </p>
                          <span
                            className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-rw-ink text-rw-paper flex-shrink-0"
                            title={e.meaning}
                          >
                            {meaningBadge(e.meaning)}
                          </span>
                        </div>
                        <p className="text-[12px] text-rw-ink-soft mt-1.5 leading-relaxed">{e.translation}</p>
                        {e.context && (
                          <p className="text-[12px] text-rw-ink mt-2 leading-relaxed">
                            <span className="font-black text-[11px]">📖 場面</span>　{e.context}
                          </p>
                        )}
                        {e.decider && (
                          <p className="text-[12px] text-rw-ink-soft mt-1.5 leading-relaxed">
                            <span className="font-black text-[11px]">🔑 決め手</span>　{e.decider}
                          </p>
                        )}
                        <p className="text-[11px] text-rw-ink-soft mt-2">
                          ─ {e.source}
                          {e.period ? `／${e.period}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
