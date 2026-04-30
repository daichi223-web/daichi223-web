/**
 * 連続学習日数 (streak) の追跡。
 * localStorage ベースで、recordAnswer のたびに updateStreak() を呼ぶ。
 *
 * ロジック:
 *  - 同じ日に複数回答えても 1 と数える
 *  - 前回学習日が「昨日」なら +1
 *  - 前回学習日が「今日」なら据え置き
 *  - それ以外 (空白あり) なら 1 にリセット
 *
 * 端末依存・タイムゾーン依存。匿名サインインなので端末を変えるとリセット。
 */

const KEY_LAST_ACTIVE = 'kobun.streak.lastActiveDate';
const KEY_STREAK_DAYS = 'kobun.streak.days';
const KEY_LONGEST = 'kobun.streak.longest';

function todayKey(): string {
  // ローカルタイムゾーンの YYYY-MM-DD
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffDays(fromKey: string, toKey: string): number {
  const f = new Date(fromKey + 'T00:00:00');
  const t = new Date(toKey + 'T00:00:00');
  const ms = t.getTime() - f.getTime();
  return Math.round(ms / 86400000);
}

export type StreakSnapshot = {
  current: number;
  longest: number;
  lastActiveDate: string | null;
};

export function readStreak(): StreakSnapshot {
  try {
    const last = localStorage.getItem(KEY_LAST_ACTIVE);
    const cur = Number(localStorage.getItem(KEY_STREAK_DAYS) || '0');
    const longest = Number(localStorage.getItem(KEY_LONGEST) || '0');
    return {
      current: Number.isFinite(cur) ? cur : 0,
      longest: Number.isFinite(longest) ? longest : 0,
      lastActiveDate: last,
    };
  } catch {
    return { current: 0, longest: 0, lastActiveDate: null };
  }
}

/**
 * 学習活動があった瞬間に呼ぶ。冪等 (同じ日に複数回呼んでも結果は同じ)。
 */
export function updateStreak(): StreakSnapshot {
  const today = todayKey();
  let { current, longest, lastActiveDate } = readStreak();

  if (lastActiveDate === today) {
    // 今日中はノーオペ
    return { current, longest, lastActiveDate };
  }

  if (!lastActiveDate) {
    current = 1;
  } else {
    const gap = diffDays(lastActiveDate, today);
    if (gap === 1) {
      current = current + 1;
    } else if (gap === 0) {
      // 念のための同日扱い
      // すでに lastActiveDate === today で抜けているはずなので通常は通らない
    } else {
      // gap >= 2 (空白あり) または負 (時計巻き戻し) → リセット
      current = 1;
    }
  }

  if (current > longest) longest = current;

  try {
    localStorage.setItem(KEY_LAST_ACTIVE, today);
    localStorage.setItem(KEY_STREAK_DAYS, String(current));
    localStorage.setItem(KEY_LONGEST, String(longest));
  } catch {
    // quota / private mode で失敗
  }

  return { current, longest, lastActiveDate: today };
}
