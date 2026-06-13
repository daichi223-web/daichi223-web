import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GrammarTopic, GrammarMedia, GrammarDrill, TopicProgress } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { fetchMedia, fetchDrills, markWatched, saveTopicResult, getAllTopicProgress, drillLevel } from "@/lib/kobun/dojoData";
import { computeDojoLevel } from "@/lib/kobun/dojoLevel";

const LEVEL_LABEL: Record<number, string> = {
  1: "Lv1 型",
  2: "Lv2 活用・識別",
  3: "Lv3 意味判別",
  4: "Lv4 文脈総合",
  5: "Lv5 難関",
};

/** レベル別到達度の保存キー（Lv1 は従来どおり topicId、Lv2以降はサフィックス付き） */
const levelKey = (topicId: string, level: number) => (level === 1 ? topicId : `${topicId}@${level}`);

/** 前のレベルを85%以上で定着させると次が解放される（存在するレベルの並び順で判定） */
function maxUnlockedLevel(
  lvls: number[],
  progress: Record<string, TopicProgress>,
  topicId: string
): number {
  let max = lvls[0] ?? 1;
  for (let i = 1; i < lvls.length; i++) {
    const prevKey = levelKey(topicId, lvls[i - 1]);
    if ((progress[prevKey]?.masteryPct ?? 0) >= 85) max = lvls[i];
    else break;
  }
  return max;
}

/** 1セッションで出題する問題数（各レベル約20問のバンクからシャッフルして抽出） */
const SESSION_SIZE = 6;
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
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
  const [selLevel, setSelLevel] = useState(1);
  const [sessionDrills, setSessionDrills] = useState<GrammarDrill[]>([]);

  // この単元に存在する難度レベルと、解放済み最大レベル（前レベル定着85%で解放）
  const levels = [1, 2, 3, 4, 5].filter((L) => drills.some((d) => drillLevel(d) === L));
  const isMastered = (key: string) => (progress[key]?.masteryPct ?? 0) >= 85;
  const unlockedMax = !topicId ? 1 : maxUnlockedLevel(levels, progress, topicId);
  const levelDrills = drills.filter((d) => drillLevel(d) === selLevel);
  const nextLevel = levels[levels.indexOf(selLevel) + 1];

  /** バンクからシャッフルしてセッション分を取り出し、ドリル開始 */
  const startDrill = (level: number) => {
    const pool = drills.filter((d) => drillLevel(d) === level);
    setSessionDrills(shuffle(pool).slice(0, SESSION_SIZE));
    setSelLevel(level);
    setResult(null);
    setPhase("drill");
  };

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
      // 解放済みの最高レベルを初期選択にする
      const lvls = [1, 2, 3, 4, 5].filter((L) => d.some((x) => drillLevel(x) === L));
      setSelLevel(maxUnlockedLevel(lvls, p as Record<string, TopicProgress>, topicId!));
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
    const key = levelKey(topicId, selLevel);
    const prev = progress[key];
    // 到達度は自己ベスト（一度上げた帯は剥奪しない → レベルも下がらない）
    const bestPct = Math.max(prev?.masteryPct ?? 0, r.masteryPct);
    const before = computeDojoLevel(progress).level;
    const next = {
      ...progress,
      [key]: {
        topicId: key,
        watched: prev?.watched ?? false,
        drillTotal: r.total,
        drillCorrect: r.correct,
        masteryPct: bestPct,
      },
    };
    setProgress(next);
    const after = computeDojoLevel(next).level;
    setLevelUp(after > before ? after : null);
    void saveTopicResult(key, {
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

  // ドリル中は iPhone 1 画面に収める専用レイアウト（上部の大見出しを出さない）
  if (phase === "drill") {
    return (
      <div className="h-dvh flex flex-col bg-rw-bg">
        <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0 px-4 pt-3 pb-3">
          <div className="flex items-center gap-3 mb-2 shrink-0">
            <button
              onClick={() => {
                setResult(null);
                setPhase("learn");
              }}
              className="text-xs font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
            >
              ← やめる
            </button>
            <span className="text-xs font-black text-rw-ink truncate min-w-0">{topic?.title ?? topicId}</span>
            {levels.length > 1 && (
              <span className="ml-auto shrink-0 text-[10px] font-black text-rw-paper bg-rw-primary px-2 py-0.5 rounded-full">
                {LEVEL_LABEL[selLevel]}
              </span>
            )}
          </div>
          <DrillSession drills={sessionDrills} onComplete={handleComplete} />
        </div>
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

            {/* 難度レベル選択（複数レベルがある単元のみ） */}
            {levels.length > 1 && (
              <div className="flex gap-2 mb-3">
                {levels.map((L) => {
                  const locked = L > unlockedMax;
                  const done85 = topicId ? isMastered(levelKey(topicId, L)) : false;
                  return (
                    <button
                      key={L}
                      disabled={locked}
                      onClick={() => setSelLevel(L)}
                      className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-black border-2 transition ${
                        locked
                          ? "bg-rw-bg border-rw-rule text-rw-ink-soft opacity-60 cursor-not-allowed"
                          : selLevel === L
                          ? "bg-rw-ink border-rw-ink text-rw-paper"
                          : "bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-ink-soft"
                      }`}
                    >
                      {locked ? "🔒 " : done85 ? "✅ " : ""}
                      {LEVEL_LABEL[L]}
                    </button>
                  );
                })}
              </div>
            )}
            {levels.length > 1 && nextLevel !== undefined && unlockedMax === selLevel && (
              <p className="text-[11px] text-rw-ink-soft mb-3 text-center">
                85%以上で定着すると次のレベルが解放される
              </p>
            )}

            {/* ドリル開始 */}
            {levelDrills.length > 0 ? (
              <button
                onClick={() => startDrill(selLevel)}
                className="block w-full text-center bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-4 tracking-wider transition-transform hover:-translate-y-0.5"
                style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
              >
                ⚔️ {levels.length > 1 ? `${LEVEL_LABEL[selLevel]} を始める` : "ドリルを始める"}（{Math.min(SESSION_SIZE, levelDrills.length)}問・シャッフル）
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
              {/* 定着して次レベルが解放されたら、その場で挑戦できる */}
              {nextLevel !== undefined && unlockedMax >= nextLevel && (
                <button
                  onClick={() => startDrill(nextLevel)}
                  className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
                  style={{ boxShadow: "0 4px 0 var(--rw-primary)" }}
                >
                  🔓 {LEVEL_LABEL[nextLevel]} に挑戦
                </button>
              )}
              <button
                onClick={() => startDrill(selLevel)}
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
