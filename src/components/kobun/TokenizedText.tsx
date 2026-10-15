import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Sentence,
  LayerId,
  TextAnalysis,
  ReadingAnnotation,
  ReadingHintType,
} from "@/lib/kobun/types";
import { TokenSpan } from "@/components/kobun/TokenSpan";
import { GrammarPopover } from "@/components/kobun/GrammarPopover";
import { ShikibetsuQuiz } from "@/components/kobun/ShikibetsuQuiz";
import { findShikibetsu, choiceOf, type ShikibetsuTarget } from "@/lib/kobun/shikibetsu";
import { logEvent } from "@/lib/learningEvents";
import { judgeShikibetsu, yureOf } from "@/lib/kobun/shikibetsuYure";

interface TokenizedTextProps {
  sentence: Sentence;
  currentLayer: LayerId;
  analysis: TextAnalysis | null;
  textTitle: string;
  textId: string;
  onTokenView: (tokenId: string) => void;
  readingAnnotation?: ReadingAnnotation | null;
  /** 変わるたびに識別の答えをすべて消す（教材全体のやり直し） */
  shikiResetKey?: number;
  /** 浮かぶ解説カード（useWordCard）が有効なとき true。語のクリックはカード側が扱い、ここでは GrammarPopover を開かない */
  cardMode?: boolean;
  /** カードが出ている語（色を付ける） */
  highlightTokenId?: string | null;
  /** カードの「もっと」：この語の従来の解説（GrammarPopover）を開く。n は同じ語でもう一度開けるようにする番号 */
  moreRequest?: { id: string; n: number } | null;
}

const hintMeta: Record<ReadingHintType, { icon: string; color: string; bg: string }> = {
  subject: { icon: "👤", color: "text-blue-700", bg: "bg-blue-50" },
  grammar: { icon: "🔤", color: "text-amber-700", bg: "bg-amber-50" },
  structure: { icon: "🔗", color: "text-purple-700", bg: "bg-purple-50" },
  method: { icon: "💡", color: "text-green-700", bg: "bg-green-50" },
  vocab: { icon: "📚", color: "text-purple-700", bg: "bg-purple-50" },
  culture: { icon: "🏛️", color: "text-rose-700", bg: "bg-rose-50" },
};

const hintLabel: Record<ReadingHintType, string> = {
  subject: "主語",
  grammar: "文法",
  structure: "構造",
  method: "読解法",
  vocab: "語彙",
  culture: "古文常識",
};

export function TokenizedText({
  sentence,
  currentLayer,
  analysis,
  textTitle,
  textId,
  onTokenView,
  readingAnnotation,
  shikiResetKey = 0,
  cardMode = false,
  highlightTokenId = null,
  moreRequest = null,
}: TokenizedTextProps) {
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);

  // 浮かぶ解説カードの「もっと」：この文の語なら、従来の解説（GrammarPopover）を開く
  useEffect(() => {
    if (moreRequest && sentence.tokens.some((t) => t.id === moreRequest.id)) {
      setActiveShikiId(null);
      setActiveTokenId(moreRequest.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreRequest?.id, moreRequest?.n]);
  const [openHints, setOpenHints] = useState<Set<number>>(new Set());
  // 識別レイヤー: 対象（文ごとに grammarTag から決める）・開いている対象・答え（このページを開いている間だけ）
  const shikiTargets = useMemo(() => findShikibetsu(sentence.tokens), [sentence.tokens]);
  const shikiByToken = useMemo(() => {
    const m = new Map<string, { target: ShikibetsuTarget; from: number }>();
    for (const t of shikiTargets) for (const p of t.parts) m.set(p.tokenId, { target: t, from: p.from });
    return m;
  }, [shikiTargets]);
  const [activeShikiId, setActiveShikiId] = useState<string | null>(null);
  const [shikiAnswers, setShikiAnswers] = useState<Record<string, string>>({});
  // 何回目の解答か（やり直しを学習ログで初回と分けるため）
  const shikiAttempts = useRef<Record<string, number>>({});
  // 教材全体の「識別をすべてやり直す」
  useEffect(() => {
    if (shikiResetKey === 0) return;
    setShikiAnswers({});
    setActiveShikiId(null);
  }, [shikiResetKey]);
  const isShiki = currentLayer === 6;
  const activeShiki = isShiki ? shikiTargets.find((t) => t.id === activeShikiId) ?? null : null;

  // 解説に添える、この語の決め手（analysis の decider）と学習ポイント（token.hint）
  const shikiNotes = (target: ShikibetsuTarget): string[] => {
    const out: string[] = [];
    for (const p of target.parts) {
      const tok = sentence.tokens.find((t) => t.id === p.tokenId);
      const decider = p.from === 0 ? analysis?.tokenAnalyses.find((a) => a.tokenId === p.tokenId)?.decider : undefined;
      if (decider?.summary) out.push(decider.summary);
      if (tok?.hint) out.push(tok.hint);
    }
    return [...new Set(out)];
  };

  const handleShikiAnswer = (target: ShikibetsuTarget, choiceId: string) => {
    setShikiAnswers((prev) => ({ ...prev, [target.id]: choiceId }));
    const attempt = (shikiAttempts.current[target.id] ?? 0) + 1;
    const verdict = judgeShikibetsu(target, choiceId, yureOf(textId, target));
    shikiAttempts.current[target.id] = attempt;
    logEvent({
      area: "text",
      action: "answer",
      targetType: "shikibetsu",
      targetId: `${textId}:${target.id}`,
      correct: verdict === "correct",
      chosen: choiceOf(target, choiceId)?.label ?? choiceId,
      format: "shikibetsu",
      ctx: { group: target.group, form: target.form, answer: target.answer, attempt, verdict },
    });
  };

  const retryShiki = (target: ShikibetsuTarget) => {
    setShikiAnswers((prev) => {
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
  };

  const openShiki = (target: ShikibetsuTarget) => {
    setActiveTokenId(null);
    setActiveShikiId(activeShikiId === target.id ? null : target.id);
  };

  const activeToken = activeTokenId
    ? sentence.tokens.find((t) => t.id === activeTokenId) ?? null
    : null;

  const activeAnalysis =
    activeTokenId && analysis
      ? analysis.tokenAnalyses.find((a) => a.tokenId === activeTokenId) ?? null
      : null;

  const handleTokenClick = (tokenId: string) => {
    if (activeTokenId === tokenId) {
      setActiveTokenId(null);
    } else {
      setActiveTokenId(tokenId);
      onTokenView(tokenId);
    }
  };

  const toggleHint = (index: number) => {
    setOpenHints((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="relative leading-[2.2] text-lg">
      {sentence.tokens.map((token) => {
        const shiki = isShiki ? shikiByToken.get(token.id) : undefined;
        if (shiki) {
          const chosen = shikiAnswers[shiki.target.id];
          const verdict = chosen === undefined ? null : judgeShikibetsu(shiki.target, chosen, yureOf(textId, shiki.target));
          const color =
            verdict === null ? "var(--layer-6)" : verdict === "correct" ? "#16a34a" : verdict === "partial" ? "#d97706" : "#dc2626";
          const open = () => openShiki(shiki.target);
          return (
            <span
              key={token.id}
              data-shikibetsu-target={shiki.target.id}
              className="inline cursor-pointer"
              onClick={open}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && open()}
              title={`「${shiki.target.form}」の識別`}
            >
              {shiki.from > 0 && !token.furigana ? token.text.slice(0, shiki.from) : null}
              <span
                className="font-bold rounded-sm"
                style={{
                  color,
                  background: `color-mix(in srgb, ${color} ${activeShikiId === shiki.target.id ? 30 : 14}%, transparent)`,
                  borderBottom: `2px solid ${color}`,
                }}
              >
                {token.furigana ? (
                  <ruby>
                    {token.text}
                    <rp>(</rp>
                    <rt className="text-xs">{token.furigana}</rt>
                    <rp>)</rp>
                  </ruby>
                ) : (
                  token.text.slice(shiki.from)
                )}
              </span>
            </span>
          );
        }
        return (
          <TokenSpan
            key={token.id}
            token={token}
            currentLayer={currentLayer}
            isActive={activeTokenId === token.id || highlightTokenId === token.id}
            onClick={() => {
              if (cardMode) return; // 浮かぶカードが有効なときは、教材画面の useWordCard が扱う
              setActiveShikiId(null);
              handleTokenClick(token.id);
            }}
          />
        );
      })}

      {/* 読解レイヤーのアノテーション */}
      {currentLayer === 5 && readingAnnotation && (
        <div className="mt-2 rounded-lg bg-layer-5/5 border border-layer-5/20 p-3 space-y-2">
          <p className="text-xs font-bold text-layer-5 leading-relaxed">
            {readingAnnotation.guide}
          </p>
          <div className="space-y-1">
            {readingAnnotation.hints.map((hint, i) => {
              // 想定外の hint.type にも安全にフォールバック（例: honorific → grammar 表示）
              const meta =
                hintMeta[hint.type] ?? { icon: "🔤", color: "text-amber-700", bg: "bg-amber-50" };
              const label = hintLabel[hint.type] ?? hint.type;
              const isOpen = openHints.has(i);
              return (
                <div key={i} className="rounded-md border border-sumi/10 overflow-hidden">
                  <button
                    onClick={() => toggleHint(i)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-sumi/[0.03] transition-colors"
                  >
                    <span className="text-xs">{meta.icon}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}
                    >
                      {label}
                    </span>
                    <span className="text-xs font-bold text-sumi/80 flex-1">
                      {hint.label}
                    </span>
                    <span
                      className={`text-[9px] text-sumi/40 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▼
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-2 pt-1">
                      <ul className="space-y-1">
                        {hint.points.map((pt, j) => (
                          <li
                            key={j}
                            className="text-xs leading-relaxed text-sumi/70 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-sumi/30"
                          >
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeShiki && (
        <ShikibetsuQuiz
          target={activeShiki}
          tokens={sentence.tokens}
          notes={shikiNotes(activeShiki)}
          yure={yureOf(textId, activeShiki)}
          chosen={shikiAnswers[activeShiki.id] ?? null}
          onAnswer={(id) => handleShikiAnswer(activeShiki, id)}
          onRetry={() => retryShiki(activeShiki)}
          onClose={() => setActiveShikiId(null)}
        />
      )}

      {activeToken && currentLayer !== 5 && (
        <GrammarPopover
          token={activeToken}
          currentLayer={currentLayer}
          analysis={activeAnalysis}
          textTitle={textTitle}
          textId={textId}
          sentenceText={sentence.originalText}
          onClose={() => setActiveTokenId(null)}
        />
      )}
    </div>
  );
}
