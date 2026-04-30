import type { Token, LayerId } from "@/lib/kobun/types";
import { lookupVocabStatus } from "@/lib/vocabLookup";

interface TokenSpanProps {
  token: Token;
  currentLayer: LayerId;
  isActive: boolean;
  onClick: () => void;
}

const layerColors: Record<number, string> = {
  1: "text-layer-1",
  2: "text-layer-2",
  3: "text-layer-3",
  4: "text-layer-4",
};

/**
 * Reiwa デザイン: トークンの「クイズ対象」「詳細解説あり」を視覚マーク化。
 * - hasQuiz: rw-pop (黄系) の太アンダーライン → 試験範囲・覚えるべき語のサイン
 * - hasExplanation: layer-5 (橙) の点線アンダーライン → 解説でさらに深掘り可
 * - 両方: 上記の組み合わせ
 *
 * クリックすると GrammarPopover が開く既存挙動はそのまま (タップ可能性は変わらない)。
 */
function vocabMarkerStyle(status: ReturnType<typeof lookupVocabStatus>) {
  const { hasQuiz, hasExplanation } = status;
  if (!hasQuiz && !hasExplanation) return undefined;
  if (hasQuiz && hasExplanation) {
    return {
      borderBottom: '2px solid var(--rw-pop)',
      background: 'color-mix(in srgb, var(--rw-pop) 16%, transparent)',
      borderRadius: 2,
      padding: '0 1px',
    };
  }
  if (hasQuiz) {
    return {
      borderBottom: '2px solid var(--rw-pop)',
      padding: '0 1px',
    };
  }
  // hasExplanation only
  return {
    borderBottom: '1.5px dotted var(--layer-5)',
    padding: '0 1px',
  };
}

function TokenContent({ token }: { token: Token }) {
  if (token.furigana) {
    return (
      <ruby>
        {token.text}
        <rp>(</rp>
        <rt className="text-xs">{token.furigana}</rt>
        <rp>)</rp>
      </ruby>
    );
  }
  return <>{token.text}</>;
}

export function TokenSpan({ token, currentLayer, isActive, onClick }: TokenSpanProps) {
  const isSymbol = token.grammarTag.pos === "記号";
  const baseForm = token.grammarTag?.baseForm;
  const pos = token.grammarTag?.pos;
  const status = isSymbol
    ? { hasQuiz: false, hasExplanation: false, quizQids: [], explanationLemma: null }
    : lookupVocabStatus(token.text, baseForm, pos);
  const markerStyle = vocabMarkerStyle(status);
  const titleHint =
    status.hasQuiz && status.hasExplanation
      ? '重要語: クイズ + 詳細解説あり'
      : status.hasQuiz
      ? 'クイズに出る重要語'
      : status.hasExplanation
      ? '詳細解説あり'
      : undefined;

  // 読解レイヤー (5): 全トークンをプレーンテキストとして表示するが、
  // vocab status マーカーは付与する (重要語の見落とし防止)
  if (currentLayer === 5) {
    if (markerStyle) {
      return (
        <span
          className="inline cursor-pointer"
          style={markerStyle}
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onClick()}
          title={titleHint}
        >
          <TokenContent token={token} />
        </span>
      );
    }
    return (
      <span className="inline">
        <TokenContent token={token} />
      </span>
    );
  }

  // layer 0 (名詞等) or symbols: 通常テキスト + vocab マーカー (あれば)
  if (token.layer === 0 || isSymbol) {
    if (markerStyle && !isSymbol) {
      return (
        <span
          className="inline cursor-pointer"
          style={markerStyle}
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onClick()}
          title={titleHint}
        >
          <TokenContent token={token} />
        </span>
      );
    }
    return (
      <span className="inline">
        <TokenContent token={token} />
      </span>
    );
  }

  const isScaffold = token.layer > currentLayer;

  if (isScaffold) {
    return (
      <span
        className="token-scaffold inline cursor-pointer"
        style={markerStyle}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        title={titleHint}
      >
        <TokenContent token={token} />
      </span>
    );
  }

  // 分析対象トークン
  const colorClass = layerColors[token.layer] || "";

  return (
    <span
      className={`token-active inline ${colorClass} ${isActive ? "bg-sumi/10 rounded" : ""}`}
      style={markerStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      title={titleHint}
    >
      <TokenContent token={token} />
    </span>
  );
}
