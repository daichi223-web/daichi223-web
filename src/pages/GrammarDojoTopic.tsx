import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GrammarTopic, GrammarMedia, GrammarDrill, TopicProgress } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { fetchMedia, fetchDrills, markWatched, saveTopicResult, getAllTopicProgress } from "@/lib/kobun/dojoData";
import { computeDojoLevel } from "@/lib/kobun/dojoLevel";
import { VideoEmbed } from "@/components/grammar/VideoEmbed";
import { DrillSession, type DrillResult } from "@/components/grammar/DrillSession";

type Phase = "learn" | "drill" | "done";

/** 文法道場・単元ページ：講義動画 → 要点 → ドリル → 到達度。 */
export default function GrammarDojoTopic() {
  const { topicId } = useParams();
  const [topic, setTopic] = useState<GrammarTopic | null>(null);
  const [media, setMedia] = useState<GrammarMedia[]>([]);
  const [drills, setDrills] = useState<GrammarDrill[]>([]);
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("learn");
  const [result, setResult] = useState<DrillResult | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    setLoading(true);
    setPhase("learn");
    setResult(null);
    setLevelUp(null);
    Promise.all([
      fetchJsonAsset<GrammarTopic>(`/grammar/${topicId}.json`),
      fetchMedia(topicId),
      fetchDrills(topicId),
      getAllTopicProgress(),
    ]).then(([t, m, d, p]) => {
      if (cancelled) return;
      setTopic(t.ok ? t.data : null);
      setMedia(m);
      setDrills(d);
      setProgress(p);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const handleComplete = (r: DrillResult) => {
    setResult(r);
    setPhase("done");
    if (!topicId) return;
    const prev = progress[topicId];
    // 到達度は自己ベスト（一度上げた帯は剥奪しない → レベルも下がらない）
    const bestPct = Math.max(prev?.masteryPct ?? 0, r.masteryPct);
    const before = computeDojoLevel(progress).level;
    const next = {
      ...progress,
      [topicId]: {
        topicId,
        watched: prev?.watched ?? false,
        drillTotal: r.total,
        drillCorrect: r.correct,
        masteryPct: bestPct,
      },
    };
    setProgress(next);
    const after = computeDojoLevel(next).level;
    setLevelUp(after > before ? after : null);
    void saveTopicResult(topicId, {
      drillTotal: r.total,
      drillCorrect: r.correct,
      masteryPct: bestPct,
    });
  };

  if (!topicId) {
    return <div className="min-h-dvh bg-rw-bg p-6 text-rw-ink">単元が見つかりません</div>;
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-rw-bg flex items-center justify-center">
        <p className="text-rw-ink-soft">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-5">
        <div className="flex items-center gap-4 mb-5">
          <Link
            to="/read/grammar"
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 文法道場
          </Link>
        </div>

        <h1 className="text-2xl font-black tracking-tight text-rw-ink mb-1">
          {topic?.title ?? topicId}
        </h1>
        {topic?.summary && (
          <p className="text-sm text-rw-ink-soft mb-5 leading-relaxed">{topic.summary}</p>
        )}

        {phase === "learn" && (
          <>
            {/* 講義動画 */}
            {media.length > 0 && (
              <div className="mb-6 space-y-4">
                {media.map((m) => (
                  <VideoEmbed key={m.storagePath} media={m} onPlay={() => void markWatched(topicId)} />
                ))}
              </div>
            )}

            {/* 要点 */}
            {topic?.keyPoints && topic.keyPoints.length > 0 && (
              <div
                className="mb-4 p-4 rounded-2xl border-l-4"
                style={{ background: "var(--rw-primary-soft)", borderLeftColor: "var(--rw-primary)" }}
              >
                <h2 className="text-xs font-black tracking-wider text-rw-primary mb-2">ポイント</h2>
                <ul className="space-y-1.5">
                  {topic.keyPoints.map((p, i) => (
                    <li key={i} className="text-sm leading-relaxed text-rw-ink pl-4 relative before:content-['◆'] before:absolute before:left-0 before:text-rw-primary before:text-xs">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 覚える手順 */}
            {topic?.studySteps && topic.studySteps.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl border-l-4" style={{ background: "color-mix(in srgb, var(--rw-pop) 25%, transparent)", borderLeftColor: "var(--rw-pop)" }}>
                <h2 className="text-xs font-black tracking-wider text-rw-ink mb-2">覚える手順</h2>
                <ol className="space-y-1.5">
                  {topic.studySteps.map((s, i) => (
                    <li key={i} className="text-sm leading-relaxed flex gap-2 text-rw-ink">
                      <span className="shrink-0 w-5 h-5 rounded-full text-white text-[11px] font-black flex items-center justify-center mt-0.5" style={{ background: "var(--rw-ink)" }}>
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ドリル開始 */}
            {drills.length > 0 ? (
              <button
                onClick={() => setPhase("drill")}
                className="block w-full text-center bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-4 tracking-wider transition-transform hover:-translate-y-0.5"
                style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
              >
                ⚔️ ドリルを始める（{drills.length}問）
              </button>
            ) : (
              <div className="text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-6">
                <p className="text-sm text-rw-ink-soft">この単元のドリルは準備中です。</p>
              </div>
            )}

            <div className="mt-4 text-center">
              <Link to={`/read/reference/${topicId}`} className="text-xs font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
                📖 詳しい解説（リファレンス）→
              </Link>
            </div>
          </>
        )}

        {phase === "drill" && <DrillSession drills={drills} onComplete={handleComplete} />}

        {phase === "done" && result && (
          <div className="text-center">
            {levelUp !== null && (
              <div
                className="bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-4 mb-4 text-lg tracking-wider"
                style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
              >
                ⬆️ レベルアップ！ 道場 Lv.{levelUp}
              </div>
            )}
            <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-8 mb-5">
              <div className="text-5xl mb-3">{result.masteryPct >= 85 ? "🎉" : "📚"}</div>
              <p className="text-3xl font-black text-rw-ink">{result.masteryPct}%</p>
              <p className="text-sm text-rw-ink-soft mt-1">
                {result.correct} / {result.total} 正解
              </p>
              <p className="text-xs font-black mt-2 text-rw-primary">
                {result.masteryPct >= 85 ? "定着！" : "もう一度で定着を狙おう"}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setResult(null);
                  setPhase("drill");
                }}
                className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
                style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
              >
                もう一度
              </button>
              <Link
                to={`/read/reference/${topicId}`}
                className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors py-2"
              >
                📖 リファレンスで確認
              </Link>
              <Link
                to="/read/grammar"
                className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors py-1"
              >
                ← 文法道場へ戻る
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
