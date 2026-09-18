/**
 * srsEngine ピュア関数の smoke テスト。
 * DB を叩かない部分（box 進行と review 日計算）のみをカバー。
 */
import { describe, it, expect } from "vitest";
import { nextBox, getNextReviewDate, BOX_INTERVALS_DAYS, reviewTransition } from "../lib/srsEngine";

describe('復習期限に基づく定着判定（単語・文法共通）', () => {
  const now = new Date('2026-09-19T10:00:00Z');
  const future = '2026-09-20T10:00:00Z';
  it('同日の連続正解で段階を進めず、元の期限も延ばさない', () => {
    let state = { box: 2, next_review: future };
    for (let i = 0; i < 5; i++) state = reviewTransition(state, true, now);
    expect(state).toEqual({ box: 2, next_review: future });
  });
  it('期限到来ちょうどの正解で次の段階へ進む', () => {
    expect(reviewTransition({ box: 2, next_review: now.toISOString() }, true, now))
      .toEqual({ box: 3, next_review: getNextReviewDate(3, now) });
  });
  it('期限前でも間違えたら直ちに再学習へ戻す', () => {
    expect(reviewTransition({ box: 5, next_review: future }, false, now))
      .toEqual({ box: 1, next_review: now.toISOString() });
  });
  it('誤答の解き直しができたら翌日確認へ進み、連続正解では止まる', () => {
    const state = reviewTransition({ box: 1, next_review: now.toISOString() }, true, now);
    expect(state.box).toBe(2);
    expect(reviewTransition(state, true, now)).toEqual(state);
  });
});

describe("nextBox", () => {
  it("初回 + 正解 → box 2", () => {
    expect(nextBox(null, true)).toBe(2);
  });

  it("初回 + 不正解 → box 1", () => {
    expect(nextBox(null, false)).toBe(1);
  });

  it("box 1 正解 → box 2", () => {
    expect(nextBox(1, true)).toBe(2);
  });

  it("box 4 正解 → box 5 (上限)", () => {
    expect(nextBox(4, true)).toBe(5);
  });

  it("box 5 正解 → 5 のまま (cap)", () => {
    expect(nextBox(5, true)).toBe(5);
  });

  it("box 3 不正解 → 1 に戻す", () => {
    expect(nextBox(3, false)).toBe(1);
  });

  it("box 5 不正解 → 1 に戻す（mastered 取り消し）", () => {
    expect(nextBox(5, false)).toBe(1);
  });
});

describe("getNextReviewDate", () => {
  const baseDate = new Date("2026-04-24T00:00:00Z");

  it("box 1 は同日扱い (days = 0)", () => {
    const iso = getNextReviewDate(1, baseDate);
    expect(iso.startsWith("2026-04-24")).toBe(true);
  });

  it("box 2 は +1 日", () => {
    const iso = getNextReviewDate(2, baseDate);
    expect(iso.startsWith("2026-04-25")).toBe(true);
  });

  it("box 5 は +14 日", () => {
    const iso = getNextReviewDate(5, baseDate);
    expect(iso.startsWith("2026-05-08")).toBe(true);
  });

  it("未知の box は days=0 フォールバック", () => {
    const iso = getNextReviewDate(99, baseDate);
    expect(iso.startsWith("2026-04-24")).toBe(true);
  });

  it("BOX_INTERVALS_DAYS は 1..5 のキーを持つ", () => {
    expect(Object.keys(BOX_INTERVALS_DAYS).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });
});
