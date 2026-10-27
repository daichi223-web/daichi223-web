/**
 * 位階の判定（語の★と、合計点による昇進）のテスト。
 * 2026-10-27 の改定（5 部位の AND をやめて合計点に）で決めた条件を固定する。
 */
import { describe, it, expect } from "vitest";
import { computeTier, rankScoreOf } from "../lib/fieldMastery";
import { STAGES, STAGE_MIN_SCORE, effectiveStage, nextStage } from "../lib/nobleData";

const single = (correct: number, total: number) => ({ qids: ["q1"], correct, total });
const box = (b: number) => new Map([["q1", b]]);

describe("語の★（computeTier）", () => {
  it("正解0回は★0、1回で★1、2回で★2", () => {
    expect(computeTier(single(0, 3), {}, box(0))).toBe(0);
    expect(computeTier(single(1, 1), {}, box(0))).toBe(1);
    expect(computeTier(single(2, 2), {}, box(0))).toBe(2);
  });

  it("★4 以上は日をまたいだ定着（SRS の箱）が要る", () => {
    expect(computeTier(single(4, 4), {}, box(1))).toBe(3);
    expect(computeTier(single(4, 4), {}, box(2))).toBe(4);
    expect(computeTier(single(5, 5), {}, box(3))).toBe(5);
  });

  it("★7 は 8 回・記述の正解1回・箱3（旧条件の 25 回は要らない）", () => {
    expect(computeTier(single(8, 8), {}, box(3))).toBe(5);
    expect(computeTier(single(8, 8), { q1: { writing: 1 } }, box(3))).toBe(7);
  });

  it("★12 は 25 回・正答率90%・記述4回・箱5", () => {
    const qt = { q1: { writing: 4 } };
    expect(computeTier(single(25, 25), qt, box(5))).toBe(12);
    expect(computeTier(single(25, 25), qt, box(4))).toBe(9);
    expect(computeTier(single(22, 25), qt, box(5))).toBe(10); // 正答率 88%
  });

  it("多義語は多義の正解も要る", () => {
    const g = { qids: ["q1", "q2"], correct: 25, total: 25 };
    const srs = new Map([["q1", 5]]);
    expect(computeTier(g, { q1: { writing: 4, polysemy: 3 } }, srs)).toBe(12);
    expect(computeTier(g, { q1: { writing: 4 } }, srs)).toBe(7);
  });
});

describe("合計点による昇進", () => {
  it("21 段すべてに別々の点数があり、増えていく", () => {
    expect(STAGE_MIN_SCORE).toHaveLength(STAGES.length);
    expect(STAGE_MIN_SCORE[0]).toBe(0);
    for (let i = 1; i < STAGE_MIN_SCORE.length; i++) {
      expect(STAGE_MIN_SCORE[i]).toBeGreaterThan(STAGE_MIN_SCORE[i - 1]);
    }
    expect(STAGE_MIN_SCORE.at(-1)).toBeLessThanOrEqual(330 * 12);
  });

  it("各段の点数ちょうどでその段になり、1点足りないと前の段", () => {
    STAGES.forEach((s, i) => {
      expect(effectiveStage(STAGE_MIN_SCORE[i]).n).toBe(s.n);
      if (i > 0) expect(effectiveStage(STAGE_MIN_SCORE[i] - 1).n).toBe(s.n - 1);
    });
  });

  it("読解必修＋入試必修の 150 語だけ（最大1800点）では公卿に届かない", () => {
    expect(effectiveStage(150 * 12).era).toBe("殿上人");
  });

  it("次の段まであと何点かと進み具合を返し、頂点では null", () => {
    expect(nextStage(0, 1)).toMatchObject({ stage: { n: 2 }, need: 15, progress: 0 });
    const mid = nextStage(460, 8); // 第8階 400点〜第9階 520点 の中間
    expect(mid).toMatchObject({ stage: { n: 9 }, need: 60, progress: 50 });
    expect(nextStage(4000, 21)).toBeNull();
  });

  it("点数は★の合計", () => {
    expect(rankScoreOf([0, 1, 2, 12])).toBe(15);
    expect(rankScoreOf([])).toBe(0);
  });
});
