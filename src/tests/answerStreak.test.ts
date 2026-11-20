import { beforeEach, describe, expect, it } from 'vitest';
import {
  NEUTRAL_STREAK_LINES, noteAnswer, resetAnswerStreak, streakLinesOf, streakPraise, streakTier,
} from '../lib/answerStreak';
import { ALL_TEACHER_IDS } from '../lib/teachers';

describe('連続正解のお褒め（2026-11-19）', () => {
  beforeEach(() => resetAnswerStreak());

  it('褒めるのは5・10・その後5問ごと', () => {
    expect([1, 4, 5, 6, 9, 10, 11, 15, 20, 23, 25].map(streakTier))
      .toEqual([null, null, 'five', null, null, 'ten', null, 'more', 'more', null, 'more']);
  });

  it('問題ごとに1回だけ数え、まちがえたら0に戻る。描き直しで同じ問題を渡しても増えない', () => {
    const qs = Array.from({ length: 7 }, () => ({}));
    expect(qs.slice(0, 5).map((q) => noteAnswer(q, true))).toEqual([1, 2, 3, 4, 5]);
    expect(noteAnswer(qs[4], true)).toBe(5);
    expect(noteAnswer(qs[5], false)).toBe(0);
    expect(noteAnswer(qs[6], true)).toBe(1);
    resetAnswerStreak();
    expect(noteAnswer(qs[0], true)).toBe(1);
  });

  it('どの先生でも、褒める回は {回数} の入った文、ほかは null', () => {
    for (const t of ALL_TEACHER_IDS) {
      expect(streakPraise(t, 4, 's')).toBeNull();
      for (const n of [5, 10, 15, 40]) {
        const s = streakPraise(t, n, `s${n}`);
        expect(s, `${t} ${n}`).toBeTruthy();
        expect(s).not.toMatch(/[{}]/);
        if (n >= 15) expect(s).toContain(String(n));
      }
      for (const k of ['five', 'ten', 'more'] as const) expect(streakLinesOf(t)[k].length).toBeGreaterThan(0);
    }
  });

  it('口調を使わない設定では中立の文', () => {
    expect(NEUTRAL_STREAK_LINES.five).toContain(streakPraise('sei', 5, 'x', false));
  });
});
