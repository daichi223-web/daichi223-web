import { useState, useMemo, useRef } from "react";
import { Link } from 'react-router-dom';
import { chooseSupport, insertSupport, SUPPORT_REASONS, SUPPORT_LIMIT, skillLabel, type SupportReason, type DrillStep } from '@/lib/kobun/drillSupport';
import type { ItemStat } from '@/lib/quizSelector';
import type { GrammarDrill } from "@/lib/kobun/types";
import { recordDrillAnswer } from "@/lib/kobun/dojoData";

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
}

function isAnswerCorrect(drill: GrammarDrill, choice: string): boolean {
  const a = drill.answer;
  return Array.isArray(a) ? a.includes(choice) : a === choice;
}

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
 * 文法ドリルのセッション。1問が iPhone 1 画面に収まるよう、
 * 全体を縦フレックス（h-full）で組み、長い例文・解説だけ内部スクロールにする。
 * 選択肢と「つぎへ」は常に画面内に見える。
 */
export function DrillSession({
  drills,
  onComplete,
  supportBank = drills,
  stats = {},
}: {
  drills: GrammarDrill[];
  supportBank?: GrammarDrill[];
  stats?: Record<string, ItemStat>;
  onComplete: (result: DrillResult) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const [queue, setQueue] = useState<DrillStep[]>(() => drills.map(drill => ({ drill, role: 'main' })));
  const [reason, setReason] = useState<SupportReason>('auto');
  const [supportAnswered, setSupportAnswered] = useState(0);
  const [supportCorrect, setSupportCorrect] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const answerLock = useRef(false);
  const nextLock = useRef(false);
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const step = queue[idx];
  const drill = step?.drill;
  const added = queue.filter(s => s.role !== 'main').length;
  const used = new Set(queue.map(s => s.drill.id));
  const support = drill && step.role !== 'retry' && added + 2 <= SUPPORT_LIMIT
    ? chooseSupport(drill, supportBank, used, reason, stats) : null;
  // 問題ごとに選択肢順をシャッフル。idx/drill が変わるまで（＝解答中は）安定。
  const displayChoices = useMemo(() => shuffleChoices(drill?.choices ?? []), [drill?.id, idx]);
  const answered = selected !== null;
  const isCorrect = answered && drill ? isAnswerCorrect(drill, selected) : false;

  if (!drill) return null;

  const handleSelect = (choice: string) => {
    if (answered || answerLock.current) return;
    answerLock.current = true;
    setSelected(choice);
    const ok = isAnswerCorrect(drill, choice);
    if (step.role === 'main' && ok) setCorrectCount((c) => c + 1);
    if (step.role !== 'main') {
      setSupportAnswered(c => c + 1);
      if (ok) setSupportCorrect(c => c + 1);
    }
    setSaveError(false);
    setSaving(true);
    pendingSave.current = recordDrillAnswer(drill.id, ok)
      .catch(() => setSaveError(true)).finally(() => setSaving(false));
  };

  const handleNext = async () => {
    if (!answered || nextLock.current) return;
    nextLock.current = true;
    await pendingSave.current;
    let nextQueue = queue;
    if (!isCorrect && support) {
      nextQueue = insertSupport(queue, idx, support);
      setQueue(nextQueue);
    }
    if (idx + 1 >= nextQueue.length) {
      const total = drills.length;
      onComplete({
        total,
        supportAnswered, supportCorrect,
        correct: correctCount,
        masteryPct: total ? Math.round((correctCount / total) * 100) : 0,
      });
      return;
    }
    setIdx((i) => i + 1);
    setSelected(null);
    setReason('auto');
    answerLock.current = false;
    nextLock.current = false;
  };

  const choices = displayChoices;
  const hasCue = !!drill.context && drill.context.includes("《");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 進捗 */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-[11px] font-black text-rw-ink-soft tracking-wider">
          {step.role === 'main' ? `本問 ${queue.slice(0, idx + 1).filter(s => s.role === 'main').length} / ${drills.length}` : step.role === 'support' ? '一段手前を確認' : '元の問題に再挑戦'}
        </span>
        <span className="text-[11px] font-black text-rw-ink-soft">本問の正解 {correctCount}</span>
      </div>

      {step.role !== 'main' && <p className="text-xs text-rw-primary mb-3 leading-relaxed" role="status">
        {step.role === 'support' ? `${skillLabel[drill.kind]}から確かめましょう。ここでの正誤は、原因を考える手がかりです。` : '手前の確認を踏まえて、もう一度。時間を空けた復習でも確かめます。'}
      </p>}
      {/* 設問（例文が長いときだけ内部スクロール） */}
      <div className="bg-rw-paper p-3.5 rounded-2xl border-2 border-rw-ink mb-2.5 shrink-0">
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
      <div className="grid grid-cols-1 gap-1.5 shrink-0">
        {choices.map((choice) => {
          const chosen = selected === choice;
          const correctChoice = isAnswerCorrect(drill, choice);
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

      {/* 解説（正誤どちらでも表示）＋「つぎへ」: 残りの高さに置き、長ければスクロール */}
      <div className="flex flex-col flex-1 min-h-0 mt-2.5">
        {answered && (
          <div
            className="p-3 rounded-xl border-l-4 overflow-y-auto min-h-0"
            style={{
              background: isCorrect
                ? "color-mix(in srgb, var(--rw-accent) 14%, transparent)"
                : "var(--rw-primary-soft)",
              borderLeftColor: isCorrect ? "var(--rw-accent)" : "var(--rw-primary)",
            }}
          >
            <p
              className="text-[11px] font-black mb-0.5"
              style={{ color: isCorrect ? "var(--rw-accent)" : "var(--rw-primary)" }}
            >
              {isCorrect ? "◎ 正解！　解説" : "解説"}
            </p>
            <p className="text-[13px] text-rw-ink leading-relaxed">{drill.explanation}</p>
            {!isCorrect && step.role !== 'retry' && added + 2 <= SUPPORT_LIMIT && (
              <fieldset className="mt-4 border-t border-rw-rule pt-3">
                <legend className="text-xs font-bold pt-3">どこで迷いましたか？</legend>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(SUPPORT_REASONS).map(([key, label]) => <button key={key}
                    onClick={() => setReason(key as SupportReason)} aria-pressed={reason === key}
                    className={`text-xs px-3 py-2 rounded-lg border ${reason === key ? 'bg-rw-primary text-rw-paper border-rw-primary' : 'bg-rw-paper text-rw-ink border-rw-rule'}`}>{label}</button>)}
                </div>
                <p className="text-xs mt-3 leading-relaxed">{support
                  ? `${step.role === 'main' ? '本問をすべて解いた後に' : '次に'}、同じ単元の「${skillLabel[support.kind]}」を確認して、この問題に戻ります。原因はまだ決めつけません。`
                  : '対応する下位問題がないため、解説で手順を確認して進みましょう。'}</p>
              </fieldset>
            )}
            {!isCorrect && !support && <Link className="inline-block mt-3 text-xs underline text-rw-primary" to={`/read/reference/${drill.topicId}`}>この単元の基礎を確認する →</Link>}
            {step.role === 'support' && isCorrect && <p className="text-xs mt-3">この確認問題は解けました。元の問題では、どの手がかりを使うか考えてみましょう。</p>}
            {saveError && <p role="alert" className="text-xs mt-3 text-rw-primary">記録を保存できませんでした。通信を確認してください。この回答は保存済みとは扱えません。</p>}
          </div>
        )}
        {answered && (
          <div className="mt-auto pt-2.5 shrink-0">
            <button
              onClick={() => void handleNext()}
              disabled={saving}
              className="w-full bg-rw-primary text-rw-paper font-black rounded-full py-2.5 tracking-widest transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
            >
              {saving ? "記録を保存中…" : !isCorrect && support && (step.role !== 'main' || idx + 1 >= drills.length) ? "一段手前を確認する →" : idx + 1 >= queue.length ? "けっか" : "つぎへ"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
