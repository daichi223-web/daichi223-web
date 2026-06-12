import { useState } from "react";
import type { GrammarDrill } from "@/lib/kobun/types";
import { recordDrillAnswer } from "@/lib/kobun/dojoData";

export interface DrillResult {
  total: number;
  correct: number;
  masteryPct: number;
}

function isAnswerCorrect(drill: GrammarDrill, choice: string): boolean {
  const a = drill.answer;
  return Array.isArray(a) ? a.includes(choice) : a === choice;
}

/**
 * 文法ドリルのセッション。選択式の小問を1問ずつ出題し、
 * 正誤を recordDrillAnswer（word_stats + srs_state）に記録、
 * 完了時に到達度を onComplete で返す。
 */
export function DrillSession({
  drills,
  onComplete,
}: {
  drills: GrammarDrill[];
  onComplete: (result: DrillResult) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const drill = drills[idx];
  const answered = selected !== null;
  const isCorrect = answered && drill ? isAnswerCorrect(drill, selected) : false;

  if (!drill) return null;

  const handleSelect = (choice: string) => {
    if (answered) return;
    setSelected(choice);
    const ok = isAnswerCorrect(drill, choice);
    if (ok) setCorrectCount((c) => c + 1);
    void recordDrillAnswer(drill.id, ok);
  };

  const handleNext = () => {
    if (idx + 1 >= drills.length) {
      const total = drills.length;
      onComplete({
        total,
        correct: correctCount,
        masteryPct: total ? Math.round((correctCount / total) * 100) : 0,
      });
      return;
    }
    setIdx((i) => i + 1);
    setSelected(null);
  };

  const choices = drill.choices ?? [];

  return (
    <div>
      {/* 進捗 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-black text-rw-ink-soft tracking-wider">
          {idx + 1} / {drills.length}
        </span>
        <span className="text-[11px] font-black text-rw-ink-soft">正解 {correctCount}</span>
      </div>

      {/* 設問 */}
      <div className="bg-rw-paper p-5 rounded-2xl border-2 border-rw-ink mb-4">
        {drill.context && (
          <p className="text-rw-ink font-serif text-base leading-relaxed mb-3 pb-3 border-b border-rw-rule">
            {drill.context}
          </p>
        )}
        <p className="text-base font-black text-rw-ink leading-relaxed">{drill.prompt}</p>
      </div>

      {/* 選択肢 */}
      <div className="grid grid-cols-1 gap-2">
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
              className={`text-left font-black py-3.5 px-4 rounded-xl border-2 transition ${cls}`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {/* 解説（誤答時のみ） */}
      {answered && !isCorrect && (
        <div
          className="mt-4 p-4 rounded-2xl border-l-4 bg-rw-primary-soft"
          style={{ borderLeftColor: "var(--rw-primary)" }}
        >
          <p className="text-xs font-black text-rw-primary mb-1">解説</p>
          <p className="text-sm text-rw-ink leading-relaxed">{drill.explanation}</p>
        </div>
      )}

      {/* つぎへ / けっか */}
      {answered && (
        <div className="mt-6 text-center">
          <button
            onClick={handleNext}
            className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
          >
            {idx + 1 >= drills.length ? "けっか" : "つぎへ"}
          </button>
        </div>
      )}
    </div>
  );
}
