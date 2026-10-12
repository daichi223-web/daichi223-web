import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Token } from "@/lib/kobun/types";
import { GROUPS, choiceOf, type ShikibetsuTarget } from "@/lib/kobun/shikibetsu";
import { judgeShikibetsu, type Yure } from "@/lib/kobun/shikibetsuYure";

interface ShikibetsuQuizProps {
  target: ShikibetsuTarget;
  tokens: Token[];
  /** この語の決め手・学習ポイント（教材データにあるものだけ） */
  notes: string[];
  /** どちらとも取れる箇所の指定（両方正解・△） */
  yure?: Yure;
  /** 選んだ選択肢の id（未回答なら null） */
  chosen: string | null;
  onAnswer: (choiceId: string) => void;
  /** 答えを消して、この問題をもう一度解く */
  onRetry: () => void;
  onClose: () => void;
}

/** 識別レイヤーの出題シート。PC は吹き出し、スマホは下から出るシート（GrammarPopover と同じ作り） */
export function ShikibetsuQuiz(props: ShikibetsuQuizProps) {
  const { onClose, target } = props;
  useEffect(() => {
    // シートの中と、いま開いている対象そのもの（押すと閉じる＝トグル）以外を押したら閉じる
    function handleClickOutside(e: PointerEvent) {
      const el = e.target as HTMLElement;
      if (el.closest("[data-shikibetsu-quiz]")) return;
      if (el.closest("[data-shikibetsu-target]")?.getAttribute("data-shikibetsu-target") === target.id) return;
      onClose();
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [onClose, target.id]);

  return (
    <>
      <div
        data-shikibetsu-quiz
        className="hidden sm:block absolute z-20 mt-1 left-0 right-0 max-w-sm mx-auto bg-rw-paper rounded-2xl shadow-lg border-2 border-rw-ink p-4 animate-popover-in"
      >
        <QuizContent {...props} />
      </div>
      <div className="sm:hidden fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div
          data-shikibetsu-quiz
          className="absolute bottom-0 left-0 right-0 bg-rw-paper rounded-t-3xl shadow-2xl p-5 pb-8 animate-slide-up max-h-[80vh] overflow-y-auto border-t-2 border-rw-ink"
        >
          <div className="w-10 h-1 bg-rw-ink/20 rounded-full mx-auto mb-4" />
          <QuizContent {...props} />
        </div>
      </div>
    </>
  );
}

/** 本文の1文を、識別の対象の文字だけ強調して出す */
function SentenceWithTarget({ tokens, target }: { tokens: Token[]; target: ShikibetsuTarget }) {
  const from = new Map(target.parts.map((p) => [p.tokenId, p.from]));
  return (
    <p className="font-serif text-[15px] leading-loose text-rw-ink">
      {tokens.map((t) => {
        const f = from.get(t.id);
        if (f === undefined) return <span key={t.id}>{t.text}</span>;
        return (
          <span key={t.id}>
            {t.text.slice(0, f)}
            <b className="px-0.5 rounded" style={{ background: "color-mix(in srgb, var(--layer-6) 22%, transparent)", color: "var(--layer-6)" }}>
              {t.text.slice(f)}
            </b>
          </span>
        );
      })}
    </p>
  );
}

function QuizContent({ target, tokens, notes, yure, chosen, onAnswer, onRetry, onClose }: ShikibetsuQuizProps) {
  const group = GROUPS[target.group];
  const answered = chosen !== null;
  const verdict = chosen === null ? null : judgeShikibetsu(target, chosen, yure);
  const correct = verdict === "correct";
  const partial = verdict === "partial";
  // 正解の表示に使う選択肢（両方正解の箇所で別の正解を選んだら、それを正解として見せる）
  const shown = correct && chosen ? chosen : target.answer;
  const right = choiceOf(target, shown);
  const picked = chosen ? choiceOf(target, chosen) : undefined;
  // 解説は長いので折りたたむ（答えるたび・問題が変わるたびに閉じる）
  const [showExplain, setShowExplain] = useState(false);
  useEffect(() => setShowExplain(false), [target.id, chosen]);
  const explainToggle = (
    <button
      onClick={() => setShowExplain((v) => !v)}
      aria-expanded={showExplain}
      className="text-xs font-bold underline text-rw-ink"
      style={{ touchAction: "manipulation" }}
    >
      {showExplain ? "▲ 解説を閉じる" : "▼ 解説を見る"}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black tracking-widest" style={{ color: "var(--layer-6)" }}>
          識別 · {group.title}
        </span>
        <button onClick={onClose} className="text-xs font-bold text-rw-ink-soft hover:text-rw-ink" aria-label="閉じる">
          ✕
        </button>
      </div>

      <SentenceWithTarget tokens={tokens} target={target} />

      <p className="text-sm font-black text-rw-ink">この「{target.form}」の正体は？</p>

      <div className="grid gap-1.5">
        {group.choices.map((c) => {
          const isRight = answered && (c.id === target.answer || !!yure?.both?.includes(c.id));
          const isPartialPick = answered && partial && c.id === chosen;
          const isWrongPick = answered && c.id === chosen && verdict === "wrong";
          return (
            <button
              key={c.id}
              disabled={answered}
              onClick={() => onAnswer(c.id)}
              className={`text-left text-sm font-bold rounded-xl px-3 py-2 border-2 transition-colors ${
                isRight
                  ? "border-green-600 bg-green-50 text-green-800"
                  : isPartialPick
                  ? "border-amber-500 bg-amber-50 text-amber-800"
                  : isWrongPick
                  ? "border-red-600 bg-red-50 text-red-800"
                  : answered
                  ? "border-rw-rule text-rw-ink-soft/60"
                  : "border-rw-ink bg-rw-paper text-rw-ink hover:bg-rw-bg"
              }`}
              style={{ touchAction: "manipulation" }}
            >
              {isRight ? "○ " : isPartialPick ? "△ " : isWrongPick ? "✕ " : ""}
              {c.label}
            </button>
          );
        })}
      </div>

      {answered && correct && right && (
        <div className="rounded-xl p-3 bg-green-50 border border-green-200 space-y-1">
          <p className="text-sm font-black text-green-800">正解！ {right.label}</p>
          {yure?.both && <p className="text-xs font-bold text-green-800">この箇所はどちらとも取れます（{yure.both.map((id) => choiceOf(target, id)?.label).join("・")}）</p>}
          {explainToggle}
          {showExplain && (
            <>
              <p className="text-xs text-rw-ink leading-relaxed">決め手: {target.clue}</p>
              {yure && <p className="text-xs text-rw-ink leading-relaxed">{yure.note}</p>}
            </>
          )}
        </div>
      )}

      {answered && partial && right && picked && (
        <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 space-y-2">
          <p className="text-sm font-black text-amber-800">△ {picked.label}とも取れる。ふつうは{right.label}</p>
          {explainToggle}
          {showExplain && (
            <dl className="text-xs text-rw-ink leading-relaxed space-y-1.5">
              <div>
                <dt className="font-black">この箇所の揺れ</dt>
                <dd>{yure?.note}</dd>
              </div>
              <div>
                <dt className="font-black">この箇所の手がかり</dt>
                <dd>{target.clue}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {answered && verdict === "wrong" && right && (
        <div className="rounded-xl p-3 bg-red-50 border border-red-200 space-y-2">
          <p className="text-sm font-black text-red-800">
            正解: {yure?.both ? yure.both.map((id) => choiceOf(target, id)?.label).join("・") + "（どちらとも取れる）" : right.label}
          </p>
          {explainToggle}
          {showExplain && (
          <>
          <dl className="text-xs text-rw-ink leading-relaxed space-y-1.5">
            <div>
              <dt className="font-black">この箇所の手がかり</dt>
              <dd>{target.clue}</dd>
            </div>
            {yure?.both && (
              <div>
                <dt className="font-black">この箇所の揺れ</dt>
                <dd>{yure.note}</dd>
              </div>
            )}
            <div>
              <dt className="font-black">{right.label}の見分け方</dt>
              <dd>{right.rule}</dd>
            </div>
            {picked && (
              <div>
                <dt className="font-black">選んだ答え（{picked.label}）なら</dt>
                <dd>{picked.rule}</dd>
              </div>
            )}
            {notes.length > 0 && (
              <div>
                <dt className="font-black">この語のポイント</dt>
                {notes.map((n, i) => (
                  <dd key={i}>{n}</dd>
                ))}
              </div>
            )}
          </dl>
          <Link
            to={`/read/grammar/${group.topicId}`}
            className="inline-block text-xs font-bold underline"
            style={{ color: "var(--layer-6)" }}
          >
            文法道場で{group.title}を確認 →
          </Link>
          </>
          )}
        </div>
      )}

      {answered && (
        <button
          onClick={onRetry}
          className="w-full text-sm font-bold rounded-xl px-3 py-2 border-2 border-rw-ink bg-rw-paper text-rw-ink hover:bg-rw-bg"
          style={{ touchAction: "manipulation" }}
        >
          ↻ もう一度解く
        </button>
      )}
    </div>
  );
}
