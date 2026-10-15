import { useParams, useSearchParams, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import type {
  KobunText,
  LayerId,
  LayerDefinition,
  TextAnalysis,
  ReadingGuide,
} from "@/lib/kobun/types";
import {
  initProgress,
  markTokenViewed,
  setCurrentLayer,
} from "@/lib/kobun/progress";
import { TokenizedText } from "@/components/kobun/TokenizedText";
import { useWordCard, type WordCardTokenInfo } from "@/components/kobun/useWordCard";
import { SelectionToolbar } from "@/components/kobun/SelectionToolbar";
import { LearningPointsPanel } from "@/components/kobun/LearningPointsPanel";
import { fetchJsonAsset } from "@/lib/fetchJson";

type LoadError = "not-found" | "intercepted" | "network";

const LAYER_LABELS: Record<LayerId, string> = {
  1: "用言",
  2: "助動詞",
  3: "助詞",
  4: "敬語",
  5: "読解",
  6: "識別",
};

const LAYER_BG_CLASSES: Record<LayerId, string> = {
  1: "bg-layer-1",
  2: "bg-layer-2",
  3: "bg-layer-3",
  4: "bg-layer-4",
  5: "bg-layer-5",
  6: "bg-layer-6",
};

// 画面での並び。識別(6)は後から足したので、敬語(4)と読解(5)の間に置く。表示の番号は並び順
const LAYER_ORDER: LayerId[] = [1, 2, 3, 4, 6, 5];
const layerNo = (layer: LayerId) => LAYER_ORDER.indexOf(layer) + 1;

// レイヤー番号→ CSS variable 文字列（インラインスタイル用）
const layerVar = (layer: LayerId) => `var(--layer-${layer})`;

interface ReiwaLayerSelectorProps {
  layers: LayerDefinition[];
  currentLayer: LayerId;
  onChange: (layer: LayerId) => void;
}

function ReiwaLayerSelector({
  layers,
  currentLayer,
  onChange,
}: ReiwaLayerSelectorProps) {
  // 順序固定で並べる（layers 配列の存在有無で活性/非活性を判断。識別は教材データに定義が無く、いつでも開ける）
  const layerMap = new Map<LayerId, LayerDefinition>(
    layers.map((l) => [l.id, l])
  );

  return (
    <div className="flex gap-1 mt-2">
      {LAYER_ORDER.map((id) => {
        const def = layerMap.get(id);
        const label = LAYER_LABELS[id];
        const isActive = id === currentLayer;
        const isLocked =
          id === 6
            ? false
            : !def ||
              (id !== 5 && def.prerequisite ? def.prerequisite > currentLayer : false);

        if (isActive) {
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-extrabold border-2 border-rw-ink text-white transition-all ${LAYER_BG_CLASSES[id]}`}
              style={{ boxShadow: "0 2px 0 var(--rw-ink)" }}
              title={def?.label ?? label}
            >
              {layerNo(id)}・{label}
            </button>
          );
        }

        return (
          <button
            key={id}
            onClick={() => !isLocked && onChange(id)}
            disabled={isLocked}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-extrabold border-[1.5px] border-rw-rule bg-rw-bg transition-all ${
              isLocked
                ? "text-rw-ink-soft/40 cursor-not-allowed"
                : "text-rw-ink-soft hover:bg-rw-paper"
            }`}
            title={def?.label ?? label}
          >
            {layerNo(id)}・{label}
          </button>
        );
      })}
    </div>
  );
}

export default function TextReader() {
  const params = useParams<{ textId: string }>();
  const [searchParams] = useSearchParams();
  const textId = params.textId ?? "";
  const layerParam = searchParams.get("layer");

  const [text, setText] = useState<KobunText | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
  const [readingGuide, setReadingGuide] = useState<ReadingGuide | null>(null);
  const [currentLayer, setLayer] = useState<LayerId>(
    (layerParam !== null ? Number(layerParam) : 1) as LayerId
  );
  const [showTranslation, setShowTranslation] = useState(false);
  // 語の近くに浮かぶ短い解説カード＋画面下の訳の帯（2026-10-16〜）。既定で全教材。端末ごとに「従来の表示」へ戻せる。
  // 読解(5)は従来どおり解説を出さず、識別(6)は識別の出題を使う
  const [cardPref, setCardPref] = useState<boolean>(() => {
    try { return localStorage.getItem("kobun-word-card") !== "off"; } catch { return true; }
  });
  const cardMode = cardPref && currentLayer !== 5 && currentLayer !== 6;
  const toggleCardPref = () => {
    setCardPref((v) => { try { localStorage.setItem("kobun-word-card", v ? "off" : "on"); } catch { /* noop */ } return !v; });
  };
  const [focusSentence, setFocusSentence] = useState<string | null>(null);
  const [moreRequest, setMoreRequest] = useState<{ id: string; n: number } | null>(null);
  const CARD_BAND_H = 150; // 画面下の帯＋ボタン列のおおよその高さ（カードを重ねない）
  // 識別レイヤーの「すべてやり直す」（数が変わると各文の答えを消す）
  const [shikiResetKey, setShikiResetKey] = useState(0);
  const [activeSentence, setActiveSentence] = useState<string | null>(null);

  useEffect(() => {
    if (!textId) return;
    fetchJsonAsset<KobunText>(`/texts-v3/${textId}.json`).then((r) => {
      if (r.ok) setText(r.data);
      else setLoadError(r.kind);
    });
  }, [textId]);

  useEffect(() => {
    if (!textId) return;
    fetchJsonAsset<TextAnalysis>(`/analysis/${textId}.json`).then((r) => {
      setAnalysis(r.ok ? r.data : null);
    });
  }, [textId]);

  useEffect(() => {
    if (!textId) return;
    fetchJsonAsset<ReadingGuide>(`/reading/${textId}.json`).then((r) => {
      setReadingGuide(r.ok ? r.data : null);
    });
  }, [textId]);

  useEffect(() => {
    if (textId) {
      initProgress(textId);
    }
  }, [textId]);

  const handleLayerChange = (layer: LayerId) => {
    setLayer(layer);
    setCurrentLayer(textId, layer);
  };

  const handleTokenView = (tokenId: string) => {
    markTokenViewed(textId, tokenId);
  };

  // 浮かぶ解説カード：教材の全トークン（id → トークンと文）。フックは早期 return より前に呼ぶ
  const cardTokens = useMemo(() => {
    const m = new Map<string, WordCardTokenInfo>();
    for (const s of text?.sentences ?? []) for (const t of s.tokens) m.set(t.id, { token: t, sentenceId: s.id });
    return m;
  }, [text]);
  const wordCard = useWordCard({
    enabled: cardMode && !!text,
    textId,
    tokens: cardTokens,
    analysis,
    avoidBottom: CARD_BAND_H,
    onFocusSentence: (sid) => { setFocusSentence(sid); },
    onMore: (id) => { handleTokenView(id); setMoreRequest((r) => ({ id, n: (r?.n ?? 0) + 1 })); },
  });

  if (loadError) {
    return (
      <div className="min-h-dvh bg-rw-bg flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <Link
            to="/read"
            className="text-sm text-rw-ink-soft hover:text-rw-ink"
          >
            ← 読解トップへ
          </Link>
          {loadError === "not-found" ? (
            <p className="text-rw-ink">テキストが見つかりません</p>
          ) : (
            <>
              <p className="text-base font-bold text-rw-ink">
                テキストを読み込めませんでした
              </p>
              <p className="text-sm text-rw-ink-soft">
                学校などのセキュリティ環境から一部リソースが遮断されている可能性があります。
                時間をおくか、学外ネットワークで再度お試しください。
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm rounded-full bg-rw-primary text-white font-bold border-2 border-rw-ink transition-colors"
                style={{ boxShadow: "0 2px 0 var(--rw-ink)" }}
              >
                リロード
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!text) {
    return (
      <div className="min-h-dvh bg-rw-bg flex items-center justify-center">
        <p className="text-rw-ink-soft">テキストを読み込んでいます...</p>
      </div>
    );
  }

  const layerColorVar = layerVar(currentLayer);
  const layerLabel = LAYER_LABELS[currentLayer];

  // 現在レイヤーの description（layers 定義に存在すれば表示）
  const currentLayerDef = text.layers.find((l) => l.id === currentLayer);

  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto bg-rw-bg text-rw-ink">
      {/* スティッキーヘッダー */}
      <header className="sticky top-0 z-10 bg-rw-paper border-b-2 border-rw-ink px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/read"
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors shrink-0"
          >
            ← 戻る
          </Link>
          <div className="flex flex-col items-center min-w-0 flex-1">
            <h1 className="text-sm font-black text-rw-ink truncate tracking-tight">
              {text.title}
            </h1>
            {text.source && (
              <p className="text-[10px] font-bold text-rw-ink-soft truncate">
                {text.source}
              </p>
            )}
          </div>
          {/* 右側スペーサー（戻るリンクとセンタリング均衡用） */}
          <span className="text-sm font-bold text-transparent shrink-0 select-none">
            ← 戻る
          </span>
        </div>
        {/* レイヤーセレクター */}
        <ReiwaLayerSelector
          layers={text.layers}
          currentLayer={currentLayer}
          onChange={handleLayerChange}
        />
      </header>

      {/* レイヤーステッチバナー */}
      <div
        className="px-4 py-2.5 border-b border-rw-rule"
        style={{
          background: `color-mix(in srgb, ${layerColorVar} 22%, transparent)`,
          borderLeft: `4px solid ${layerColorVar}`,
        }}
      >
        <div
          className="text-[10px] font-black tracking-widest"
          style={{ color: layerColorVar }}
        >
          LAYER {layerNo(currentLayer)} · {layerLabel}
        </div>
        <div className="text-xs font-semibold text-rw-ink mt-0.5 leading-relaxed">
          {currentLayerDef?.description ??
            (currentLayer === 1
              ? "動詞・形容詞・形容動詞などの活用に注目"
              : currentLayer === 2
              ? "「ぬ」「べし」「たり」など、文末の活用に注目"
              : currentLayer === 3
              ? "係り結びや接続助詞のはたらきに注目"
              : currentLayer === 4
              ? "尊敬語・謙譲語・丁寧語の主体に注目"
              : currentLayer === 6
              ? "「に」「なり」「なむ」「らむ」など紛らわしい語をタップして、正体を当てよう"
              : "全体構造と主語の補完、読解のヒントを確認")}
        </div>
        {currentLayer === 6 && (
          <button
            onClick={() => setShikiResetKey((k) => k + 1)}
            className="mt-2 rounded-full font-bold text-xs px-3 py-1 bg-rw-paper border-2 border-rw-ink text-rw-ink hover:bg-rw-bg"
            style={{ touchAction: "manipulation" }}
          >
            ↻ 識別をすべてやり直す
          </button>
        )}
      </div>

      {/* 本文 */}
      <main className="flex-1 px-4 py-4 space-y-3">
        {/* Layer 5 読解ガイド準備中バナー */}
        {currentLayer === 5 && !readingGuide && (
          <div
            className="rounded-xl p-3 text-center border"
            style={{
              background: "color-mix(in srgb, var(--layer-5) 8%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--layer-5) 30%, transparent)",
            }}
          >
            <p
              className="text-sm font-bold"
              style={{ color: "var(--layer-5)" }}
            >
              読解ガイドは準備中です
            </p>
            <p className="text-xs text-rw-ink-soft mt-1">
              この教材のレイヤー 5
              用アノテーションはまだ作成されていません。本文と振り仮名のみ表示されます。
            </p>
          </div>
        )}

        {/* 学習ポイント */}
        {text.learningPoints && (
          <LearningPointsPanel
            learningPoints={text.learningPoints}
            currentLayer={currentLayer}
          />
        )}

        <div ref={wordCard.rootRef} {...wordCard.bind} className="space-y-3">
        {text.sentences.map((sentence) => (
          <div key={sentence.id} className="space-y-1.5">
            {/* 本文 (枠なし、行間広めの読み物体裁) */}
            <div
              className="font-serif text-rw-ink"
              style={{ fontSize: "17px", lineHeight: 2.2 }}
            >
              <TokenizedText
                sentence={sentence}
                currentLayer={currentLayer}
                analysis={analysis}
                textTitle={text.title}
                textId={textId}
                onTokenView={handleTokenView}
                shikiResetKey={shikiResetKey}
                cardMode={cardMode}
                highlightTokenId={wordCard.activeId}
                moreRequest={moreRequest}
                readingAnnotation={
                  readingGuide?.annotations.find(
                    (a) => a.sentenceId === sentence.id
                  ) ?? null
                }
              />
            </div>
            {/* 現代語訳 (薄背景、枠なし、左ボーダーのみ) */}
            {showTranslation && (
              <div
                onClick={() =>
                  setActiveSentence(
                    activeSentence === sentence.id ? null : sentence.id
                  )
                }
                className="border-l-4 border-rw-primary pl-3 py-1 cursor-pointer transition-opacity"
                style={{
                  background: 'var(--rw-primary-soft)',
                  opacity:
                    activeSentence === null || activeSentence === sentence.id
                      ? 1
                      : 0.55,
                }}
              >
                <p className="text-sm leading-relaxed text-rw-ink">
                  {sentence.modernTranslation}
                </p>
              </div>
            )}
          </div>
        ))}
        </div>
        {wordCard.element}
      </main>

      {/* テキスト選択ツールバー */}
      <SelectionToolbar textTitle={text.title} />

      {/* スティッキーフッター */}
      <footer className="sticky bottom-0 bg-rw-paper border-t-2 border-rw-ink px-3 py-2">
        {/* 触れた語のある文の訳（高さ固定。本文は動かさない） */}
        {cardMode && (
          <div
            className="text-sm leading-relaxed text-rw-ink mb-2 px-1 overflow-y-auto"
            style={{ height: "4.2em", borderLeft: "4px solid var(--rw-primary)", paddingLeft: 10, background: "var(--rw-primary-soft)" }}
            aria-live="polite"
          >
            {(() => {
              const s = focusSentence ? text.sentences.find((x) => x.id === focusSentence) : null;
              return s ? (
                <>
                  <span className="text-[11px] font-bold text-rw-ink-soft mr-2">訳</span>
                  {s.modernTranslation}
                </>
              ) : (
                <span className="text-rw-ink-soft text-xs">
                  語にマウスを重ねる・指を当てると説明が出て、その文の訳がここに出ます。クリック・タップで固定。
                </span>
              );
            })()}
          </div>
        )}
        <div className="flex gap-2 justify-center flex-wrap">
          {currentLayer !== 5 && currentLayer !== 6 && (
            <button
              onClick={toggleCardPref}
              aria-pressed={cardPref}
              title={cardPref ? "語の解説を従来の表示（文の下・画面下のシート）に戻す" : "語の近くに浮かぶ解説に切り替える"}
              className="rounded-full font-bold text-xs px-3.5 py-2 bg-rw-paper border-2 border-rw-ink text-rw-ink hover:bg-rw-bg transition-colors"
            >
              {cardPref ? "解説：カード" : "解説：従来"}
            </button>
          )}
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className="rounded-full font-bold text-xs px-3.5 py-2 bg-rw-paper border-2 border-rw-ink text-rw-ink hover:bg-rw-bg transition-colors"
          >
            {showTranslation ? "現代語訳を隠す" : "現代語訳を表示"}
          </button>
          <Link
            to={`/read/texts/${textId}/guide`}
            className="rounded-full font-bold text-xs px-3.5 py-2 bg-rw-paper border-2 border-rw-ink text-rw-ink hover:bg-rw-bg transition-colors"
          >
            📖 解説
          </Link>
          <Link
            to={`/read/texts/${textId}/print`}
            className="rounded-full font-bold text-xs px-3.5 py-2 bg-rw-paper border-2 border-rw-ink text-rw-ink hover:bg-rw-bg transition-colors"
          >
            🖨 品詞分解PDF
          </Link>
          {/* 先生AI のボタンは 2026-10-09 にいったん外した（復帰は getGemBaseUrl） */}
        </div>
      </footer>
    </div>
  );
}
