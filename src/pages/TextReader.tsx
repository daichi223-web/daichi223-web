import { useParams, useSearchParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import type {
  KobunText,
  LayerId,
  TextAnalysis,
  ReadingGuide,
} from "@/lib/kobun/types";
import {
  initProgress,
  markTokenViewed,
  setCurrentLayer,
} from "@/lib/kobun/progress";
import { getGemBaseUrl, getNotebookLmUrl } from "@/lib/kobun/gem";
import { TokenizedText } from "@/components/kobun/TokenizedText";
import { LayerSelector } from "@/components/kobun/LayerSelector";
import { TranslationPanel } from "@/components/kobun/TranslationPanel";
import { SelectionToolbar } from "@/components/kobun/SelectionToolbar";
import { LearningPointsPanel } from "@/components/kobun/LearningPointsPanel";

export default function TextReader() {
  const params = useParams<{ textId: string }>();
  const [searchParams] = useSearchParams();
  const textId = params.textId ?? "";
  const layerParam = searchParams.get("layer");

  const [text, setText] = useState<KobunText | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
  const [readingGuide, setReadingGuide] = useState<ReadingGuide | null>(null);
  const [currentLayer, setLayer] = useState<LayerId>(
    (layerParam !== null ? Number(layerParam) : 1) as LayerId
  );
  const [showTranslation, setShowTranslation] = useState(false);
  const [activeSentence, setActiveSentence] = useState<string | null>(null);

  useEffect(() => {
    if (!textId) return;
    fetch(`/texts-v3/${textId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setText(data as KobunText);
        else setNotFoundFlag(true);
      })
      .catch(() => setNotFoundFlag(true));
  }, [textId]);

  useEffect(() => {
    if (!textId) return;
    fetch(`/analysis/${textId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAnalysis(data as TextAnalysis | null))
      .catch(() => setAnalysis(null));
  }, [textId]);

  useEffect(() => {
    if (!textId) return;
    fetch(`/reading/${textId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setReadingGuide(data as ReadingGuide | null))
      .catch(() => setReadingGuide(null));
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

  if (notFoundFlag) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div>テキストが見つかりません</div>
      </div>
    );
  }

  if (!text) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-scaffold">テキストを読み込んでいます...</p>
      </div>
    );
  }

  const geminiUrl = getGemBaseUrl();
  const notebookUrl = getNotebookLmUrl();

  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-washi/95 backdrop-blur border-b border-sumi/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-sm text-scaffold hover:text-sumi transition-colors"
          >
            ← 戻る
          </Link>
          <h1 className="text-base font-bold">{text.title}</h1>
          <LayerSelector
            layers={text.layers}
            currentLayer={currentLayer}
            onChange={handleLayerChange}
          />
        </div>
        <p className="text-xs text-scaffold mt-1 text-center">{text.source}</p>
      </header>

      {/* テキスト本文 */}
      <main className="flex-1 px-4 py-6 space-y-6">
        {/* 学習ポイント */}
        {text.learningPoints && (
          <LearningPointsPanel
            learningPoints={text.learningPoints}
            currentLayer={currentLayer}
          />
        )}

        {text.sentences.map((sentence) => (
          <div key={sentence.id} className="space-y-2">
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
            {showTranslation && (
              <TranslationPanel
                translation={sentence.modernTranslation}
                isActive={activeSentence === sentence.id}
                onToggle={() =>
                  setActiveSentence(
                    activeSentence === sentence.id ? null : sentence.id
                  )
                }
              />
            )}
          </div>
        ))}
      </main>

      {/* テキスト選択ツールバー */}
      <SelectionToolbar textTitle={text.title} />

      {/* フッター */}
      <footer className="sticky bottom-0 bg-washi/95 backdrop-blur border-t border-sumi/10 px-4 py-3">
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className="px-4 py-2 text-sm rounded-lg border border-sumi/20 hover:bg-sumi/5 transition-colors"
          >
            {showTranslation ? "現代語訳を隠す" : "現代語訳を表示"}
          </button>
          <Link
            to={`/texts/${textId}/guide`}
            className="px-4 py-2 text-sm rounded-lg border border-kin text-kin font-bold hover:bg-kin/10 transition-colors"
          >
            解説
          </Link>
          <a
            href={geminiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm rounded-lg bg-shu text-white hover:bg-shu/90 transition-colors"
          >
            先生AIに聞く
          </a>
          <a
            href={notebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm rounded-lg border border-sumi/20 hover:bg-sumi/5 transition-colors"
          >
            NotebookLM
          </a>
        </div>
      </footer>
    </div>
  );
}
