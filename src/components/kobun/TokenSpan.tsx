import type { Token, LayerId } from "@/lib/kobun/types";

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

export function TokenSpan({ token, currentLayer, isActive, onClick }: TokenSpanProps) {
  const isSymbol = token.grammarTag.pos === "記号";

  // 読解レイヤー (5): 全トークンをプレーンテキストとして表示
  if (currentLayer === 5) {
    return (
      <span className="inline">
        {token.furigana ? (
          <ruby>
            {token.text}
            <rp>(</rp>
            <rt className="text-xs">{token.furigana}</rt>
            <rp>)</rp>
          </ruby>
        ) : (
          token.text
        )}
      </span>
    );
  }

  // layer 0 (名詞等) or symbols: 通常テキスト
  if (token.layer === 0 || isSymbol) {
    return (
      <span className="inline">
        {token.furigana ? (
          <ruby>
            {token.text}
            <rp>(</rp>
            <rt className="text-xs">{token.furigana}</rt>
            <rp>)</rp>
          </ruby>
        ) : (
          token.text
        )}
      </span>
    );
  }

  const isScaffold = token.layer > currentLayer;

  if (isScaffold) {
    return (
      <span
        className="token-scaffold inline cursor-pointer"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
      >
        {token.furigana ? (
          <ruby>
            {token.text}
            <rp>(</rp>
            <rt className="text-xs">{token.furigana}</rt>
            <rp>)</rp>
          </ruby>
        ) : (
          token.text
        )}
      </span>
    );
  }

  // 分析対象トークン
  const colorClass = layerColors[token.layer] || "";

  return (
    <span
      className={`token-active inline ${colorClass} ${
        isActive ? "bg-sumi/10 rounded" : ""
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {token.furigana ? (
        <ruby>
          {token.text}
          <rp>(</rp>
          <rt className="text-xs">{token.furigana}</rt>
          <rp>)</rp>
        </ruby>
      ) : (
        token.text
      )}
    </span>
  );
}
