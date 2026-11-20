import { pickVariant, type TeacherId } from './teachers';
import { TEACHER_STREAK_LINES } from './teacherStreakLinesData';

// 連続正解のお褒め（2026-11-19 ユーザー指示「連続正解の回数が増えたときの5回くらい？たまに出るお褒めの言葉パターンをいくつか用意して」）。
// 5問続けて正解したとき・10問・その後は5問ごとに、判定の吹き出しのすぐ後に先生がひとこと褒める。
// 台詞の正本 = F:\A2A\_work\kobun-chat-feedback\streak\<id>.json → validate_streak.py → apply_streak.py → teacherStreakLinesData.ts（生成物）。
// 先生の台詞が無いときは中立の文（NEUTRAL_STREAK_LINES）。

export type StreakTier = 'five' | 'ten' | 'more';
export type StreakLines = Readonly<Record<StreakTier, readonly string[]>>;

/** 先生の台詞が無いとき・口調を使わないとき。{回数} は連続の数 */
export const NEUTRAL_STREAK_LINES: StreakLines = {
  five: ['5問連続で正解です。調子がいいですね。', 'これで5問続けて正解。この調子でいきましょう。', '5連続正解。よく覚えています。'],
  ten: ['10問連続で正解です。すばらしい。', '10問続けて正解。しっかり身についています。', '10連続正解。見事です。'],
  more: ['{回数}問連続で正解です。まだ続きますね。', '{回数}連続正解。記録を伸ばしています。', '{回数}問続けて正解。たいしたものです。'],
};

/** 何問連続のとき褒めるか。5・10・それより後は5問ごと。ほかは null */
export function streakTier(count: number): StreakTier | null {
  if (count < 5 || count % 5 !== 0) return null;
  return count === 5 ? 'five' : count === 10 ? 'ten' : 'more';
}

export function streakLinesOf(teacher: TeacherId, voice = true): StreakLines {
  return (voice && TEACHER_STREAK_LINES[teacher]) || NEUTRAL_STREAK_LINES;
}

/** 褒める回なら先生のひとこと、そうでなければ null。seed は同じ問題で同じ文にするため */
export function streakPraise(teacher: TeacherId, count: number | undefined, seed: string, voice = true): string | null {
  const tier = count ? streakTier(count) : null;
  if (!tier || !count) return null;
  const n = String(count);
  return pickVariant(streakLinesOf(teacher, voice)[tier], `${seed}:streak:${n}`).replace(/\{回数\}/g, n);
}

// ── 1回のクイズの中の連続正解を数える ──
// 答え合わせの画面は描き直されることがあるので、問題ごとに1回だけ数える（同じ問題なら前に数えた値を返す）。
// 新しいクイズを始めたら resetAnswerStreak。

let current = 0;
let seen = new WeakMap<object, number>();

/** 問題の正誤を記録して、この問題の時点の連続正解数を返す。同じ問題は何度呼んでも同じ値 */
export function noteAnswer(question: object, correct: boolean): number {
  const before = seen.get(question);
  if (before !== undefined) return before;
  current = correct ? current + 1 : 0;
  seen.set(question, current);
  return current;
}

export function resetAnswerStreak(): void {
  current = 0;
  seen = new WeakMap();
}
