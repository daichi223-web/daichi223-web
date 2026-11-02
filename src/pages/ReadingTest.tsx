/**
 * 教材の読解テスト（2026-11-02〜、設計 = docs/reading-test.md）。経路 /read/texts/:textId/test。
 * 上に本文（縦書き・傍線と丸数字。閲覧のみ＝タップさせない）、下に問題（「問N」の札＋選択肢）。
 * 選択肢・答え合わせ・背景は単語クイズ（WordQuizContent・ChatFeedback・QuizBackground）にそろえる。
 * 問題は public/reading-tests/<textId>.json があればそれ、無ければ自動（src/lib/kobun/readingTest.ts）。
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import type { KobunText, TextAnalysis } from "@/lib/kobun/types";
import type { Word } from "@/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import {
  READING_KIND_LABEL,
  buildReadingTest,
  circled,
  fetchManualTest,
  formatElapsed,
  kobunWordByQid,
  readingThread,
  type ReadingQ,
  type ReadingTest as ReadingTestData,
} from "@/lib/kobun/readingTest";
import { ChatFeedback } from "@/components/quiz/ChatFeedback";
import { QuizBackground } from "@/components/quiz/QuizBackground";
import { answerTone, scrollBehavior } from "@/components/quiz/writingVerdict";
import { QUIZ_BACKGROUND_COLORS, useQuizBackground, useQuizBackgroundColor } from "@/lib/quizBackground";
import { TEACHERS, TEACHER_VOICE_ENABLED, teacherImage } from "@/lib/teachers";
import { useChatTeacher } from "@/lib/chatTeacher";
import { usePortraitTone } from "@/lib/portraitTone";
import { readMyStage } from "@/lib/myStage";
import { logEvent, markQuestionShown } from "@/lib/learningEvents";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

/** 答え合わせの吹き出しに渡す語（単語帳の語は単語帳の1行、それ以外は見出しだけの仮の語） */
function feedbackWord(q: ReadingQ): Word {
  const w = q.qid ? kobunWordByQid(q.qid) : undefined;
  return w ?? { qid: `read-${q.no}`, lemma: q.lemma ?? q.target ?? q.spanText, sense: "", meaning_idx: 0, group: 0, examples: [] };
}

/** 縦書きの本文。傍線部は右側に線（border-right）と丸数字。今の問題の傍線部は淡く塗る */
function VerticalBody({ text, questions, current, lead }: { text: KobunText; questions: ReadingQ[]; current: number; lead?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const curNo = questions[current]?.no;

  // 今の問題の傍線部が見えるよう、本文の箱の中だけを横に動かす（ページは動かさない）
  useEffect(() => {
    const box = boxRef.current;
    const el = box?.querySelector(`[data-q="${curNo}"]`) as HTMLElement | null;
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left >= b.left + 8 && r.right <= b.right - 8) return;
    box.scrollBy({ left: r.left + r.width / 2 - (b.left + b.width / 2), behavior: scrollBehavior() });
  }, [curNo]);

  const bySentence = useMemo(() => {
    const m = new Map<string, ReadingQ[]>();
    for (const q of questions) m.set(q.sentenceId, [...(m.get(q.sentenceId) ?? []), q]);
    for (const arr of m.values()) arr.sort((a, b) => a.span[0] - b.span[0]);
    return m;
  }, [questions]);

  return (
    <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl px-3 pt-2 pb-3 min-w-0 overflow-hidden">
      {lead && <p className="text-[11px] font-bold text-rw-ink-soft mb-1.5 leading-snug">{lead}</p>}
      <div
        ref={boxRef}
        lang="ja"
        aria-label="本文（縦書き）"
        className="font-serif text-rw-ink"
        style={{
          writingMode: "vertical-rl",
          // 縦書きの箱は幅を決めないと本文の長さまで横に伸びてページごとはみ出す。幅を枠に合わせて中だけ横に送る
          width: "100%",
          maxWidth: "100%",
          height: "min(46vh, 340px)",
          overflowX: "auto",
          overflowY: "hidden",
          fontSize: 18,
          lineHeight: 2.1,
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
        } as CSSProperties}
      >
        {text.sentences.map((s) => {
          const qs = bySentence.get(s.id) ?? [];
          const parts: JSX.Element[] = [];
          let at = 0;
          for (const q of qs) {
            const [a, b] = q.span;
            if (a < at) continue; // 重なる傍線は引かない（生成側で重ならないようにしてある）
            if (a > at) parts.push(<Fragment key={`t${at}`}>{s.originalText.slice(at, a)}</Fragment>);
            const cur = q.no === curNo;
            parts.push(
              <Fragment key={`q${q.no}`}>
                <span className="font-sans font-black" style={{ fontSize: "0.72em", color: "var(--rw-primary)" }}>{circled(q.no)}</span>
                <span
                  data-q={q.no}
                  style={{
                    borderRight: "2px solid var(--rw-ink)",
                    paddingRight: 1,
                    background: cur ? "color-mix(in srgb, var(--rw-accent) 28%, transparent)" : undefined,
                    borderRadius: 2,
                  }}
                >
                  {s.originalText.slice(a, b)}
                </span>
              </Fragment>,
            );
            at = b;
          }
          if (at < s.originalText.length) parts.push(<Fragment key={`t${at}`}>{s.originalText.slice(at)}</Fragment>);
          return <span key={s.id}>{parts}</span>;
        })}
      </div>
      <p className="mt-1 text-[10px] text-rw-ink-soft text-right">← 左へスワイプで続きを読む</p>
    </div>
  );
}

export default function ReadingTest() {
  const { textId = "" } = useParams<{ textId: string }>();
  const [text, setText] = useState<KobunText | null>(null);
  const [analysis, setAnalysis] = useState<TextAnalysis | null | undefined>(undefined);
  const [manual, setManual] = useState<ReadingTestData | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!textId) return;
    let alive = true;
    fetchJsonAsset<KobunText>(`/texts-v3/${textId}.json`).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(true);
      setText(r.data);
      fetchManualTest(textId, r.data).then((m) => alive && setManual(m));
    });
    fetchJsonAsset<TextAnalysis>(`/analysis/${textId}.json`).then((r) => alive && setAnalysis(r.ok ? r.data : null));
    return () => {
      alive = false;
    };
  }, [textId]);

  const test = useMemo<ReadingTestData | null>(() => {
    if (!text || analysis === undefined || manual === undefined) return null;
    return manual ?? buildReadingTest(text, analysis);
  }, [text, analysis, manual]);
  const questions = useMemo(() => test?.questions ?? [], [test]);

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [startAt, setStartAt] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const finished = endAt !== null;

  // 始める（読み込めたとき・もう一度）
  const start = useCallback(() => {
    setIdx(0);
    setAnswers(questions.map(() => null));
    setStartAt(Date.now());
    setEndAt(null);
  }, [questions]);
  useEffect(() => {
    if (!test || !questions.length) return;
    start();
    logEvent({ area: "text", action: "open", targetType: "readtest", targetId: textId, ctx: { source: test.source, n: questions.length } });
  }, [test, questions, start, textId]);

  // 経過時間
  useEffect(() => {
    if (!startAt || finished) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startAt, finished]);

  const q = questions[idx];
  const chosen = answers[idx] ?? null;
  useEffect(() => {
    if (q && !finished) markQuestionShown();
  }, [q, finished]);

  // 答え合わせの先生と自分（単語クイズと同じ設定）
  const [teacherId] = useChatTeacher();
  const [tone] = usePortraitTone();
  const myStage = useMemo(readMyStage, []);
  const [quizBackground] = useQuizBackground();
  const [quizBackgroundColor] = useQuizBackgroundColor();
  const bgColor = QUIZ_BACKGROUND_COLORS[quizBackgroundColor]?.bg ?? "var(--rw-bg)";

  const feedbackRef = useRef<HTMLDivElement>(null);
  const choose = (i: number) => {
    if (!q || chosen !== null) return;
    setAnswers((a) => a.map((x, k) => (k === idx ? i : x)));
    logEvent({
      area: "text",
      action: "answer",
      targetType: "readq",
      targetId: `${textId}:${q.no}`,
      correct: i === q.answerIndex,
      chosen: q.choices[i],
      format: q.kind,
      ctx: { tokenIds: q.tokenIds, span: q.span, source: test?.source },
    });
    window.setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" }), 60);
  };
  const next = () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    } else {
      setEndAt(Date.now());
      window.scrollTo({ top: 0 });
    }
  };

  const elapsed = (endAt ?? now) - startAt;
  const backTo = `/read/texts/${textId}`;

  if (loadError) {
    return (
      <div className="min-h-dvh bg-rw-bg flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-rw-ink font-bold">教材を読み込めませんでした</p>
        <Link to="/read" className="text-sm text-rw-ink-soft">← 読解トップへ</Link>
      </div>
    );
  }
  if (!text || !test) {
    return (
      <div className="min-h-dvh bg-rw-bg flex items-center justify-center">
        <p className="text-rw-ink-soft">読み込んでいます...</p>
      </div>
    );
  }
  if (!questions.length) {
    return (
      <div className="min-h-dvh bg-rw-bg flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-rw-ink font-bold">この教材の読解テストはまだありません</p>
        <Link to={backTo} className="text-sm text-rw-ink-soft">← 教材へ戻る</Link>
      </div>
    );
  }

  const correctCount = answers.filter((a, k) => a !== null && a === questions[k].answerIndex).length;

  return (
    <div className="min-h-dvh" style={{ background: bgColor }}>
      <QuizBackground pattern={quizBackground} color={quizBackgroundColor} />
      <div className="relative z-[1] max-w-2xl mx-auto">
        {/* ヘッダ：× 中断（教材へ戻る）／題名／経過時間 */}
        <header className="sticky top-0 z-10 bg-rw-paper border-b-2 border-rw-ink px-3 py-2">
          <div className="flex items-center gap-2">
            <Link
              to={backTo}
              aria-label="中断して教材へ戻る"
              className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full border-2 border-rw-ink text-rw-ink font-black hover:bg-rw-bg"
            >
              ✕
            </Link>
            <div className="flex-1 min-w-0 text-center">
              <p className="text-[10px] font-black tracking-widest text-rw-ink-soft">読解テスト</p>
              <h1 className="text-sm font-black text-rw-ink truncate">{test.title ?? text.title}</h1>
            </div>
            <span className="shrink-0 font-mono font-black text-rw-ink text-sm tabular-nums" aria-label="経過時間">⏱ {formatElapsed(elapsed)}</span>
          </div>
          {/* 問題番号の丸（済み＝accent、今＝枠を太く） */}
          <ol className="flex flex-wrap justify-center gap-1.5 mt-2" aria-label="問題番号">
            {questions.map((x, k) => {
              const done = answers[k] !== null && answers[k] !== undefined;
              const cur = k === idx && !finished;
              return (
                <li
                  key={x.no}
                  aria-current={cur ? "step" : undefined}
                  className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-black ${
                    cur ? "border-[3px] border-rw-ink" : done ? "border-2 border-rw-accent" : "border-2 border-rw-rule"
                  }`}
                  style={{
                    background: done ? "var(--rw-accent)" : "var(--rw-paper)",
                    color: done ? "var(--rw-paper)" : "var(--rw-ink)",
                  }}
                >
                  {x.no}
                </li>
              );
            })}
          </ol>
        </header>

        <main className="p-3 space-y-3">
          <VerticalBody text={text} questions={questions} current={finished ? -1 : idx} lead={test.lead} />

          {!finished && q && (
            // 問題は単語クイズと同じ下敷きに載せる
            <div
              className="relative rounded-2xl border border-rw-rule p-3 shadow-sm"
              style={{ background: `color-mix(in srgb, color-mix(in srgb, ${bgColor} 65%, var(--rw-paper)) 92%, transparent)` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-black rounded-md px-2 py-0.5 bg-rw-ink text-rw-paper">問{q.no}</span>
                <span className="text-xs font-black rounded-md px-2 py-0.5 border border-rw-ink text-rw-ink">{READING_KIND_LABEL[q.kind]}</span>
              </div>
              <p className="text-[15px] font-bold text-rw-ink leading-relaxed mb-3">{q.prompt}</p>

              <div className="space-y-2">
                {q.choices.map((c, i) => {
                  const answered = chosen !== null;
                  const isCorrect = i === q.answerIndex;
                  const isWrongPick = answered && i === chosen && !isCorrect;
                  let cls = "w-full text-left p-3 rounded-xl border-2 transition font-medium flex items-center";
                  let labelBg = "bg-rw-bg text-rw-ink-soft";
                  let toneStyle: CSSProperties | undefined;
                  let label = OPTION_LABELS[i];
                  if (answered) {
                    cls += " pointer-events-none";
                    if (isCorrect) {
                      cls += " text-rw-ink font-black";
                      labelBg = "bg-rw-paper text-rw-ink";
                      toneStyle = answerTone("var(--rw-accent)");
                      label = "○";
                    } else if (isWrongPick) {
                      cls += " text-rw-ink font-black";
                      labelBg = "bg-rw-paper text-rw-ink";
                      toneStyle = answerTone("var(--rw-primary)");
                      label = "×";
                    } else {
                      cls += " bg-rw-paper border-rw-rule text-rw-ink-soft";
                    }
                  } else {
                    cls += " bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-ink-soft";
                  }
                  return (
                    <button key={`${q.no}-${i}`} onClick={() => choose(i)} className={cls} style={{ minHeight: 44, ...toneStyle }}>
                      <span className={`inline-flex items-center justify-center w-7 h-7 mr-3 rounded-full font-black text-sm flex-shrink-0 ${labelBg}`}>{label}</span>
                      <span className="flex-1">{c}</span>
                    </button>
                  );
                })}
              </div>

              {chosen !== null && (
                <div ref={feedbackRef} className="scroll-mb-4">
                  <ChatFeedback
                    bubbles={readingThread(q, chosen, { teacher: teacherId, voice: TEACHER_VOICE_ENABLED })}
                    canAdvance
                    onNext={next}
                    teacher={TEACHERS[teacherId]}
                    teacherSrc={teacherImage(teacherId, tone)}
                    me={{ stageN: myStage.n, tone, rankLabel: myStage.rank }}
                    word={feedbackWord(q)}
                  />
                  <div className="mt-6 text-center">
                    <button
                      onClick={next}
                      className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
                      style={{ boxShadow: "0 4px 0 var(--rw-primary)" }}
                    >
                      {idx + 1 < questions.length ? "つぎへ →" : "結果を見る →"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {finished && (
            <div
              className="relative rounded-2xl border border-rw-rule p-4 shadow-sm"
              style={{ background: `color-mix(in srgb, color-mix(in srgb, ${bgColor} 65%, var(--rw-paper)) 92%, transparent)` }}
            >
              <p className="text-xs font-black tracking-widest text-rw-ink-soft text-center">結果</p>
              <p className="text-center text-rw-ink mt-1">
                <span className="text-4xl font-black">{correctCount}</span>
                <span className="text-lg font-black"> / {questions.length} 問正解</span>
              </p>
              <p className="text-center text-sm font-bold text-rw-ink-soft mt-1">かかった時間 {formatElapsed(elapsed)}</p>

              {correctCount < questions.length && (
                <div className="mt-4">
                  <p className="text-xs font-black text-rw-ink mb-1.5">間違えた問題</p>
                  <ul className="space-y-1.5">
                    {questions.map((x, k) =>
                      answers[k] === x.answerIndex ? null : (
                        <li key={x.no} className="bg-rw-paper border border-rw-rule rounded-xl px-3 py-2 text-sm text-rw-ink">
                          <p>
                            <span className="font-black mr-1">問{x.no}</span>
                            <span className="text-rw-ink-soft mr-1">{READING_KIND_LABEL[x.kind]}</span>
                            <span className="font-serif font-bold">「{x.spanText}」</span>
                          </p>
                          <p className="mt-0.5">
                            正解：<b>{x.choices[x.answerIndex]}</b>
                            {answers[k] !== null && answers[k] !== undefined && <span className="text-rw-ink-soft">（あなた：{x.choices[answers[k]!]}）</span>}
                          </p>
                          {(x.lemma || x.grammarRefId) && (
                            <p className="mt-0.5 font-bold" style={{ color: "var(--rw-primary)" }}>
                              {x.lemma ? (
                                <Link to={`/word/${encodeURIComponent(x.lemma)}`}>→ 単語カード「{x.lemma}」</Link>
                              ) : (
                                <Link to={`/read/reference/${x.grammarRefId}`}>→ 文法解説</Link>
                              )}
                            </p>
                          )}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => {
                    start();
                    window.scrollTo({ top: 0 });
                  }}
                  className="bg-rw-ink text-rw-paper font-black rounded-full px-6 py-3 tracking-widest"
                  style={{ boxShadow: "0 4px 0 var(--rw-primary)" }}
                >
                  もう一度
                </button>
                <Link to={backTo} className="rounded-full font-black px-6 py-3 bg-rw-paper border-2 border-rw-ink text-rw-ink">
                  教材へ戻る
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
