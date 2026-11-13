/**
 * 単語クイズの「次の範囲」（2026-11-13 ユーザー指示「学習が終わったとき、ホームに戻ると同じ範囲を繰り返すしかない。次の10個とか…」）。
 * 今の範囲と同じ幅で、すぐ後ろの番号へ送る（1〜10 → 11〜20、1〜50 → 51〜100）。最後は 330 で止める。
 * 範囲を指定していない（全部）・すでに最後まで来ているときは null（ボタンを出さない）。
 */
export const LAST_WORD_NO = 330;

export function nextWordRange(range: { from?: number | null; to?: number | null }, last = LAST_WORD_NO): { from: number; to: number } | null {
  const from = range.from ?? null;
  const to = range.to ?? null;
  if (from == null || to == null || !Number.isInteger(from) || !Number.isInteger(to) || to < from) return null;
  if (from <= 1 && to >= last) return null; // 全部が範囲
  if (to >= last) return null;
  const size = to - from + 1;
  return { from: to + 1, to: Math.min(last, to + size) };
}

/** ボタンの文字。幅が10なら「次の10語へ（11〜20）」、それ以外は「次の範囲へ（51〜100）」 */
export function nextRangeLabel(next: { from: number; to: number }): string {
  const size = next.to - next.from + 1;
  return size === 10 ? `次の10語へ（${next.from}〜${next.to}）` : `次の範囲へ（${next.from}〜${next.to}）`;
}
