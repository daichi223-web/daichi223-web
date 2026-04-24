import { useState } from "react";
import type {
  Sentence,
  LayerId,
  TextAnalysis,
  ReadingAnnotation,
  ReadingHintType,
} from "@/lib/kobun/types";
import { TokenSpan } from "@/components/kobun/TokenSpan";
import { GrammarPopover } from "@/components/kobun/GrammarPopover";

interface TokenizedTextProps {
  sentence: Sentence;
  currentLayer: LayerId;
  analysis: TextAnalysis | null;
  textTitle: string;
  textId: string;
  onTokenView: (tokenId: string) => void;
  readingAnnotation?: ReadingAnnotation | null;
}

const hintMeta: Record<ReadingHintType, { icon: string; color: string; bg: string }> = {
  subject: { icon: "👤", color: "text-blue-700", bg: "bg-blue-50" },
  grammar: { icon: "🔤", color: "text-amber-700", bg: "bg-amber-50" },
  structure: { icon: "🔗", color: "text-purple-700", bg: "bg-purple-50" },
  method: { icon: "💡", color: "text-green-700", bg: "bg-green-50" },
  vocab: { icon: "📚", color: "text-purple-700", bg: "bg-purple-50" },
};

const hintLabel: Record<ReadingHintType, string> = {
  subject: "主語",
  grammar: "文法",
  structure: "構造",
  method: "読解法",
  vocab: "語彙",
};

export function TokenizedText({
  sentence,
  currentLayer,
  analysis,
  textTitle,
  textId,
  onTokenView,
  readingAnnotation,
}: TokenizedTextProps) {
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
  const [openHints, setOpenHints] = useState<Set<number>>(new Set());

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
      {sentence.tokens.map((token) => (
        <TokenSpan
          key={token.id}
          token={token}
          currentLayer={currentLayer}
          isActive={activeTokenId === token.id}
          onClick={() => handleTokenClick(token.id)}
        />
      ))}

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
