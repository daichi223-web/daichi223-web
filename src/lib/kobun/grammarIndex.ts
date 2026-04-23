import type { GrammarTopic } from "./types";

/** 文法リファレンスのインデックス（一覧表示用の軽量データ） */
export interface GrammarTopicSummary {
  id: string;
  title: string;
  category: GrammarTopic["category"];
  layer: GrammarTopic["layer"];
  summary: string;
}

export const grammarTopics: GrammarTopicSummary[] = [
  // Layer 1: 用言
  {
    id: "doushi-katsuyo",
    title: "動詞の活用",
    category: "用言",
    layer: 1,
    summary: "四段・上二段・下二段・上一段・下一段・カ変・サ変・ナ変・ラ変の9種類",
  },
  {
    id: "keiyoshi-katsuyo",
    title: "形容詞・形容動詞の活用",
    category: "用言",
    layer: 1,
    summary: "ク活用・シク活用・ナリ活用・タリ活用",
  },
  // Layer 2: 助動詞
  {
    id: "jodoshi-jisei",
    title: "助動詞 時制系",
    category: "助動詞",
    layer: 2,
    summary: "き・けり・つ・ぬ・たり・り — 過去・完了の助動詞",
  },
  {
    id: "jodoshi-suiryo",
    title: "助動詞 推量系",
    category: "助動詞",
    layer: 2,
    summary: "む・らむ・けむ・べし・まじ・らし・めり・なり(伝聞)",
  },
  {
    id: "jodoshi-hitei",
    title: "助動詞 否定系",
    category: "助動詞",
    layer: 2,
    summary: "ず・じ — 打消・打消推量",
  },
  {
    id: "jodoshi-ukemi-shieki-sonkei",
    title: "助動詞 受身・使役・尊敬系",
    category: "助動詞",
    layer: 2,
    summary: "る・らる・す・さす・しむ",
  },
  {
    id: "jodoshi-ganbou",
    title: "助動詞 願望・仮想系",
    category: "助動詞",
    layer: 2,
    summary: "まし・まほし・たし・ごとし",
  },
  {
    id: "jodoshi-dantei",
    title: "助動詞 断定系",
    category: "助動詞",
    layer: 2,
    summary: "なり(断定)・たり(断定)",
  },
  // Layer 3: 助詞
  {
    id: "joshi-kaku",
    title: "格助詞",
    category: "助詞",
    layer: 3,
    summary: "が・の・を・に・へ・と・より・から・にて・して",
  },
  {
    id: "joshi-setsuzoku",
    title: "接続助詞",
    category: "助詞",
    layer: 3,
    summary: "て・に・を・ば・ども・が・ものの・ものを・ものから",
  },
  {
    id: "joshi-fuku-kakari",
    title: "副助詞・係助詞",
    category: "助詞",
    layer: 3,
    summary: "だに・さへ・など・ばかり ＋ ぞ・なむ・や・か・こそ",
  },
  {
    id: "joshi-shujoshi",
    title: "終助詞・準体助詞",
    category: "助詞",
    layer: 3,
    summary: "な・そ・なむ(願望)・ばや・もがな・かな・かも・やも・ぞかし ＋ の・が",
  },
  {
    id: "kakari-musubi",
    title: "係り結び",
    category: "助詞",
    layer: 3,
    summary: "係助詞と結びの法則、例外パターン",
  },
  // Layer 4: 敬語
  {
    id: "keigo",
    title: "敬語",
    category: "敬語",
    layer: 4,
    summary: "尊敬語・謙譲語・丁寧語の体系と敬意の方向",
  },
  // 識別
  {
    id: "shikibetsu",
    title: "紛らわしい語の識別",
    category: "識別",
    layer: 2,
    summary: "「に」「なり」「る」「ぬ」など紛らわしい21語の判別法",
  },
];

/** カテゴリでフィルタ */
export function getTopicsByCategory(category: string): GrammarTopicSummary[] {
  const catMap: Record<string, GrammarTopic["category"][]> = {
    yougen: ["用言"],
    jodoshi: ["助動詞"],
    joshi: ["助詞"],
    keigo: ["敬語", "識別"],
  };
  const cats = catMap[category];
  if (!cats) return grammarTopics;
  return grammarTopics.filter((t) => cats.includes(t.category));
}
