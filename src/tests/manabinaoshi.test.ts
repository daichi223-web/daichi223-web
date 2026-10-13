import { describe, it, expect } from "vitest";
import { STAGES, judgePlacement, limitChoices, pickPlacementDrills, shouldStop, stageStyle } from "@/lib/kobun/manabinaoshi";
import type { GrammarDrill } from "@/lib/kobun/types";

const d = (id: string, topicId: string, sort: number, extra: Partial<GrammarDrill> = {}): GrammarDrill => ({
  id, topicId, kind: "katsuyo-fill", prompt: "?", choices: ["a", "b"], answer: "a", explanation: "", sort, ...extra,
});

describe("用語カード", () => {
  it("確認の1問の正解が選択肢に入っていて、選択肢に重複がない", () => {
    for (const s of STAGES)
      for (const c of s.terms) {
        expect(c.check.choices).toContain(c.check.answer);
        expect(new Set(c.check.choices).size).toBe(c.check.choices.length);
      }
  });

  it("用語カードの id は段をまたいで重複しない", () => {
    const ids = STAGES.flatMap((s) => s.terms.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("補助動詞と自動詞・他動詞は助動詞の段より後で出す", () => {
    const stageOf = (id: string) => STAGES.find((s) => s.terms.some((c) => c.id === id))!.id;
    const jodoshi = STAGES.find((s) => s.category === "助動詞")!.id;
    expect(stageOf("hojo-doushi")).toBeGreaterThan(jodoshi);
    expect(stageOf("jita")).toBeGreaterThan(jodoshi);
  });

  it("Can-do の文に活用形の名前を使わない（用語を知らなくても選べる）", () => {
    for (const s of STAGES)
      for (const c of s.canDo) expect(c).not.toMatch(/未然形|連用形|終止形|連体形|已然形|命令形|用言|活用/);
  });
});

describe("判定の問題選び", () => {
  it("各単元のいちばん易しい1問を、教える順に並べる", () => {
    const got = pickPlacementDrills(
      [d("y2", "doushi-yodan", 120), d("y1", "doushi-yodan", 10), d("k1", "doushi-katsuyo", 50)],
      ["doushi-yodan", "doushi-katsuyo"]
    );
    expect(got.map((x) => x.id)).toEqual(["k1", "y1"]);
  });

  it("選択肢がない・正解が選択肢にない問題は使わない", () => {
    const got = pickPlacementDrills(
      [d("n1", "onbin", 1, { choices: undefined }), d("n2", "onbin", 2, { answer: "z" }), d("ok", "onbin", 3)],
      ["onbin"]
    );
    expect(got.map((x) => x.id)).toEqual(["ok"]);
  });

  it("段に含まれない単元の問題は入れない", () => {
    expect(pickPlacementDrills([d("x", "keigo", 1)], ["onbin"])).toEqual([]);
  });
});

describe("段ごとの見せ方", () => {
  it("下の段ほど簡単に: 0 は1枚ずつ・3択・答え直し、上の段は一覧", () => {
    expect(stageStyle(0)).toMatchObject({ layout: "step", maxChoices: 3, retry: true });
    expect(stageStyle(1)).toMatchObject({ layout: "step", retry: true });
    expect(stageStyle(4)).toMatchObject({ layout: "list", retry: false });
  });

  it("選択肢を減らしても正解は残り、元の並びを保つ", () => {
    expect(limitChoices(["書く", "美し", "静かなり", "花"], "花", 3)).toEqual(["書く", "美し", "花"]);
    expect(limitChoices(["a", "b"], "b", 3)).toEqual(["a", "b"]);
    expect(limitChoices(["a", "b", "c", "d"], ["d", "c"], 2)).toEqual(["a", "c"]);
  });

  it("用語カードは3択にしても正解が残る", () => {
    for (const s of STAGES)
      for (const c of s.terms) {
        const got = limitChoices(c.check.choices, c.check.answer, stageStyle(s.id).maxChoices);
        expect(got).toContain(c.check.answer);
        expect(got.length).toBeGreaterThanOrEqual(2);
      }
  });

  it("判定は × が上限に達したら止める", () => {
    const miss = { id: "a", correct: false };
    const hit = { id: "b", correct: true };
    expect(shouldStop([miss, hit], 2)).toBe(false);
    expect(shouldStop([miss, hit, miss], 2)).toBe(true);
    expect(shouldStop([miss, miss, miss], 0)).toBe(false);
  });
});

describe("判定", () => {
  it("最初の × の単元から始める", () => {
    const j = judgePlacement([
      { id: "a", correct: true },
      { id: "b", correct: false },
      { id: "c", correct: false },
    ]);
    expect(j).toEqual({ correct: 1, total: 3, startAt: "b", shaky: true });
  });

  it("全問正解なら startAt は null", () => {
    expect(judgePlacement([{ id: "a", correct: true }]).startAt).toBeNull();
  });

  it("ちょうど半分は shaky にしない", () => {
    expect(judgePlacement([{ id: "a", correct: true }, { id: "b", correct: false }]).shaky).toBe(false);
  });
});
