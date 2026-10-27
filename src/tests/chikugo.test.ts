import { describe, it, expect } from "vitest";
import { displayTranslations, splitHokan } from "@/lib/kobun/chikugo";

describe("逐語訳の表示の順", () => {
  it("3つ目の数だけ後ろへ送る（疑問・反語のや・かは結びの後ろ）", () => {
    expect(displayTranslations([["光", "光（が）"], ["や", "か", 1], ["ある", "ある"], ["と", "と"]])).toEqual(["光（が）", "ある", "か", "と"]);
    expect(displayTranslations([["いかで", "どうして"], ["か", "か、いやできない", 2], ["とる", "手に入れる"], ["べき", "ことができよう"], ["」と", "」と"]]))
      .toEqual(["どうして", "手に入れる", "ことができよう", "か、いやできない", "」と"]);
  });
  it("送った先の句読点は送った訳の後ろへ回す", () => {
    expect(displayTranslations([["心", "心"], ["や", "か", 2], ["おはし", "いらっしゃっ"], ["けむ、", "たのだろう、"]]))
      .toEqual(["心", "いらっしゃっ", "たのだろう", "か、"]);
  });
  it("負の数は前の区切りの手前へ送る（強意の「きっと」）", () => {
    expect(displayTranslations([["まさり", "まさっている"], ["な", "きっと", -1], ["む。", "だろう。"]])).toEqual(["きっと", "まさっている", "だろう。"]);
  });
  it("数が無ければそのまま", () => {
    expect(displayTranslations([["なほ、", "それでもやはり、"], ["こ", "こ"]])).toEqual(["それでもやはり、", "こ"]);
  });
});

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
