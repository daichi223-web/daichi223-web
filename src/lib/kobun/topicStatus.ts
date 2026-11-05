import type { TopicProgress } from "./types";
// 到達度のキー（Lv1＝単元ID、Lv2 以上＝単元ID@レベル）と ✅ の基準（85%）は、単元ページと同じ定義を使う
import { levelKey, MASTERY_PCT } from "./topicLevels";

/**
 * 単元の状態（未学習／学習中／クリア）を決める純関数（2026-11-06。見直し ③）。
 * 道場ホームと単語道場で共用する。
 *
 * 以前は Lv1 の到達度（キー＝単元ID）だけを見ていたので、Lv2 以上をどれだけ解いても札が変わらず、
 * Lv2 しか無い単元は何度満点でも「未学習」のままだった。
 * ここでは、その単元に「あるレベル」のうち 85% 以上のレベルの数で決める。
 * 到達度の持ち方（キー）は変えていないので、過去の記録はそのまま使える。
 *
 * 札の言葉は「クリア」。到達度は過去最高の正答率で、いま覚えているかどうかは表さないため
 * 「定着」とは書かない（docs/adaptive-learning-review.md）。
 */

/** sort の百の位 → 難しさのレベル（100未満=Lv1 … 400以上=Lv5）。dojoData の drillLevel と同じ式 */
export function levelOfSort(sort: number | null | undefined): number {
  return Math.min(5, Math.floor((sort ?? 0) / 100) + 1);
}

/** 問題の一覧（単元IDと sort）から、単元ごとの「あるレベル」を小さい順に作る */
export function levelsByTopic(
  rows: readonly { topicId: string; sort?: number | null }[]
): Record<string, number[]> {
  const sets = new Map<string, Set<number>>();
  for (const r of rows) {
    let s = sets.get(r.topicId);
    if (!s) sets.set(r.topicId, (s = new Set()));
    s.add(levelOfSort(r.sort));
  }
  const out: Record<string, number[]> = {};
  for (const [id, s] of sets) out[id] = [...s].sort((a, b) => a - b);
  return out;
}

export type TopicState = "new" | "learning" | "clear";

export interface TopicStatus {
  state: TopicState;
  /** クリアしたレベルの数 */
  cleared: number;
  /** その単元にあるレベルの数 */
  total: number;
  /** 札の文字（未学習／学習中（2/4）／クリア） */
  label: string;
}

/**
 * 単元の状態。
 * - クリア … あるレベルが全部 85% 以上
 * - 未学習 … どのレベルも解いておらず、動画も見ていない
 * - 学習中 … それ以外。レベルが2つ以上ある単元は「学習中（クリアした数/レベルの数）」
 * levels が空（問題が無い単元）は未学習として返す。
 */
export function topicStatus(
  topicId: string,
  levels: readonly number[],
  progress: Record<string, TopicProgress>
): TopicStatus {
  const total = levels.length;
  let cleared = 0;
  let touched = !!progress[topicId]?.watched; // 動画を見た印は Lv に関係なく単元ID の行に付く
  for (const L of levels) {
    const p = progress[levelKey(topicId, L)];
    if (!p) continue;
    if (p.masteryPct >= MASTERY_PCT) cleared++;
    if (p.drillTotal > 0 || p.watched) touched = true;
  }
  if (total > 0 && cleared === total) return { state: "clear", cleared, total, label: "クリア" };
  if (!touched && cleared === 0) return { state: "new", cleared, total, label: "未学習" };
  return { state: "learning", cleared, total, label: total > 1 ? `学習中（${cleared}/${total}）` : "学習中" };
}

/** ドリルを1回でも解き終えたことがあるか（道場ホームで「どこから始める？」を目立たせるかどうか） */
export function hasAnyAttempt(progress: Record<string, TopicProgress>): boolean {
  return Object.values(progress).some((p) => p.drillTotal > 0);
}
