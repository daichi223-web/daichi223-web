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

export type ReadingHintType = "subject" | "grammar" | "structure" | "method" | "vocab" | "culture";

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

/* ═══════════════════════════════════════════
   文法道場（Grammar Dojo）— Supabase 駆動の学習層
   解説は既存 reference(static JSON) を流用し、
   動画(mp4)・ドリル・進捗を Supabase で管理する。
   ═══════════════════════════════════════════ */

/** 講義動画。mp4 は Supabase Storage バケット `grammar-videos` に格納 */
export interface GrammarMedia {
  kind: "mp4"; // 将来 "youtube" 等へ拡張可
  storagePath: string; // バケット内パス 例 "jodoshi-mu.mp4"
  title: string;
  sec?: number; // 尺（秒）
  posterPath?: string; // サムネ（バケット内パス）
}

export type GrammarDrillKind =
  | "katsuyo-type" // 活用の種類判別（四段/上二…・ク/シク・ナリ/タリ）
  | "katsuyo-fill" // 活用形を答える（空欄補充）
  | "table-complete" // 活用表の複数空欄
  | "setsuzoku" // 接続を答える（助動詞）
  | "imi" // 意味判別（文脈つき）
  | "shikibetsu"; // 紛らわしい語の識別

/** ドリル1問。id は SRS(srs_state)/word_stats の qid に流用（例 "jodoshi-mu-01"） */
export interface GrammarDrill {
  id: string;
  topicId: string;
  kind: GrammarDrillKind;
  prompt: string;
  context?: string; // 例文（意味判別・識別で使用）
  choices?: string[]; // 選択式の選択肢
  answer: string | string[];
  explanation: string;
  refHeading?: string; // 該当リファレンス節の heading へジャンプ
  sort?: number; // 出題順。100の位で難度レベルを表す（<100=Lv1, 100台=Lv2, 200台=Lv3）
}

/** 助動詞例文集の1例（grammar_reibun） */
export interface GrammarReibun {
  id: string;
  jodoshi: string;
  meaningKey: string;
  meaning: string;
  sentence: string; // 本文（判定対象=【】, 決め手=《》）
  translation: string;
  source: string;
  workKey?: string;
  context?: string; // 場面解説
  decider?: string; // 決め手
  period?: string;
  confidence: "high" | "medium" | "low";
  verified: boolean;
  isQuiz: boolean;
  layer?: "kata" | "mazeru" | "jissen";
}

/** 助動詞×意味マスタ（選択肢セット＋決め手の総則, grammar_jodoshi_meanings） */
export interface GrammarJodoshiMeaning {
  meaningKey: string;
  jodoshi: string;
  meaning: string;
  deciderRule: string;
}

/** 単元到達度（per-user, grammar_topic_progress） */
export interface TopicProgress {
  topicId: string;
  watched: boolean;
  drillTotal: number;
  drillCorrect: number;
  masteryPct: number; // 0-100
}
