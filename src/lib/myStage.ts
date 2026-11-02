import { effectiveStage } from './nobleData';
import { rankScoreOf } from './fieldMastery';
import { readPeakTiers } from './peakTiers';

// 今の位階を通信なしで読む（単語クイズの答え合わせで、右側の「自分」のアイコンと位階名に使う）。
// 点数 = localStorage の peak-lock 済み ★（kobun.noble.peakTiers）の合計。ホーム／学習履歴が直近に計算した値と一致する。
// 別端末・初回・localStorage 消去直後は 0 点＝第1階になる。クイズのセッション中は更新しない（割り切り。docs に書く）。

export type MyStage = { n: number; rank: string; post: string };

const FIRST: MyStage = { n: 1, rank: '無位', post: '雑任' };

export function readMyStage(): MyStage {
  try {
    if (typeof window === 'undefined') return { ...FIRST };
    const stage = effectiveStage(rankScoreOf(Object.values(readPeakTiers())));
    return { n: stage.n, rank: stage.rank, post: stage.post };
  } catch {
    return { ...FIRST };
  }
}
