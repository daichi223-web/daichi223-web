// 昇進履歴 — ユーザーが新しい階位に到達したタイミングを localStorage に蓄積する。
// 学習を進めて effectiveStage(parts) が前回より大きくなったら recordPromotion() で追記。
// 降格 (パーツ Lv が下がる) は記録しない (= 最高到達点の足跡を残す)。
//
// 端末依存・タイムゾーン依存。匿名サインインなので端末を変えるとリセット。
// 容量は微小 (1 記録 < 100B、上限 21 件)。

import { STAGES, type Tier } from './nobleData';

const KEY_HISTORY = 'kobun.noble.history';
const KEY_PEAK = 'kobun.noble.peakStage';

export type PromotionRecord = {
  n: number;        // 階位 (1-21)
  rank: string;     // 例: '従五下'
  post: string;     // 例: '上国守・少納言'
  era: Tier;        // 地下 / 殿上人 / 公卿 / 極位
  timestamp: number; // ms epoch
};

export function readPromotionHistory(): PromotionRecord[] {
  try {
    const raw = localStorage.getItem(KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is PromotionRecord =>
        r && typeof r.n === 'number' && typeof r.timestamp === 'number'
    );
  } catch {
    return [];
  }
}

function readPeak(): number {
  try {
    const n = Number(localStorage.getItem(KEY_PEAK) || '0');
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeAll(history: PromotionRecord[], peak: number): void {
  try {
    localStorage.setItem(KEY_HISTORY, JSON.stringify(history));
    localStorage.setItem(KEY_PEAK, String(peak));
  } catch {
    // quota / private mode は黙殺
  }
}

/**
 * 現在の階位 currentN が過去のピークを超えていれば、ピーク〜currentN の全階位を
 * 履歴に追加する (1 段だけでなく一気に複数段上がっても全て記録)。
 * 同じ階位は重複記録しない。
 *
 * 戻り値: 新規追加された記録 (UI でトーストを出すときに使える)
 */
export function recordPromotion(currentN: number): PromotionRecord[] {
  if (currentN < 1 || currentN > 21) return [];
  const peak = readPeak();
  if (currentN <= peak) return [];

  const history = readPromotionHistory();
  const now = Date.now();
  const added: PromotionRecord[] = [];

  for (let n = Math.max(1, peak + 1); n <= currentN; n++) {
    const s = STAGES[n - 1];
    const rec: PromotionRecord = {
      n,
      rank: s.rank,
      post: s.post,
      era: s.era,
      timestamp: now,
    };
    history.push(rec);
    added.push(rec);
  }

  writeAll(history, currentN);
  return added;
}

export function clearPromotionHistory(): void {
  try {
    localStorage.removeItem(KEY_HISTORY);
    localStorage.removeItem(KEY_PEAK);
  } catch {
    // noop
  }
}
