/** 範囲選びの区切り（components/RangeBlockPicker.tsx の計算部分。DOM に依存しない） */

export type Range = { from: number; to: number };

/** 選べる幅 */
export const RANGE_WIDTHS = [10, 20, 50] as const;

/** min〜max を幅 w で区切る（最後は max で止める）。1-10, 11-20, …, 321-330 */
export function blocksFor(w: number, min = 1, max = 330): Range[] {
  const out: Range[] = [];
  if (!Number.isInteger(w) || w <= 0) return out;
  for (let from = min; from <= max; from += w) out.push({ from, to: Math.min(max, from + w - 1) });
  return out;
}

/** シートを開いたときの幅：今の範囲の幅が 10・20・50 ならそれ、全部なら 'all'、ほかは 10 */
export function initialWidth(value: { from?: number; to?: number }, max = 330, min = 1): number | 'all' {
  const { from, to } = value;
  if (from == null || to == null) return 10;
  if (from <= min && to >= max) return 'all';
  const size = to - from + 1;
  return (RANGE_WIDTHS as readonly number[]).includes(size) ? size : 10;
}
