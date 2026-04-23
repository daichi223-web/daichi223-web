/**
 * 古文読み v3 — 型定義
 */

/** 文法層の定義 */
export type LayerId = 1 | 2 | 3 | 4 | 5;
// 1=用言, 2=助動詞, 3=助詞, 4=敬語, 5=読解

export interface KobunText {
  id: string;
  title: string;
  source: string;
  genre: "説話" | "物語" | "日記" | "随筆" | "和歌";
  difficulty: 1 | 2 | 3;
  layers: LayerDefinition[];
  learningPoints?: LearningPoints;
  sentences: Sentence[];
}

/** 学習ポイント（単元全体 + レイヤー別） */
export interface LearningPoints {
  overview: string[];
  byLayer: LayerPoints[];
}

export interface LayerPoints {
  layer: LayerId;
  label: string;
  keyPoint: string;
  points: LearningPointItem[];
  studySteps?: string[];
}

export interface LearningPointItem {
  text: string;
  priority: SectionPriority;
}

export interface LayerDefinition {
  id: LayerId;
  label: string;
  description: string;
  prerequisite?: LayerId;
}

export interface Sentence {
  id: string;
  originalText: string;
  modernTranslation: string;
  tokens: Token[];
}

export interface Token {
  id: string;
  text: string;
  start: number;
  end: number;
  furigana?: string;
  layer: LayerId | 0;
  grammarTag: GrammarTag;
  translation?: string;
  grammarRefId?: string;
  hint?: string;
}

export interface GrammarTag {
  pos: string;
  conjugationType?: string;
  conjugationForm?: string;
  baseForm?: string;
  meaning?: string;
}

/** 分析データ（遅延読込） */
export interface TextAnalysis {
  textId: string;
  tokenAnalyses: TokenAnalysis[];
}

export interface TokenAnalysis {
  tokenId: string;
  reasoning: ReasoningStep[];
}

export interface ReasoningStep {
  question: string;
  answer: string;
  explanation: string;
}

/** 文法リファレンス */
export interface GrammarTopic {
  id: string;
  title: string;
  category: "用言" | "助動詞" | "助詞" | "敬語" | "識別";
  layer: LayerId;
  summary: string;
  keyPoints?: string[];
  studySteps?: string[];
  sections: GrammarSection[];
  textExamples: TextExample[];
}

export type SectionPriority = "essential" | "important" | "supplementary";

export interface GrammarSection {
  heading: string;
  content: string;
  priority?: SectionPriority;
  image?: string;
}

export interface TextExample {
  textId: string;
  sentenceId: string;
  tokenId: string;
  excerpt: string;
  explanation: string;
}

/** 読解アノテーション */
export interface ReadingGuide {
  textId: string;
  annotations: ReadingAnnotation[];
}

export type ReadingHintType = "subject" | "grammar" | "structure" | "method" | "vocab";

export interface ReadingHint {
  type: ReadingHintType;
  label: string;
  points: string[];
}

export interface ReadingAnnotation {
  sentenceId: string;
  guide: string;
  hints: ReadingHint[];
}

/** 進捗データ（localStorage） */
export interface ReadingProgress {
  textId: string;
  completedLayers: LayerId[];
  currentLayer: LayerId;
  lastReadAt: string;
  tokensViewed: string[];
}
