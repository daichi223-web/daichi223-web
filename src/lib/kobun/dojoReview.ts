/**
 * 文法道場の復習の「今日の分」を決める純関数（2026-11-06。見直し ②）。
 *
 * 単語の「今日の分」（srsEngine.getTodayReviewSet）と同じ考え方:
 *   - 1回に出すのは上限まで（たまっていても見せるのは今日の分だけ。残りは消さずに次へ回る）
 *   - 期日の古い順
 *   - 今日すでに解いた問題は除く（間違えた問題は箱1＝いつも期日なので、除かないと
 *     復習を終えた直後にまた並び、件数が0にならない）
 *
 * srs_state には単語の qid・例文事典の id も入っているので、文法の問題の ID の集合で絞る。
 * DB には触らない。行は呼び出し側（dojoData）が取って渡す。
 */

/** 1回（1日）に出す文法の復習の上限 */
export const DOJO_REVIEW_CAP = 20;

/** srs_state の1行（期日が来たもの） */
export interface SrsDueRow {
  qid: string;
  /** 次の復習の期日（ISO） */
  nextReview: string;
  /** 最後に解いた日時（ISO）。無ければ null */
  lastReview: string | null;
}

export interface TodayReview {
  /** 今日の分として出す問題の ID（期日の古い順） */
  ids: string[];
  /** 今日の分に入らなかった残りの数（「つづけてもう少し」を出すかどうかに使う。画面には数を出さない） */
  remaining: number;
}

export interface TodayReviewOptions {
  now: Date;
  /** 今日の0時（ISO か Date）。これ以降に解いた問題は除く。srsEngine.startOfToday(now) を渡す */
  todayStart: string | Date;
  cap?: number;
  /** この画面ですでに出した問題（保存が終わる前に次の分を取っても、同じ問題を出さないため） */
  exclude?: ReadonlySet<string>;
}

export function pickTodayReview(
  rows: readonly SrsDueRow[],
  grammarIds: ReadonlySet<string>,
  opts: TodayReviewOptions
): TodayReview {
  const cap = Math.max(0, opts.cap ?? DOJO_REVIEW_CAP);
  const nowMs = opts.now.getTime();
  const today0 = typeof opts.todayStart === "string" ? Date.parse(opts.todayStart) : opts.todayStart.getTime();

  const seen = new Set<string>();
  const eligible: { qid: string; due: number }[] = [];
  for (const r of rows) {
    if (!grammarIds.has(r.qid) || seen.has(r.qid) || opts.exclude?.has(r.qid)) continue;
    const due = Date.parse(r.nextReview);
    if (Number.isNaN(due) || due > nowMs) continue; // 期日がまだ来ていない・読めない
    if (r.lastReview != null && Date.parse(r.lastReview) >= today0) continue; // 今日もう解いた
    seen.add(r.qid);
    eligible.push({ qid: r.qid, due });
  }
  // 期日の古い順。同じ期日は ID 順（毎回同じ並びにする）
  eligible.sort((a, b) => a.due - b.due || (a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0));

  const ids = eligible.slice(0, cap).map((e) => e.qid);
  return { ids, remaining: eligible.length - ids.length };
}
