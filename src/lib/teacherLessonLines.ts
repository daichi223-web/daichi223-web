// 文法の先生の台詞（2026-11-16、ユーザー指示「コメントは単語のものを使い回さないで独自のもの」「ドリルも独自のコメントにして」）。
// 文法道場のドリル（復習も）の答え合わせと、「先生と学ぶ」レッスンの説明の前後の一言。説明そのもの（台本）は全員共通で、ここは口調だけ。
// 先生ごとの文の正本 = F:\A2A\_work\kobun-chat-feedback\lesson-lines\<id>.json → validate.py → apply.py が
// teacherLessonLinesData.ts を書き出す（ts を手で直さない）。決まり = 同フォルダの BRIEF.md。
import { pickVariant, type TeacherId } from "./teachers";
import { TEACHER_LESSON_LINES } from "./teacherLessonLinesData";

/** 状況ごとの台詞（variant の配列） */
export type LessonLines = {
  drillCorrect: string[]; // ドリルの正解
  drillWrong: string[]; // ドリルの不正解（{正解}）
  start: string[]; // レッスンのはじめ（{単元}）
  termsIntro: string[]; // 説明に出てくる言葉（{用語}）
  termsAsk: string[]; // 意味は分かる？
  whichTerm: string[]; // どの言葉？
  moreTerms: string[]; // ほかにも分からない言葉はある？
  termLead: string[]; // 用語の説明の前置き（{用語}）
  partFirst: string[]; // 最初の部分（{部分}）
  partChosen: string[]; // 選んでもらった部分（{部分}）
  partLast: string[]; // 最後の部分（{部分}）
  nextPart: string[]; // 次のおすすめ（{部分}）
  nextAsk: string[]; // どうする？
  otherAsk: string[]; // どこにする？
  knownReply: string[]; // 分かっている部分（{部分}）
  quickLead: string[]; // 説明の途中の1問の前
  askLead: string[]; // 部分の問題の前
  askMore: string[]; // もう1問
  right: string[]; // 途中の1問の正解
  wrong: string[]; // 途中の1問の不正解（{正解}）
  finalCheck: string[]; // 最後に単元の問題で確かめる
  wrapLead: string[]; // まとめの前置き
  wrapPraise: string[]; // まとめるポイントが無いとき
  finish: string[]; // あとはドリルで
};

export const LESSON_LINE_KEYS: readonly (keyof LessonLines)[] = [
  "drillCorrect", "drillWrong", "start", "termsIntro", "termsAsk", "whichTerm", "moreTerms", "termLead",
  "partFirst", "partChosen", "partLast", "nextPart", "nextAsk", "otherAsk", "knownReply",
  "quickLead", "askLead", "askMore", "right", "wrong", "finalCheck", "wrapLead", "wrapPraise", "finish",
];

/** 鍵ごとに必ず入れる変数。値はかぎかっこ込みで渡す（{部分}＝「接続と活用」）。{正解} だけは中身なので「{正解}」と書く */
export const LESSON_LINE_VARS: Partial<Record<keyof LessonLines, string>> = {
  drillWrong: "正解",
  start: "単元",
  termsIntro: "用語",
  termLead: "用語",
  partFirst: "部分",
  partChosen: "部分",
  partLast: "部分",
  nextPart: "部分",
  knownReply: "部分",
  wrong: "正解",
};

/** 字数の上限（全角で数え、{変数} は 10 字として数える） */
export const LESSON_LINE_MAX: Record<keyof LessonLines, number> = {
  drillCorrect: 20, drillWrong: 34, start: 34, termsIntro: 34, termsAsk: 16, whichTerm: 14, moreTerms: 22, termLead: 18,
  partFirst: 24, partChosen: 26, partLast: 24, nextPart: 22, nextAsk: 14, otherAsk: 14, knownReply: 30,
  quickLead: 20, askLead: 22, askMore: 14, right: 18, wrong: 30, finalCheck: 30, wrapLead: 18, wrapPraise: 24, finish: 26,
};

/** 先生の口調を使わない中立の文（TEACHER_VOICE_ENABLED=false のとき。2026-11-15 までの文と同じ） */
export const NEUTRAL_LESSON_LINES: LessonLines = {
  drillCorrect: ["正解。"],
  drillWrong: ["正しくは「{正解}」。"],
  start: ["{単元}を、少しずつ説明していくね。"],
  termsIntro: ["説明には{用語}などの言葉が出てくるよ。"],
  termsAsk: ["意味は分かる？"],
  whichTerm: ["どの言葉？"],
  moreTerms: ["ほかにも分からない言葉はある？"],
  termLead: ["{用語}は、"],
  partFirst: ["まずは{部分}から。"],
  partChosen: ["じゃあ{部分}を説明するね。"],
  partLast: ["最後は{部分}。"],
  nextPart: ["次は{部分}。"],
  nextAsk: ["どうする？"],
  otherAsk: ["どこにする？"],
  knownReply: ["{部分}は分かっているんだね。"],
  quickLead: ["今のところを1問。"],
  askLead: ["この節の問題。確かめよう。"],
  askMore: ["もう1問。"],
  right: ["そのとおり。"],
  wrong: ["正しくは「{正解}」。"],
  finalCheck: ["最後に、この単元の問題で確かめよう。"],
  wrapLead: ["ここまでのまとめ。"],
  wrapPraise: ["ここまでよくがんばったね。"],
  finish: ["あとはドリルで仕上げよう。"],
};

export type LessonVars = { 単元?: string; 用語?: string; 部分?: string; 正解?: string };

/** 台詞を1つ選んで変数を入れる。voice が false か、その先生の文が無いときは中立の文 */
export function lessonLine(key: keyof LessonLines, vars: LessonVars, seed: string, teacher: TeacherId, voice: boolean): string {
  const set = voice ? TEACHER_LESSON_LINES[teacher] : undefined;
  const variants = set?.[key]?.length ? set[key] : NEUTRAL_LESSON_LINES[key];
  const table = vars as Record<string, string | undefined>;
  return pickVariant(variants, `${seed}:${key}`).replace(/\{([^{}]*)\}/g, (_m, k: string) => table[k.trim()] ?? "");
}
