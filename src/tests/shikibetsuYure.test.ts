import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { findShikibetsu, type ShikibetsuTarget } from "@/lib/kobun/shikibetsu";
import { YURE, judgeShikibetsu } from "@/lib/kobun/shikibetsuYure";

const target = (answer: string): ShikibetsuTarget => ({ id: "s1-t1", group: "ni", form: "に", answer, parts: [], clue: "" });

describe("識別の揺れの判定", () => {
  it("両方正解・△・誤りを分ける", () => {
    const both = { both: ["kaku", "setsuzoku"], note: "" };
    expect(judgeShikibetsu(target("kaku"), "kaku", both)).toBe("correct");
    expect(judgeShikibetsu(target("kaku"), "setsuzoku", both)).toBe("correct");
    expect(judgeShikibetsu(target("kaku"), "dantei", both)).toBe("wrong");
    const partial = { partial: ["kaku"], note: "" };
    expect(judgeShikibetsu(target("setsuzoku"), "kaku", partial)).toBe("partial");
    expect(judgeShikibetsu(target("setsuzoku"), "setsuzoku", partial)).toBe("correct");
    expect(judgeShikibetsu(target("setsuzoku"), "kaku")).toBe("wrong");
  });

  it("指定した箇所はすべて教材の「に」の対象で、正解と食い違わない", () => {
    for (const [key, yure] of Object.entries(YURE)) {
      const [textId, tokenId] = key.split(":");
      const d = JSON.parse(fs.readFileSync(`public/texts-v3/${textId}.json`, "utf8"));
      const sid = tokenId.split("-")[0];
      const s = d.sentences.find((x: { id: string }) => x.id === sid);
      const t = findShikibetsu(s.tokens).find((x) => x.id === tokenId);
      expect(t, key).toBeDefined();
      expect(t!.group, key).toBe("ni");
      if (yure.both) expect(yure.both, key).toContain(t!.answer);
      if (yure.partial) expect(yure.partial, key).not.toContain(t!.answer);
    }
  });
});
