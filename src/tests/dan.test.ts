import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { danOf, danChartRows, isKatsuyoTable, parseDanChartLine, splitDanWords, DAN_TYPES } from "../lib/kobun/dan";

describe("段（ア段〜オ段）", () => {
  it("最初の字の段：ひらがな・カタカナ・濁音・ローマ字の母音", () => {
    expect(danOf("か")).toBe("a");
    expect(danOf("き")).toBe("i");
    expect(danOf("くる")).toBe("u");
    expect(danOf("けよ")).toBe("e");
    expect(danOf("こ")).toBe("o");
    expect(danOf("ざら")).toBe("a");
    expect(danOf("ゐる")).toBe("i");
    expect(danOf("ゑ")).toBe("e");
    expect(danOf("ア")).toBe("a");
    expect(danOf("uる")).toBe("u");
    expect(danOf("見")).toBeNull();
    expect(danOf("−")).toBeNull();
  });

  it("活用表の見分け", () => {
    expect(isKatsuyoTable(["未然形", "連用形", "終止形"])).toBe(true);
    expect(isKatsuyoTable(["未然形の最後の音", "活用型"])).toBe(false);
  });

  it("名前のわけ：四段は4つ、二段は2つ、一段は1つ。上はイ段・下はエ段", () => {
    const by = Object.fromEntries(DAN_TYPES.map((t) => [t.name, t.dans]));
    expect(by["四段"]).toEqual(["a", "i", "u", "e"]);
    expect(by["上二段"]).toEqual(["i", "u"]);
    expect(by["下二段"]).toEqual(["u", "e"]);
    expect(by["上一段"]).toEqual(["i"]);
    expect(by["下一段"]).toEqual(["e"]);
  });

  it("段の図の行", () => {
    expect(parseDanChartLine("[段の図:四段,上二段]")).toEqual(["四段", "上二段"]);
    expect(parseDanChartLine("[段の図：下二段]")).toEqual(["下二段"]);
    expect(parseDanChartLine("四段活用")).toBeNull();
    expect(danChartRows(["四段", "知らない"]).map((r) => r.name)).toEqual(["四段"]);
  });

  it("文中の「ア段」などを分ける", () => {
    expect(splitDanWords("未然形がア段なら四段")).toEqual([
      { text: "未然形が", dan: null },
      { text: "ア段", dan: "a" },
      { text: "なら四段", dan: null },
    ]);
  });

  it("解説にある段の図は、どれも知っている名前だけ", () => {
    const dir = "public/grammar";
    let n = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const t = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      for (const s of t.sections ?? [])
        for (const line of String(s.content).split("\n")) {
          const names = parseDanChartLine(line);
          if (!names) continue;
          n++;
          expect(danChartRows(names)).toHaveLength(names.length);
        }
    }
    expect(n).toBeGreaterThanOrEqual(4);
  });
});
