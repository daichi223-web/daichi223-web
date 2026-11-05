import { useState, useMemo, useRef, useEffect } from "react";
import {
  planFollowUp, applyFollowUp, hasSupportCandidate, nextStepLabel,
  SUPPORT_REASONS, SUPPORT_LIMIT, skillLabel, type SupportReason, type DrillStep,
} from '@/lib/kobun/drillSupport';
import { drillThread, drillFeedbackWord, isDrillAnswerCorrect } from '@/lib/kobun/drillThread';
import type { ItemStat } from '@/lib/quizSelector';
import type { GrammarDrill, GrammarTopic } from "@/lib/kobun/types";
import { recordDrillAnswer } from "@/lib/kobun/dojoData";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { logEvent, markQuestionShown } from "@/lib/learningEvents";
import { ChatFeedback } from "@/components/quiz/ChatFeedback";
import { scrollBehavior } from "@/components/quiz/writingVerdict";
import { TEACHERS, TEACHER_VOICE_ENABLED, teacherImage } from "@/lib/teachers";
import { useChatTeacher } from "@/lib/chatTeacher";
import { usePortraitTone } from "@/lib/portraitTone";
import { readMyStage } from "@/lib/myStage";

/** 選択肢の表示順をシャッフル（正解が先頭に固定されるのを防ぐ）。入力は破壊しない。 */
function shuffleChoices(arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface DrillResult {
  total: number;
  correct: number;
  masteryPct: number;
  supportAnswered?: number;
  supportCorrect?: number;
  /** 1問ごとの記録を保存できなかった数（結果を出した時点まで。あとから分かった分は onSaveFailed で知らせる） */
  saveFailed?: number;
}

/** 答えた直後の押し間違い（選択肢を押した指が、上がってきた答え合わせに当たる）で次へ進まないための待ち時間 */
const NEXT_GUARD_MS = 350;

/** 「この単元の基礎を確認する」で開くポイント。単元ごとに一度だけ読む */
type PointsState = string[] | 'loading' | 'error';

/**
 * 例文の描画。【 】＝問われている語（赤太字）、《 》＝意味・活用を決める手がかり（下線）。
 * どこと呼応して意味を形成しているかを視覚的に示す。
 */
function renderContext(text: string, showCues: boolean) {
  const parts = text.split(/(【[^】]*】|《[^》]*》)/);
  return parts.map((p, i) => {
    if (p.startsWith("【")) {
      return (
        <span key={i} className="font-black text-rw-primary px-0.5 border-b-4" style={{ borderColor: "var(--rw-primary)" }}>
          {p.slice(1, -1)}
        </span>
      );
    }
    if (p.startsWith("《")) {
      if (!showCues) return <span key={i}>{p.slice(1, -1)}</span>;
      return (
        <span key={i} className="font-bold text-rw-accent underline decoration-2 underline-offset-4">
          {p.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

/**
 * 文法ドリルのセッション。
 * 2026-11-06（文法道場の見直し ⑤）：答え合わせを単語クイズ・読解テストと同じ会話式（ChatFeedback）にした。
 * 吹き出しは縦に長くなるので「1画面固定」をやめ、答えたら答え合わせが上に来て縦に流れる形にしている
 * （単語クイズの WordQuizContent と同じ動き）。親が高さを決めた枠（復習の画面）に入っても、この中で縦に送れる。
 * 「つぎへ」は記録の保存を待たない（見直し ⑩）。保存できなかった数は結果に入れて親へ渡す。
 */
export function DrillSession({
  drills,
  onComplete,
  supportBank = drills,
  stats = {},
  onSaveFailed,
}: {
  drills: GrammarDrill[];
  supportBank?: GrammarDrill[];
  stats?: Record<string, ItemStat>;
  onComplete: (result: DrillResult) => void;
  /** 記録の保存に失敗するたびに、失敗した合計を知らせる（結果画面を出したあとに分かることもある） */
  onSaveFailed?: (failed: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const [queue, setQueue] = useState<DrillStep[]>(() => drills.map(drill => ({ drill, role: 'main' })));
  const [reason, setReason] = useState<SupportReason>('auto');
  const [supportAnswered, setSupportAnswered] = useState(0);
  const [supportCorrect, setSupportCorrect] = useState(0);
  const [savingCount, setSavingCount] = useState(0);
  const [saveFailed, setSaveFailed] = useState(0);
  const saveFailedRef = useRef(0);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [points, setPoints] = useState<Record<string, PointsState>>({});
  const answerLock = useRef(false);
  const nextLock = useRef(false);
  const answeredAt = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const step = queue[idx];
  const drill = step?.drill;
  const added = queue.filter(s => s.role !== 'main').length;
  // 問題ごとに選択肢順をシャッフル。idx/drill が変わるまで（＝解答中は）安定。
  const displayChoices = useMemo(() => shuffleChoices(drill?.choices ?? []), [drill?.id, idx]);
  const answered = selected !== null;
  const isCorrect = answered && drill ? isDrillAnswerCorrect(drill, selected) : false;
  // 間違えたあとに足すもの（手前→再挑戦／手前が無ければ最後にもう一度／なし）
  const followUp = drill && answered && !isCorrect ? planFollowUp(queue, idx, supportBank, reason, stats) : null;
  const support = followUp?.type === 'support' ? followUp.drill : null;
  // 「どこで迷いましたか？」は、手前の問題があるときだけ出す（無い所で押しても何も変わらなかったため）
  const canAskReason = !!drill && answered && !isCorrect && step.role !== 'retry' && added + 2 <= SUPPORT_LIMIT
    && hasSupportCandidate(drill, supportBank, new Set(queue.map(s => s.drill.id)));

  // 答え合わせの先生と自分（単語クイズと同じ設定）
  const [teacherId] = useChatTeacher();
  const [tone] = usePortraitTone();
  const myStage = useMemo(readMyStage, []);

  // 学習の出来事の記録（分析用）: 問いが切り替わった時刻を記し、回答に応答時間を付ける
  // 二度押しの鍵もここで外す（問題が切り替わって描き直されたあと。早く外すと、同じ押下の2回目で1問飛ぶ）
  useEffect(() => {
    markQuestionShown();
    answerLock.current = false;
    nextLock.current = false;
    if (idx > 0) topRef.current?.scrollIntoView({ block: 'start' });
  }, [idx]);

  // 答えたら、答え合わせ（自分の答えの吹き出し）が上に来るまで送る（単語クイズと同じ動き）
  useEffect(() => {
    if (!answered) return;
    const id = window.requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [answered, idx]);

  if (!drill) return null;

  const handleSelect = (choice: string) => {
    if (answered || answerLock.current) return;
    answerLock.current = true;
    answeredAt.current = Date.now();
    setSelected(choice);
    const ok = isDrillAnswerCorrect(drill, choice);
    if (step.role === 'main' && ok) setCorrectCount((c) => c + 1);
    if (step.role !== 'main') {
      setSupportAnswered(c => c + 1);
      if (ok) setSupportCorrect(c => c + 1);
    }
    setSavingCount(c => c + 1);
    logEvent({
      area: 'grammar', action: 'answer', targetType: 'drill', targetId: drill.id,
      correct: ok, chosen: choice, format: drill.kind,
      ctx: { topic: drill.topicId, role: step.role, choices: displayChoices },
    });
    // 保存は待たない。1回の回答につき1回だけ呼び、失敗しても自動では送り直さない
    // （途中まで書けていた場合に二重に数えるおそれがあるため）。失敗した数だけ覚えておく
    void recordDrillAnswer(drill.id, ok)
      .catch(() => {
        saveFailedRef.current += 1;
        setSaveFailed(saveFailedRef.current);
        onSaveFailed?.(saveFailedRef.current);
      })
      .finally(() => setSavingCount(c => c - 1));
  };

  const nextQueue = applyFollowUp(queue, idx, followUp);

  const handleNext = () => {
    if (!answered || nextLock.current) return;
    if (Date.now() - answeredAt.current < NEXT_GUARD_MS) return;
    nextLock.current = true;
    if (nextQueue !== queue) setQueue(nextQueue);
    if (idx + 1 >= nextQueue.length) {
      const total = drills.length;
      onComplete({
        total,
        supportAnswered, supportCorrect,
        correct: correctCount,
        masteryPct: total ? Math.round((correctCount / total) * 100) : 0,
        saveFailed: saveFailedRef.current,
      });
      return;
    }
    setIdx((i) => i + 1);
    setSelected(null);
    setReason('auto');
    setPointsOpen(false);
  };

  // 「この単元の基礎を確認する」：解説ページへ移るとドリルが消えるので、その場で単元の「ポイント」を開く
  const togglePoints = () => {
    setPointsOpen(o => !o);
    const id = drill.topicId;
    const cur = points[id];
    if (cur !== undefined && cur !== 'error') return;
    setPoints(p => ({ ...p, [id]: 'loading' }));
    void fetchJsonAsset<GrammarTopic>(`/grammar/${id}.json`).then(r =>
      setPoints(p => ({ ...p, [id]: r.ok ? (r.data.keyPoints ?? []) : 'error' })));
  };
  const topicPoints = points[drill.topicId];

  const choices = displayChoices;
  const hasCue = !!drill.context && drill.context.includes("《");

  return (
    // px-1：吹き出しの行は枠の外へ 3px 広げてある（ChatFeedback）。縦に送れる枠の中で横にはみ出さないための余白
    <div className="flex-1 min-h-0 overflow-y-auto px-1">
      <div ref={topRef} className="scroll-mt-14" />
      {/* 進捗 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-black text-rw-ink-soft tracking-wider">
          {step.role === 'main' ? `本問 ${queue.slice(0, idx + 1).filter(s => s.role === 'main').length} / ${drills.length}`
            : step.role === 'support' ? '一段手前を確認' : step.plain ? '間違えた問題をもう一度' : '元の問題に再挑戦'}
        </span>
        <span className="text-[11px] font-black text-rw-ink-soft">本問の正解 {correctCount}</span>
      </div>

      {step.role !== 'main' && <p className="text-xs text-rw-primary mb-3 leading-relaxed" role="status">
        {step.role === 'support' ? `${skillLabel[drill.kind]}から確かめましょう。ここでの正誤は、原因を考える手がかりです。`
          : step.plain ? 'さっき間違えた問題です。解説を思い出して、もう一度。時間を空けた復習でも確かめます。'
          : '手前の確認を踏まえて、もう一度。時間を空けた復習でも確かめます。'}
      </p>}
      {/* 設問（例文が長いときだけ内部スクロール） */}
      <div className="bg-rw-paper p-3.5 rounded-2xl border-2 border-rw-ink mb-2.5">
        {drill.context && (
          <>
            <div className="max-h-[26vh] overflow-y-auto">
              <p className="text-rw-ink font-serif text-[15px] leading-relaxed">{renderContext(drill.context, answered)}</p>
            </div>
            {hasCue && answered && (
              <p className="text-[10px] text-rw-ink-soft mt-1 leading-snug">
                <span className="font-black text-rw-primary">赤太字</span>＝問われる語{"　"}
                <span className="font-bold text-rw-accent underline decoration-2 underline-offset-2">下線</span>＝意味を決める手がかり
              </p>
            )}
            <div className="border-b border-rw-rule my-2" />
          </>
        )}
        <p className="text-[15px] font-black text-rw-ink leading-snug">{drill.prompt}</p>
      </div>

      {/* 選択肢 */}
      <div className="grid grid-cols-1 gap-1.5">
        {choices.map((choice) => {
          const chosen = selected === choice;
          const correctChoice = isDrillAnswerCorrect(drill, choice);
          let cls = "bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-accent";
          if (answered) {
            if (correctChoice) cls = "bg-rw-accent border-rw-accent text-rw-paper";
            else if (chosen) cls = "bg-rw-primary border-rw-primary text-rw-paper";
            else cls = "bg-rw-paper border-rw-rule text-rw-ink-soft opacity-60";
          }
          return (
            <button
              key={choice}
              onClick={() => handleSelect(choice)}
              disabled={answered}
              className={`text-left font-bold py-2.5 px-3.5 rounded-xl border-2 transition text-sm leading-snug ${cls}`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {/* 答え合わせ（会話式）。右＝選んだ答え、左＝先生の判定と解説。タップか「つぎへ」で次へ */}
      {answered && (
        // 最低の高さ＝画面の高さ − 上の余白。答え合わせが短くても上端まで上がるように（単語クイズと同じ）
        <div ref={feedbackRef} className="scroll-mt-2 pb-3" style={{ minHeight: 'calc(100dvh - 3rem)' }}>
          <ChatFeedback
            bubbles={drillThread(drill, selected, { teacher: teacherId, voice: TEACHER_VOICE_ENABLED })}
            canAdvance
            onNext={handleNext}
            teacher={TEACHERS[teacherId]}
            teacherSrc={teacherImage(teacherId, tone)}
            me={{ stageN: myStage.n, tone, rankLabel: myStage.rank }}
            word={drillFeedbackWord(drill)}
          />

          {/* ここから下は吹き出しの外（吹き出しの領域は全体が「タップで次へ」になるため、押すものは外に置く） */}
          {canAskReason && (
            <fieldset className="mt-4 border-t border-rw-rule pt-3">
              <legend className="text-xs font-bold pt-3 text-rw-ink">どこで迷いましたか？</legend>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(SUPPORT_REASONS).map(([key, label]) => <button key={key}
                  onClick={() => setReason(key as SupportReason)} aria-pressed={reason === key}
                  className={`text-xs px-3 py-2 rounded-lg border ${reason === key ? 'bg-rw-primary text-rw-paper border-rw-primary' : 'bg-rw-paper text-rw-ink border-rw-rule'}`}>{label}</button>)}
              </div>
              <p className="text-xs mt-3 leading-relaxed text-rw-ink">{support
                ? `${step.role === 'main' ? '本問をすべて解いた後に' : '次に'}、同じ単元の「${skillLabel[support.kind]}」を確認して、この問題に戻ります。原因はまだ決めつけません。`
                : followUp?.type === 'retry'
                  ? 'この種類の手前の問題はありません。この問題は、最後にもう一度出します。'
                  : '対応する下位問題がないため、解説で手順を確認して進みましょう。'}</p>
            </fieldset>
          )}
          {!canAskReason && followUp?.type === 'retry' && (
            <p className="text-xs mt-4 leading-relaxed text-rw-ink">この問題は、最後にもう一度出します。</p>
          )}
          {!isCorrect && !support && (
            <div className="mt-3">
              <button type="button" onClick={togglePoints} aria-expanded={pointsOpen}
                className="text-xs underline text-rw-primary">
                この単元の基礎を確認する {pointsOpen ? '▴' : '▾'}
              </button>
              {pointsOpen && (
                <div
                  className="mt-2 p-4 rounded-2xl border-l-4"
                  style={{ background: "var(--rw-primary-soft)", borderLeftColor: "var(--rw-primary)" }}
                >
                  <h2 className="text-xs font-black tracking-wider text-rw-primary mb-2">ポイント</h2>
                  {topicPoints === undefined || topicPoints === 'loading' ? (
                    <p className="text-sm text-rw-ink-soft">読み込み中...</p>
                  ) : topicPoints === 'error' ? (
                    <p className="text-sm text-rw-ink">読み込めませんでした。もう一度押してください。</p>
                  ) : topicPoints.length === 0 ? (
                    <p className="text-sm text-rw-ink">この単元のポイントはまだありません。</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {topicPoints.map((p, i) => (
                        <li key={i} className="text-sm leading-relaxed text-rw-ink pl-4 relative before:content-['◆'] before:absolute before:left-0 before:text-rw-primary before:text-xs">
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          {step.role === 'support' && isCorrect && <p className="text-xs mt-4 text-rw-ink">この確認問題は解けました。元の問題では、どの手がかりを使うか考えてみましょう。</p>}
          {/* 保存中の表示は高さを取っておく（出たり消えたりで「つぎへ」が上下に動かないように） */}
          <p className="text-[11px] mt-3 min-h-[1rem] text-rw-ink-soft" role="status">{savingCount > 0 ? '記録を保存中…' : ''}</p>
          {saveFailed > 0 && <p role="alert" className="text-xs mt-1 text-rw-primary">{saveFailed}問の記録を保存できませんでした。通信を確認してください。</p>}

          <div className="mt-4 text-center">
            <button
              onClick={handleNext}
              className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-2.5 tracking-widest transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
            >
              {nextStepLabel(step, nextQueue[idx + 1])}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
