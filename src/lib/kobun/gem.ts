import type { Token, LayerId } from "./types";

/**
 * Gemini Gem 連携
 * Gem ID は先生が Gem 作成後にここを更新する。
 */
const GEM_ID = "1ffOYvDkHJaE13XzPj5r74L-mKFvSFjV-";

const LAYER_LABELS: Record<LayerId, string> = {
  1: "用言",
  2: "助動詞",
  3: "助詞",
  4: "敬語",
  5: "読解",
};

/** ポップオーバーから先生AIに飛ぶURLを構築する */
export function buildGemUrl(params: {
  textTitle: string;
  sentenceText: string;
  token: Token;
  currentLayer: LayerId;
}): string {
  const { textTitle, sentenceText, token, currentLayer } = params;
  const tag = token.grammarTag;

  // 品詞情報を組み立て
  const posInfo = [
    tag.pos,
    tag.baseForm && tag.baseForm !== token.text ? `「${tag.baseForm}」` : "",
    tag.meaning ?? "",
    tag.conjugationForm ?? "",
  ]
    .filter(Boolean)
    .join("・");

  const prompt = [
    `【古文読み】${textTitle}`,
    `文: ${sentenceText}`,
    `語: 「${token.text}」（${posInfo}）`,
    `学習中: Layer ${currentLayer}（${LAYER_LABELS[currentLayer]}）`,
    `この語について教えてください。`,
  ].join("\n");

  const base = GEM_ID
    ? `https://gemini.google.com/gem/${GEM_ID}`
    : `https://gemini.google.com/app`;

  return `${base}?prompt_text=${encodeURIComponent(prompt)}&prompt_action=auto-submit`;
}

/** 選択テキストから先生AIに飛ぶURLを構築する */
export function buildGemSelectionUrl(params: {
  textTitle: string;
  selectedText: string;
}): string {
  const { textTitle, selectedText } = params;
  const prompt = [
    `【古文読み】${textTitle}`,
    `選択箇所: 「${selectedText}」`,
    `この箇所について教えてください。`,
  ].join("\n");

  const base = GEM_ID
    ? `https://gemini.google.com/gem/${GEM_ID}`
    : `https://gemini.google.com/app`;

  return `${base}?prompt_text=${encodeURIComponent(prompt)}&prompt_action=auto-submit`;
}

/** フッター等から Gem を開くだけのURL（プロンプトなし） */
export function getGemBaseUrl(): string {
  return GEM_ID
    ? `https://gemini.google.com/gem/${GEM_ID}`
    : `https://gemini.google.com/app`;
}

/** NotebookLM のURL */
const NOTEBOOK_LM_ID = "7c68c649-51f5-4af6-a537-99b7767d051a";
export function getNotebookLmUrl(): string {
  return `https://notebooklm.google.com/notebook/${NOTEBOOK_LM_ID}`;
}

/** ポップオーバーからNotebookLMに飛ぶURLを構築する */
export function buildNotebookLmUrl(params: {
  token: Token;
  currentLayer: LayerId;
}): string {
  const { token } = params;
  const tag = token.grammarTag;
  const query = `${tag.pos} ${tag.baseForm || token.text}`;
  return `${getNotebookLmUrl()}?query=${encodeURIComponent(query)}`;
}
