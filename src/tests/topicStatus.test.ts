import { describe, it, expect } from "vitest";
import { topicStatus, levelsByTopic, levelOfSort, hasAnyAttempt } from "@/lib/kobun/topicStatus";
import type { TopicProgress } from "@/lib/kobun/types";

const p = (topicId: string, masteryPct: number, drillTotal = 8, watched = false): TopicProgress => ({
  topicId, watched, drillTotal, drillCorrect: Math.round((drillTotal * masteryPct) / 100), masteryPct,
});
const prog = (...rows: TopicProgress[]) => Object.fromEntries(rows.map((r) => [r.topicId, r]));

describe("レベルの決め方", () => {
  it("sort の百の位で決まる（100未満=Lv1 … 400以上=Lv5）", () => {
    expect([0, 99, 100, 199, 250, 399, 400, 999].map(levelOfSort)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    expect(levelOfSort(null)).toBe(1);
    expect(levelOfSort(undefined)).toBe(1);
  });

  it("問題の一覧から、単元ごとの「あるレベル」を小さい順に作る", () => {
    const got = levelsByTopic([
      { topicId: "a", sort: 310 }, { topicId: "a", sort: 5 }, { topicId: "a", sort: 20 },
      { topicId: "vocab-koou", sort: 101 }, { topicId: "vocab-koou", sort: 114 },
      { topicId: "b", sort: null },
    ]);
    expect(got).toEqual({ a: [1, 4], "vocab-koou": [2], b: [1] });
  });
});

describe("単元の状態", () => {
  it("何も解いていなければ未学習", () => {
    expect(topicStatus("a", [1, 2], {})).toEqual({ state: "new", cleared: 0, total: 2, label: "未学習" });
  });

  it("あるレベルが全部 85% 以上ならクリア", () => {
    const st = topicStatus("a", [1, 2, 3], prog(p("a", 85), p("a@2", 100), p("a@3", 88)));
    expect(st).toEqual({ state: "clear", cleared: 3, total: 3, label: "クリア" });
  });

  it("一部だけなら学習中（クリアした数/レベルの数）", () => {
    const st = topicStatus("a", [1, 2, 3, 4], prog(p("a", 100), p("a@2", 90), p("a@3", 60)));
    expect(st).toEqual({ state: "learning", cleared: 2, total: 4, label: "学習中（2/4）" });
  });

  it("Lv1 だけ満点でも、上のレベルが残っていればクリアにしない（以前は Lv1 だけで「定着」）", () => {
    expect(topicStatus("a", [1, 2], prog(p("a", 100))).state).toBe("learning");
  });

  it("Lv2 しか無い単元は Lv2 の成績で決まる（以前は何度満点でも「未学習」）", () => {
    expect(topicStatus("vocab-koou", [2], prog(p("vocab-koou@2", 100)))).toEqual({
      state: "clear", cleared: 1, total: 1, label: "クリア",
    });
    expect(topicStatus("vocab-koou", [2], prog(p("vocab-koou@2", 50))).label).toBe("学習中");
  });

  it("Lv1 を飛ばして Lv2 から解いた単元は学習中", () => {
    expect(topicStatus("a", [1, 2], prog(p("a@2", 40))).label).toBe("学習中（0/2）");
  });

  it("84% はクリアにしない", () => {
    expect(topicStatus("a", [1], prog(p("a", 84))).state).toBe("learning");
  });

  it("動画を見ただけなら学習中", () => {
    expect(topicStatus("a", [1, 2], prog(p("a", 0, 0, true))).state).toBe("learning");
    // 動画の印は Lv に関係なく単元ID の行に付く（Lv2 しか無い単元でも学習中）
    expect(topicStatus("v", [2], prog(p("v", 0, 0, true))).state).toBe("learning");
  });

  it("今は無いレベルの記録・ほかの単元の記録は数えない", () => {
    expect(topicStatus("a", [1], prog(p("a", 100), p("a@2", 10))).state).toBe("clear");
    expect(topicStatus("a", [1], prog(p("ab", 100), p("b@2", 100))).state).toBe("new");
  });

  it("問題が無い単元は未学習として返す", () => {
    expect(topicStatus("x", [], {})).toEqual({ state: "new", cleared: 0, total: 0, label: "未学習" });
  });
});

describe("解いたことがあるか", () => {
  it("どのレベルでも1回解き終えていれば true、動画だけ・記録なしは false", () => {
    expect(hasAnyAttempt({})).toBe(false);
    expect(hasAnyAttempt(prog(p("a", 0, 0, true)))).toBe(false);
    expect(hasAnyAttempt(prog(p("a@3", 20)))).toBe(true);
  });
});
