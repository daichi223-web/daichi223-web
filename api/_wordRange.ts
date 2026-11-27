// api/_wordRange.ts
// 単語の番号範囲（教員画面の書き出し用）。usageStumbles&export=words&range=101-150 で使う。

/** "101-150" → [101, 150]。不正・逆順は null */
export function parseWordRange(raw: unknown): [number, number] | null {
  const m = typeof raw === "string" ? raw.trim().match(/^(\d{1,4})-(\d{1,4})$/) : null;
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a >= 1 && a <= b ? [a, b] : null;
}

/**
 * 書き出しで数える単語の出題形式（選択式だけ。learning_events.format の値）。
 * 数えない = true-false（○×）・meaning-writing / context-writing（記述）。DB 側は migration 019 の p_word_formats。
 */
export const CHOICE_WORD_FORMATS = ["word-meaning", "word-reverse", "sentence-meaning", "blank-fill", "example-comprehension"];

/** qid "123-2" の番号 123。形が違えば null */
export const wordNo = (qid: string) => {
  const m = /^(\d+)-\d+$/.exec(qid);
  return m ? Number(m[1]) : null;
};
