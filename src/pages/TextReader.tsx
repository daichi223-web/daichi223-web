import { useParams, useSearchParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
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
import { getGemBaseUrl } from "@/lib/kobun/gem";
import { TokenizedText } from "@/components/kobun/TokenizedText";
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
};

const LAYER_BG_CLASSES: Record<LayerId, string> = {
  1: "bg-layer-1",
  2: "bg-layer-2",
  3: "bg-layer-3",
  4: "bg-layer-4",
  5: "bg-layer-5",
};

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
  // 1〜5 を順序固定で並べる（layers 配列の存在有無で活性/非活性を判断）
  const layerIds: LayerId[] = [1, 2, 3, 4, 5];
  const layerMap = new Map<LayerId, LayerDefinition>(
    layers.map((l) => [l.id, l])
  );

  return (
    <div className="flex gap-1 mt-2">
      {layerIds.map((id) => {
        const def = layerMap.get(id);
        const label = LAYER_LABELS[id];
        const isActive = id === currentLayer;
        const isLocked =
          !def ||
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
              {id}・{label}
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
            {id}・{label}
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

  const geminiUrl = getGemBaseUrl();
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
          LAYER {currentLayer} · {layerLabel}
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
              : "全体構造と主語の補完、読解のヒントを確認")}
        </div>
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
      </main>

      {/* テキスト選択ツールバー */}
      <SelectionToolbar textTitle={text.title} />

      {/* スティッキーフッター */}
      <footer className="sticky bottom-0 bg-rw-paper border-t-2 border-rw-ink px-3 py-2">
        <div className="flex gap-2 justify-center flex-wrap">
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
          <a
            href={geminiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full font-bold text-xs px-3.5 py-2 bg-rw-ink text-white border-2 border-rw-ink transition-colors"
            style={{ boxShadow: "0 3px 0 var(--rw-primary)" }}
          >
            ✨ 先生AI
          </a>
        </div>
      </footer>
    </div>
  );
}
