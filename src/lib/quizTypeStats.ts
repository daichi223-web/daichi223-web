// クイズ種別別の正答カウンタ (localStorage)
// 多義語クイズ・記述クイズで qid 単位の正答回数を記録する。
// ロボット部位の成長条件に「多義語・記述もやっているか」を反映するために使う。

const KEY = 'kobun-quiz-type-correct';

export type QuizTypeKind = 'polysemy' | 'writing';

export interface QuizTypeRecord {
  polysemy?: number;
  writing?: number;
}

export type QuizTypeStats = Record<string, QuizTypeRecord>;

export function getQuizTypeCorrect(): QuizTypeStats {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuizTypeStats) : {};
  } catch {
    return {};
  }
}

export function recordQuizTypeCorrect(qid: string, kind: QuizTypeKind): void {
  if (!qid) return;
  try {
    const all = getQuizTypeCorrect();
    if (!all[qid]) all[qid] = {};
    all[qid][kind] = (all[qid][kind] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full / disabled */
  }
}
