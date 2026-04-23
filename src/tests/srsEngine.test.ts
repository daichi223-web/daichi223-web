/**
 * srsEngine ピュア関数の smoke テスト。
 * DB を叩かない部分（box 進行と review 日計算）のみをカバー。
 */
import { describe, it, expect } from "vitest";
import { nextBox, getNextReviewDate, BOX_INTERVALS_DAYS } from "../lib/srsEngine";

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
