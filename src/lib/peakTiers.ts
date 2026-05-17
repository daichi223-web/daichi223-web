// 段位 peak 追跡 — 各単語 (group ID) の最高到達 ★ を localStorage に永続化。
// 一度達成した段位は acc や SRS Box の下降があっても下がらない (peak-lock)。
// regression シグナルは別系統 (苦手単語タイル / SRS Due 件数) で担保する設計。

const KEY = 'kobun.noble.peakTiers';

export type PeakTiers = Record<string, number>;

export function readPeakTiers(): PeakTiers {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed) return {};
    const out: PeakTiers = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// 複数 group 分を一括で更新する。current が peak より高い場合のみ書込み。
// 副作用関数。差分があったかどうかを返す。
export function updatePeakTiers(
  updates: Array<{ group: string | number; tier: number }>
): boolean {
  if (updates.length === 0) return false;
  const peaks = readPeakTiers();
  let dirty = false;
  for (const { group, tier } of updates) {
    const key = String(group);
    const prev = peaks[key] ?? 0;
    if (tier > prev) {
      peaks[key] = tier;
      dirty = true;
    }
  }
  if (dirty) {
    try {
      localStorage.setItem(KEY, JSON.stringify(peaks));
    } catch {
      /* quota / private mode は黙殺 */
    }
  }
  return dirty;
}

export function clearPeakTiers(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
