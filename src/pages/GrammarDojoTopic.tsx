import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { GrammarTopic, GrammarMedia, GrammarDrill, TopicProgress } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import {
  fetchMedia, fetchDrills, fetchDojoTopicLevels, markWatched, saveTopicResult, getAllTopicProgressOrThrow, drillLevel,
} from "@/lib/kobun/dojoData";
import { getWordStats } from '@/lib/wordStats';
import { pickQuestions, type ItemStat } from '@/lib/quizSelector';
import { computeDojoLevel } from "@/lib/kobun/dojoLevel";
import { logEvent } from "@/lib/learningEvents";
import { nextTopicId } from "@/lib/kobun/curriculum";
import { fillFromUpperLevel } from "@/lib/kobun/drillSupport";
import { levelKey, initialLevel, MASTERY_PCT } from "@/lib/kobun/topicLevels";
import { writeDojoLastTopic } from "@/lib/kobun/dojoLocal";
import { dojoBack, safeDojoBackPath, topicUrlWithBack, referenceUrlFromTopic } from "@/lib/returnTo";
import { QuizBackground } from "@/components/quiz/QuizBackground";
import { QUIZ_BACKGROUND_COLORS, useQuizBackground, useQuizBackgroundColor } from "@/lib/quizBackground";

// 難しさのレベル（問題の sort の百の位）。XP で上がる方は必ず「道場 Lv.N」と書いて区別する（2026-11-06。見直し ⑦）
const LEVEL_LABEL: Record<number, string> = {
  1: "Lv1 型",
  2: "Lv2 活用・識別",
  3: "Lv3 意味・応用",
  4: "Lv4 文脈総合",
  5: "Lv5 難関",
};

/**
 * 解放済み最高レベル。
 * ※ 助動詞テストを継続編集中のため、当面は全レベルを解放する（存在する最高レベルを返す）。
 *   段階解放に戻すときは下のループ版（前レベル85%定着で次を解放）に差し替える。
 */
function maxUnlockedLevel(
  lvls: number[],
  _progress: Record<string, TopicProgress>,
  _topicId: string
): number {
  // 全解放（一時）
  return lvls[lvls.length - 1] ?? 1;
  // --- 段階解放（元の挙動）に戻す場合 ---
  // let max = lvls[0] ?? 1;
  // for (let i = 1; i < lvls.length; i++) {
  //   const prevKey = levelKey(_topicId, lvls[i - 1]);
  //   if ((_progress[prevKey]?.masteryPct ?? 0) >= 85) max = lvls[i];
  //   else break;
  // }
  // return max;
}

/** 1セッションで出題する問題数（各レベル約20問のバンクからシャッフルして抽出） */
const SESSION_SIZE = 8;
import { VideoEmbed } from "@/components/grammar/VideoEmbed";
import { DrillSession, type DrillResult } from "@/components/grammar/DrillSession";

type Phase = "learn" | "drill" | "done";

/**
 * ドリルがある単元の一覧（「次の単元」を決めるのに使う）。
 * 道場ホームと同じ索引（dojoData が覚えている）を使うので、ホームを通って来たときは取り直さない。失敗したら例外。
 */
async function loadDojoTopicIds(): Promise<string[]> {
  return Object.keys(await fetchDojoTopicLevels());
}

// 結果画面のボタン。主＝いま押してほしい1つ、副＝そのほか（見た目は読解テストの結果画面の2種と同じ）
const MAIN_BUTTON = "block bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5";
const SUB_BUTTON = "block bg-rw-paper border-2 border-rw-ink text-rw-ink font-black rounded-full px-8 py-2.5 tracking-widest transition-transform hover:-translate-y-0.5";
const MAIN_SHADOW = { boxShadow: "0 4px 0 var(--rw-ink)" };

/**
 * 文法道場・単元ページ：レベルと開始ボタン → 講義動画・要点 → ドリル → 到達度。
 * 2026-11-06（文法道場の見直し）：開始ボタンを上へ／開いたときのレベルは「まだ ✅ でない、いちばん下」／
 * 結果画面に「次の単元」／来た所へ戻る（?back=）／読み込みと保存の失敗を画面に出す。
 */
export default function GrammarDojoTopic() {
  const { topicId } = useParams();
  const [searchParams] = useSearchParams();
  // どこから来たか（教材・学び始め・単語道場）。通してよいパスだけ受け取る
  const backParam = safeDojoBackPath(searchParams.get("back"));
  const back = dojoBack(backParam);
  const [topic, setTopic] = useState<GrammarTopic | null>(null);
  const [media, setMedia] = useState<GrammarMedia[]>([]);
  const [drills, setDrills] = useState<GrammarDrill[]>([]);
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});
  const [answerStats, setAnswerStats] = useState<Record<string, ItemStat>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [phase, setPhase] = useState<Phase>("learn");
  const [result, setResult] = useState<DrillResult | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [selLevel, setSelLevel] = useState(1);
  const [sessionDrills, setSessionDrills] = useState<GrammarDrill[]>([]);
  // 次の単元（並び順で今の次。本番にドリルがある文法の単元だけ）。of＝どの単元から見た「次」か
  const [nextTopic, setNextTopic] = useState<{ of: string; id: string; title: string | null } | null>(null);
  const nextReq = useRef<string | null>(null);
  // 保存の失敗（1問ごとの記録の数・単元の結果）。結果画面に1行ずつ出す
  const [saveFailed, setSaveFailed] = useState(0);
  const [resultSaveFailed, setResultSaveFailed] = useState(false);
  // 何回目のドリルか。前の回の保存の結果が遅れて届いても、今の回の表示を書き換えないために使う
  const sessionSeq = useRef(0);

  // ドリル中の背景（単語クイズ・読解テストと同じ設定）
  const [quizBackground] = useQuizBackground();
  const [quizBackgroundColor] = useQuizBackgroundColor();
  const bgColor = QUIZ_BACKGROUND_COLORS[quizBackgroundColor]?.bg ?? "var(--rw-bg)";

  // この単元に存在する難度レベルと、解放済み最大レベル（前レベル定着85%で解放）
  const levels = useMemo(() => [1, 2, 3, 4, 5].filter((L) => drills.some((d) => drillLevel(d) === L)), [drills]);
  // 定着＝85%以上。8問抽出なので7〜8問は1ミスまでOK、6問以下の級は実質全問正解。
  const isMastered = (key: string) => (progress[key]?.masteryPct ?? 0) >= MASTERY_PCT;
  const unlockedMax = !topicId ? 1 : maxUnlockedLevel(levels, progress, topicId);
  const levelDrills = drills.filter((d) => drillLevel(d) === selLevel);
  const nextLevel = levels[levels.indexOf(selLevel) + 1];
  // 8問に足りないレベルは、足りない分を1つ上のレベルの易しい順から足す（何問になるか・足しているか）
  const sessionCount = fillFromUpperLevel(levelDrills.slice(0, SESSION_SIZE), drills, selLevel, SESSION_SIZE).length;
  const borrowsUpper = sessionCount > Math.min(SESSION_SIZE, levelDrills.length);
  // 「手前の問題」は下のレベルの問題。下が無いレベル（Lv1 など）では、間違えた問題を最後にもう一度出すだけ
  const hasLowerLevel = levels.indexOf(selLevel) > 0;

  /** 次の単元を調べておく（結果画面で使う。ドリルを始めたときに呼ぶ＝結果が出るころには決まっている） */
  const prepareNext = (id: string) => {
    if (nextReq.current === id) return;
    nextReq.current = id;
    void loadDojoTopicIds()
      .then(async (ids) => {
        if (nextReq.current !== id) return;
        const nid = nextTopicId(id, ids);
        if (!nid) return;
        setNextTopic({ of: id, id: nid, title: null });
        const r = await fetchJsonAsset<GrammarTopic>(`/grammar/${nid}.json`);
        if (r.ok && nextReq.current === id) setNextTopic({ of: id, id: nid, title: r.data.title });
      })
      .catch(() => {
        if (nextReq.current === id) nextReq.current = null;
      });
  };

  /** バンクからシャッフルしてセッション分を取り出し、ドリル開始 */
  const startDrill = (level: number) => {
    const pool = drills.filter((d) => drillLevel(d) === level);
    const picked = pickQuestions({ items: pool, key: d => d.id, order: d => d.sort ?? 0,
      stats: answerStats, n: SESSION_SIZE }).picked;
    setSessionDrills(fillFromUpperLevel(picked, drills, level, SESSION_SIZE));
    setSelLevel(level);
    setResult(null);
    setSaveFailed(0);
    setResultSaveFailed(false);
    sessionSeq.current += 1;
    setPhase("drill");
    window.scrollTo({ top: 0 });
    if (topicId) {
      // 道場ホームの「つづきから」用に、最後に始めた単元とレベルを端末に覚える
      writeDojoLastTopic(topicId, level);
      prepareNext(topicId);
    }
  };

  useEffect(() => {
    if (!topicId) return;
    logEvent({ area: "grammar", action: "view", targetType: "topic", targetId: topicId });
  }, [topicId]);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setPhase("learn");
    setResult(null);
    setLevelUp(null);
    setNextTopic(null);
    nextReq.current = null;
    Promise.all([
      fetchJsonAsset<GrammarTopic>(`/grammar/${topicId}.json`),
      fetchMedia(topicId),
      fetchDrills(topicId),
      // 到達度は「失敗したら例外」の版で読む。読めないまま進むと、空の到達度を元に結果を保存して過去の最高記録を下げてしまう
      getAllTopicProgressOrThrow(),
      getWordStats(),
    ]).then(([t, m, d, p, stats]) => {
      if (cancelled) return;
      // 単元の説明もドリルも取れなかったときは通信の失敗とみなす（「準備中」と出さない）
      if (!t.ok && t.kind !== "not-found" && d.length === 0) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setTopic(t.ok ? t.data : null);
      setMedia(m);
      setDrills(d);
      setProgress(p);
      setAnswerStats(stats);
      // 初期選択は「まだ ✅ が付いていない、いちばん下のレベル」（全部 ✅ ならいちばん上）
      const lvls = [1, 2, 3, 4, 5].filter((L) => d.some((x) => drillLevel(x) === L));
      setSelLevel(initialLevel(lvls, p, topicId));
      setLoading(false);
    }).catch(() => {
      // 5つのうち1つでも例外になると「読み込み中...」のまま止まっていた。失敗の表示へ
      if (cancelled) return;
      setLoadError(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [topicId, reloadSeq]);

  const handleComplete = (r: DrillResult) => {
    setResult(r);
    setSaveFailed((n) => Math.max(n, r.saveFailed ?? 0));
    void getWordStats().then(setAnswerStats).catch(() => {});
    setPhase("done");
    window.scrollTo({ top: 0 });
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
    // 保存に失敗しても画面は「できた」と出ていたので、失敗を結果画面に出す。
    // saveTopicResult は失敗を返さない作りなので、保存のあとに読み直して同じ値が入っているかで確かめる
    // （読み直しに失敗したときも「保存できた」とは言えないので、同じ1行を出す）
    const seq = sessionSeq.current;
    void saveTopicResult(key, {
      drillTotal: r.total,
      drillCorrect: r.correct,
      masteryPct: bestPct,
    })
      .then(() => getAllTopicProgressOrThrow())
      .then((saved) => {
        const row = saved[key];
        const ok = !!row && row.masteryPct === bestPct && row.drillTotal === r.total && row.drillCorrect === r.correct;
        if (!ok && sessionSeq.current === seq) setResultSaveFailed(true);
      })
      .catch(() => {
        if (sessionSeq.current === seq) setResultSaveFailed(true);
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

  if (loadError) {
    return (
      <div className="min-h-dvh bg-rw-bg flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-rw-ink font-bold">読み込めませんでした</p>
        <p className="text-xs text-rw-ink-soft">通信を確認して、もう一度ためしてください。</p>
        <button
          onClick={() => setReloadSeq((n) => n + 1)}
          className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest"
          style={MAIN_SHADOW}
        >
          もう一度
        </button>
        <Link to={back.path} className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
          {back.label}
        </Link>
      </div>
    );
  }

  // ドリル中：答え合わせが会話式（縦に流れる）なので、ページごと縦に送る。背景は単語クイズ・読解テストと同じ和柄
  if (phase === "drill") {
    const seq = sessionSeq.current;
    return (
      <div className="min-h-dvh" style={{ background: bgColor }}>
        <QuizBackground pattern={quizBackground} color={quizBackgroundColor} />
        <div className="relative z-[1] w-full max-w-2xl mx-auto px-3 pt-3 pb-3">
          {/* 問題は単語クイズ・読解テストと同じ下敷きに載せる */}
          <div
            className="relative rounded-2xl border border-rw-rule p-3 shadow-sm"
            style={{ background: `color-mix(in srgb, color-mix(in srgb, ${bgColor} 65%, var(--rw-paper)) 92%, transparent)` }}
          >
            <div className="flex items-center gap-3 mb-2">
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
            <DrillSession
              drills={sessionDrills}
              supportBank={drills}
              stats={answerStats}
              onComplete={handleComplete}
              onSaveFailed={(n) => {
                if (sessionSeq.current === seq) setSaveFailed(n);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const next = nextTopic && nextTopic.of === topicId ? nextTopic : null;
  const cleared = !!result && result.masteryPct >= MASTERY_PCT;

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-5">
        <div className="flex items-center gap-4 mb-5">
          <Link
            to={back.path}
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            {back.label}
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
            {/* 難度レベル選択（複数レベルがある単元のみ）。開始ボタンと一緒に、動画・ポイントより上に置く
                （ほとんどの生徒は開始ボタンまで下へ送っていた。2026-11-06 見直し ⑦） */}
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
            {/* 段階解放に戻したときだけ出る文（全レベルを開けている間は条件が成り立たず、出ない） */}
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
                ⚔️ {levels.length > 1 ? `${LEVEL_LABEL[selLevel]} を始める` : "ドリルを始める"}（{sessionCount}問・学習記録を反映）
              </button>
            ) : (
              <div className="text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-6">
                <p className="text-sm text-rw-ink-soft">この単元のドリルは準備中です。</p>
              </div>
            )}

            {/* 進め方。「手前の問題へ」の説明は、手前（下のレベル）の問題があるときだけ出す */}
            {levelDrills.length > 0 && (
              <div className="mt-5 mb-6 rounded-2xl border border-rw-rule bg-rw-paper p-4 text-sm text-rw-ink">
                {hasLowerLevel ? (
                  <>
                    <p className="font-bold">まず自力で解く → つまずきを確認 → 手前の問題へ</p>
                    <p className="mt-2 text-xs leading-relaxed text-rw-ink-soft">最初の最大8問は選んだレベルで挑戦。間違えた問題は、すべて解いた後に下位問題で確認してから再挑戦します。補助は最大6問。本問の得点とは分けて表示します。</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold">まず自力で解く → 間違えた問題をもう一度</p>
                    <p className="mt-2 text-xs leading-relaxed text-rw-ink-soft">最初の最大8問に挑戦。間違えた問題は、すべて解いた後にもう一度出します。もう一度の正誤は、本問の得点とは分けて表示します。</p>
                  </>
                )}
                {borrowsUpper && (
                  <p className="mt-2 text-xs leading-relaxed text-rw-ink-soft">このレベルは問題が少ないので、1つ上のレベルのやさしい問題も出ます。</p>
                )}
              </div>
            )}

            {/* 講義動画 */}
            {media.length > 0 && (
              <div className="mb-6 space-y-4">
                {media.map((m) => (
                  <VideoEmbed key={m.storagePath} media={m} onPlay={() => {
                    logEvent({ area: "grammar", action: "view", targetType: "video", targetId: topicId, ctx: { path: m.storagePath } });
                    void markWatched(topicId);
                  }} />
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

            <div className="mt-4 text-center">
              <Link to={referenceUrlFromTopic(topicId, backParam)} className="text-xs font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
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
              <div className="text-5xl mb-3">{cleared ? "🎉" : "📚"}</div>
              <p className="text-3xl font-black text-rw-ink">{result.masteryPct}%</p>
              <p className="text-sm text-rw-ink-soft mt-1">
                自力での初回回答：{result.correct} / {result.total} 正解
              </p>
              <p className="text-xs font-black mt-2 text-rw-primary">
                {cleared ? "今回の本問はクリア。日を空けてもう一度確認しよう" : "つまずいたところから、一つずつ確かめよう"}
              </p>
            </div>
            {!!result.supportAnswered && <p className="text-sm text-rw-ink-soft mb-5">補助・再挑戦：{result.supportCorrect} / {result.supportAnswered} 正解（本問の得点には含めません）</p>}
            {/* 保存の失敗は隠さず1行ずつ出す（次に開いたら元に戻っていた、を防ぐ） */}
            {saveFailed > 0 && <p role="alert" className="text-xs text-rw-primary mb-2">{saveFailed}問の記録を保存できませんでした。</p>}
            {resultSaveFailed && <p role="alert" className="text-xs text-rw-primary mb-2">今回の結果を保存できませんでした。通信を確認してください。</p>}
            {/* 次の一手。クリア（85%以上）なら「次の単元」が主ボタン、届かなければ「もう一度」が主ボタン */}
            <div className="flex flex-col gap-3 mt-4">
              {cleared && next && (
                <Link to={topicUrlWithBack(next.id, backParam)} className={MAIN_BUTTON} style={MAIN_SHADOW}>
                  {next.title ? `次の単元：${next.title} ▸` : "次の単元へ ▸"}
                </Link>
              )}
              {!cleared && (
                <button onClick={() => startDrill(selLevel)} className={MAIN_BUTTON} style={MAIN_SHADOW}>
                  もう一度
                </button>
              )}
              {/* 次のレベルがあれば、その場で挑戦できる（クリアして次の単元が無いときは、これが主ボタン） */}
              {nextLevel !== undefined && unlockedMax >= nextLevel && (
                <button
                  onClick={() => startDrill(nextLevel)}
                  className={cleared && !next ? MAIN_BUTTON : SUB_BUTTON}
                  style={cleared && !next ? MAIN_SHADOW : undefined}
                >
                  {LEVEL_LABEL[nextLevel]} に挑戦
                </button>
              )}
              {cleared && (
                <button
                  onClick={() => startDrill(selLevel)}
                  className={!next && nextLevel === undefined ? MAIN_BUTTON : SUB_BUTTON}
                  style={!next && nextLevel === undefined ? MAIN_SHADOW : undefined}
                >
                  もう一度
                </button>
              )}
              {!cleared && next && (
                <Link to={topicUrlWithBack(next.id, backParam)} className={SUB_BUTTON}>
                  {next.title ? `次の単元：${next.title} ▸` : "次の単元へ ▸"}
                </Link>
              )}
              <Link
                to={referenceUrlFromTopic(topicId, backParam)}
                className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors py-2"
              >
                📖 リファレンスで確認
              </Link>
              <Link
                to={back.path}
                className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors py-1"
              >
                {back.fromOutside ? back.label : "← 文法道場へ戻る"}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
