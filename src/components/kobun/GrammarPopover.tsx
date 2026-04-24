import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Token, LayerId, TokenAnalysis } from "@/lib/kobun/types";
import { buildGemUrl, buildNotebookLmUrl } from "@/lib/kobun/gem";
import { addVocabEntry } from "@/lib/kobun/progress";
import VocabModal from "@/components/VocabModal";
import bundledVocabIndex from "@/data/vocabIndex.json";

const vocabIndexKeys = new Set(Object.keys(bundledVocabIndex as Record<string, unknown>));

interface GrammarPopoverProps {
  token: Token;
  currentLayer: LayerId;
  analysis: TokenAnalysis | null;
  textTitle: string;
  textId: string;
  sentenceText: string;
  onClose: () => void;
}

export function GrammarPopover({
  token,
  currentLayer,
  analysis,
  textTitle,
  textId,
  sentenceText,
  onClose,
}: GrammarPopoverProps) {
  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-grammar-popover]")) return;
      onClose();
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [onClose]);

  const isScaffold = token.layer > currentLayer;
  const tag = token.grammarTag;

  return (
    <>
      {/* デスクトップ: ポップオーバー */}
      <div
        data-grammar-popover
        className="hidden sm:block absolute z-20 mt-1 left-0 right-0 max-w-xs mx-auto
                   bg-white rounded-lg shadow-lg border border-sumi/10 p-4
                   animate-popover-in"
      >
        <PopoverContent
          token={token}
          isScaffold={isScaffold}
          tag={tag}
          analysis={analysis}
          textTitle={textTitle}
          textId={textId}
          sentenceText={sentenceText}
          currentLayer={currentLayer}
          onClose={onClose}
        />
      </div>

      {/* モバイル: ボトムシート */}
      <div className="sm:hidden fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/20" onClick={onClose} />
        <div
          data-grammar-popover
          className="absolute bottom-0 left-0 right-0
                     bg-white rounded-t-2xl shadow-lg p-5 pb-8
                     animate-slide-up max-h-[70vh] overflow-y-auto"
        >
          <div className="w-10 h-1 bg-sumi/20 rounded-full mx-auto mb-4" />
          <PopoverContent
            token={token}
            isScaffold={isScaffold}
            tag={tag}
            analysis={analysis}
            textTitle={textTitle}
            textId={textId}
            sentenceText={sentenceText}
            currentLayer={currentLayer}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  );
}

function PopoverContent({
  token,
  isScaffold,
  tag,
  analysis,
  textTitle,
  textId,
  sentenceText,
  currentLayer,
  onClose,
}: {
  token: Token;
  isScaffold: boolean;
  tag: Token["grammarTag"];
  analysis: TokenAnalysis | null;
  textTitle: string;
  textId: string;
  sentenceText: string;
  currentLayer: LayerId;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const gemUrl = buildGemUrl({ textTitle, sentenceText, token, currentLayer });
  const nlmUrl = buildNotebookLmUrl({ token, currentLayer });

  const [vocabLemma, setVocabLemma] = useState<string | null>(null);
  // 見出し語 / 表層形のいずれかが vocab DB にあれば「📖 語彙解説」を出せる
  const vocabCandidate = (() => {
    const base = tag.baseForm;
    if (base && vocabIndexKeys.has(base)) return base;
    if (vocabIndexKeys.has(token.text)) return token.text;
    return null;
  })();

  function handleAddVocab() {
    addVocabEntry({
      tokenText: token.text,
      baseForm: tag.baseForm || token.text,
      pos: tag.pos,
      hint: token.hint,
      textId,
      grammarRefId: token.grammarRefId,
      viewedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-bold">{token.text}</p>
        {tag.baseForm && tag.baseForm !== token.text && (
          <p className="text-sm text-scaffold">← {tag.baseForm}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-scaffold">品詞</span>
        <span>{tag.pos}</span>

        {tag.meaning && (
          <>
            <span className="text-scaffold">意味</span>
            <span>{tag.meaning}</span>
          </>
        )}

        {token.translation && (
          <>
            <span className="text-scaffold">訳</span>
            <span>{token.translation}</span>
          </>
        )}

        {!isScaffold && tag.conjugationType && (
          <>
            <span className="text-scaffold">活用型</span>
            <span>{tag.conjugationType}</span>
          </>
        )}

        {!isScaffold && tag.conjugationForm && (
          <>
            <span className="text-scaffold">活用形</span>
            <span>{tag.conjugationForm}</span>
          </>
        )}
      </div>

      {/* 重要ポイント（hint） */}
      {!isScaffold && token.hint && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <p className="text-xs font-bold text-amber-700 mb-0.5">重要ポイント</p>
          <p className="text-sm text-amber-900">{token.hint}</p>
        </div>
      )}

      {/* 判別の筋道（分析対象のみ） */}
      {!isScaffold && analysis && analysis.reasoning.length > 0 && (
        <div className="border-t border-sumi/10 pt-3 space-y-2">
          <p className="text-xs font-bold text-scaffold">判別の筋道</p>
          {analysis.reasoning.map((step, i) => (
            <div key={i} className="text-xs space-y-0.5">
              <p className="text-shu font-bold">Q: {step.question}</p>
              <p>A: {step.answer}</p>
              <p className="text-scaffold">{step.explanation}</p>
            </div>
          ))}
        </div>
      )}

      {/* 単語帳追加ボタン */}
      <div className="border-t border-sumi/10 pt-2">
        <button
          className="text-xs text-scaffold hover:text-sumi transition-colors"
          onClick={handleAddVocab}
        >
          + 単語帳に追加
        </button>
      </div>

      {/* 語彙解説 (vocab DB にある語のみ) */}
      {vocabCandidate && (
        <button
          onClick={() => setVocabLemma(vocabCandidate)}
          className="w-full text-left px-3 py-2 bg-layer-5/5 hover:bg-layer-5/10 border border-layer-5/20 rounded-md text-sm font-bold text-layer-5 transition-colors"
        >
          📖 「{vocabCandidate}」の語彙解説
        </button>
      )}

      {/* リンク3つ横並び */}
      <div className="flex items-center justify-between text-sm">
        {token.grammarRefId ? (
          <button
            className="text-layer-1 hover:underline font-bold"
            onClick={() => {
              onClose();
              navigate(`/read/reference/${token.grammarRefId}`);
            }}
          >
            📘 文法解説 →
          </button>
        ) : (
          <span />
        )}
        <button
          className="text-blue-600 hover:underline"
          onClick={() => {
            window.open(nlmUrl, "_blank", "noopener,noreferrer");
          }}
        >
          NLM →
        </button>
        <button
          className="text-shu hover:text-shu/80 transition-colors"
          onClick={() => {
            window.open(gemUrl, "_blank", "noopener,noreferrer");
          }}
        >
          先生AI →
        </button>
      </div>

      {/* VocabModal — popover より前面に重ねる */}
      {vocabLemma && (
        <VocabModal lemma={vocabLemma} onClose={() => setVocabLemma(null)} />
      )}
    </div>
  );
}
