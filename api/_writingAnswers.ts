// api/_writingAnswers.ts
//
// 誤答分析「学校・学年ごとの記述の誤答」の集計（DB 関数 usage_writing_answers の返り値をまとめる。migration 020）。
//   DB は 語 × 答えの文（そのまま）× 生徒 の回数を返す。ここで表記ゆれを normalize（answers 表・正解の辞書と同じ関数）で
//   まとめ、答えごとに 回数・間違えた人（重複なし）・いちばん多い書き方 を出す。user_id はここで数えるだけで外に出さない。
import { normalize } from "./_normalize.js";

export type WritingWrongRow = { id: string; answer: string; user: string; n: number };

export type WritingWrong = {
  /** qid */
  id: string;
  /** normalize した答え（正解の辞書の answer_norm と同じ形） */
  answerNorm: string;
  /** いちばん多い書き方（同数は先に出た方） */
  sample: string;
  /** 誤答の回数 */
  n: number;
  /** この答えで間違えた人（重複なし） */
  users: number;
};

export function groupWritingWrongs(rows: WritingWrongRow[]): WritingWrong[] {
  const m = new Map<string, { id: string; answerNorm: string; n: number; users: Set<string>; forms: Map<string, number> }>();
  for (const r of rows) {
    const answerNorm = normalize(r.answer);
    if (!r.id || !answerNorm) continue;
    const k = `${r.id}::${answerNorm}`;
    const g = m.get(k) ?? { id: r.id, answerNorm, n: 0, users: new Set<string>(), forms: new Map<string, number>() };
    g.n += r.n;
    g.users.add(r.user);
    g.forms.set(r.answer, (g.forms.get(r.answer) ?? 0) + r.n);
    m.set(k, g);
  }
  const out: WritingWrong[] = [];
  for (const g of m.values()) {
    let sample = "";
    let best = -1;
    for (const [form, c] of g.forms) if (c > best) { sample = form; best = c; }
    out.push({ id: g.id, answerNorm: g.answerNorm, sample, n: g.n, users: g.users.size });
  }
  // 間違えた人の多い順 → 回数 → qid → 答え
  return out.sort(
    (a, b) => b.users - a.users || b.n - a.n || a.id.localeCompare(b.id) || a.answerNorm.localeCompare(b.answerNorm),
  );
}
