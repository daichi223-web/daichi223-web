/**
 * セッションの最後の「もう一度」（2026-11-05）。
 * 単語クイズで間違えた語を、最後に1回だけ同じ形式でもう一度出す（選択肢の並びは混ぜ直す）。
 * 誤答の直後にもう一度思い出させるため。再出題は練習扱いで、SRS・正答数・記述の候補は進めない
 * （正解しても箱が上がらないので、翌日の復習はそのまま残る）。記録は logEvent の ctx.retry だけ。
 */
import { shuffle } from '../shuffle';

export type RetryableQuestion<O> = {
  correct: { qid: string };
  options: O[];
  retry?: boolean;
};

export function buildRetryRound<O, Q extends RetryableQuestion<O>>(
  questions: Q[],
  wrongQids: ReadonlySet<string>,
  rng: () => number = Math.random,
): Q[] {
  const seen = new Set<string>();
  const out: Q[] = [];
  for (const q of questions) {
    const qid = q.correct?.qid;
    if (!qid || q.retry || !wrongQids.has(qid) || seen.has(qid)) continue;
    seen.add(qid);
    out.push({ ...q, retry: true, options: shuffle(q.options, rng) });
  }
  return out;
}

/** 採点の分母に入れる問題（再出題を除く） */
export function countScored<Q extends { retry?: boolean }>(questions: Q[]): number {
  return questions.reduce((n, q) => n + (q.retry ? 0 : 1), 0);
}
