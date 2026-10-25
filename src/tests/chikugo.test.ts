import { describe, it, expect } from "vitest";
import { splitHokan } from "@/lib/kobun/chikugo";

describe("逐語訳の補った語", () => {
  it("（ ）の中を補った語として分ける", () => {
    expect(splitHokan("かぐや姫（が）")).toEqual([{ text: "かぐや姫", hokan: false }, { text: "（が）", hokan: true }]);
    expect(splitHokan("（石作の皇子は）鉢を")).toEqual([{ text: "（石作の皇子は）", hokan: true }, { text: "鉢を", hokan: false }]);
    expect(splitHokan("持って来ないでおくものか（いや、持って来よう）と")).toEqual([
      { text: "持って来ないでおくものか", hokan: false }, { text: "（いや、持って来よう）", hokan: true }, { text: "と", hokan: false },
    ]);
  });
  it("（ ）が無ければそのまま", () => {
    expect(splitHokan("それでもやはり、")).toEqual([{ text: "それでもやはり、", hokan: false }]);
  });
});
