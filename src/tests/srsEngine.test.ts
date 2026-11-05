/**
 * srsEngine ピュア関数の smoke テスト。
 * DB を叩かない部分（box 進行と review 日計算）のみをカバー。
 */
import { describe, it, expect } from "vitest";
import {
  nextBox, getNextReviewDate, BOX_INTERVALS_DAYS, reviewTransition,
  graduatedIntervalDays, GRADUATED_MIN_DAYS, GRADUATED_MAX_DAYS,
} from "../lib/srsEngine";

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
  it('期限前でも間違えたら直ちに再学習へ戻す（箱1〜3は箱1へ、すぐ期限）', () => {
    expect(reviewTransition({ box: 3, next_review: future }, false, now))
      .toEqual({ box: 1, next_review: now.toISOString() });
    expect(reviewTransition({ box: 2, next_review: future }, false, now))
      .toEqual({ box: 1, next_review: now.toISOString() });
  });
  // 2026-11-06 落ち方をゆるめた：箱4・5は2つ下げる。次の復習日は下がった箱の日数
  it('箱5で間違えたら箱3へ（3日後）、箱4で間違えたら箱2へ（1日後）。期限の前後を問わない', () => {
    expect(reviewTransition({ box: 5, next_review: future }, false, now))
      .toEqual({ box: 3, next_review: getNextReviewDate(3, now) });
    expect(reviewTransition({ box: 5, next_review: now.toISOString() }, false, now))
      .toEqual({ box: 3, next_review: getNextReviewDate(3, now) });
    expect(reviewTransition({ box: 4, next_review: future }, false, now))
      .toEqual({ box: 2, next_review: getNextReviewDate(2, now) });
  });
  it('誤答の解き直しができたら翌日確認へ進み、連続正解では止まる', () => {
    const state = reviewTransition({ box: 1, next_review: now.toISOString() }, true, now);
    expect(state.box).toBe(2);
    expect(reviewTransition(state, true, now)).toEqual(state);
  });
});

// 2026-11-06 卒業：箱5で期限後に正解したら、箱は5のまま、次の復習日を「前回の復習からあいた日数の2倍」にのばす
describe('卒業（箱5のあと）', () => {
  const now = new Date('2026-11-06T10:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const daysAfter = (d: number) => {
    const t = new Date(now);
    t.setDate(t.getDate() + d);
    return t.toISOString();
  };

  it('箱5に入って14日後の正解 → 箱5のまま、次は28日後', () => {
    expect(reviewTransition({ box: 5, next_review: now.toISOString(), last_review: daysAgo(14) }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(28) });
  });
  it('あいた日数の2倍にのびる（28日ぶり → 56日後、56日ぶり → 112日後）', () => {
    expect(reviewTransition({ box: 5, next_review: daysAgo(0), last_review: daysAgo(28) }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(56) });
    expect(reviewTransition({ box: 5, next_review: daysAgo(2), last_review: daysAgo(56) }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(112) });
  });
  it('上限は120日（112日ぶりでも、1年ぶりでも120日後）', () => {
    expect(reviewTransition({ box: 5, next_review: daysAgo(0), last_review: daysAgo(112) }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(120) });
    expect(reviewTransition({ box: 5, next_review: daysAgo(300), last_review: daysAgo(365) }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(120) });
  });
  it('下限は28日（あいた日数が短い・前回の復習の記録が無い）', () => {
    expect(reviewTransition({ box: 5, next_review: daysAgo(0), last_review: daysAgo(3) }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(28) });
    expect(reviewTransition({ box: 5, next_review: daysAgo(0), last_review: null }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(28) });
    expect(reviewTransition({ box: 5, next_review: daysAgo(0) }, true, now))
      .toEqual({ box: 5, next_review: daysAfter(28) });
  });
  it('期限前の正解は据え置き（箱も次の復習日も動かない）', () => {
    const state = { box: 5, next_review: daysAfter(40), last_review: daysAgo(16) };
    expect(reviewTransition(state, true, now)).toEqual({ box: 5, next_review: state.next_review });
  });
  it('卒業した語を間違えたら箱3へ（3日後）', () => {
    expect(reviewTransition({ box: 5, next_review: daysAfter(40), last_review: daysAgo(16) }, false, now))
      .toEqual({ box: 3, next_review: getNextReviewDate(3, now) });
  });
  it('箱4で期限後に正解したときは卒業ではなく、今までどおり箱5（14日後）', () => {
    expect(reviewTransition({ box: 4, next_review: daysAgo(0), last_review: daysAgo(7) }, true, now))
      .toEqual({ box: 5, next_review: getNextReviewDate(5, now) });
  });
  it('graduatedIntervalDays：日数は 28〜120 の範囲。壊れた日付は下限', () => {
    expect(GRADUATED_MIN_DAYS).toBe(28);
    expect(GRADUATED_MAX_DAYS).toBe(120);
    expect(graduatedIntervalDays(daysAgo(14), now)).toBe(28);
    expect(graduatedIntervalDays(daysAgo(20), now)).toBe(40);
    expect(graduatedIntervalDays(daysAgo(60), now)).toBe(120);
    expect(graduatedIntervalDays(daysAgo(61), now)).toBe(120);
    expect(graduatedIntervalDays(null, now)).toBe(28);
    expect(graduatedIntervalDays('こわれた値', now)).toBe(28);
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

  it("box 1・2 不正解 → 1", () => {
    expect(nextBox(1, false)).toBe(1);
    expect(nextBox(2, false)).toBe(1);
  });

  // 2026-11-06 落ち方をゆるめた（以前はどの箱からでも 1）
  it("box 4 不正解 → 2（2つ下げる）", () => {
    expect(nextBox(4, false)).toBe(2);
  });

  it("box 5 不正解 → 3（2つ下げる）", () => {
    expect(nextBox(5, false)).toBe(3);
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
