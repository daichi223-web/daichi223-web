import { describe, it, expect } from "vitest";
import { resolveVocabKey } from "@/lib/vocabAlias";

// 2026-10-23 の対応表の修正（教材の語を単語帳の見出しへ）
describe("resolveVocabKey 漢字表記の追加", () => {
  it("基本形の無い漢字表記も見出しに当たる", () => {
    expect(resolveVocabKey("隈なき", undefined, "形容詞")).toBe("くまなし");
    expect(resolveVocabKey("心地", undefined, "")).toBe("ここち");
    expect(resolveVocabKey("世", undefined, "")).toBe("よ・よのなか");
    expect(resolveVocabKey("口惜しく", undefined, "形容詞")).toBe("くちをし");
    expect(resolveVocabKey("悔しき", undefined, "形容詞")).toBe("くやし");
  });
  it("同音の別語には当てない", () => {
    expect(resolveVocabKey("悲しき", undefined, "形容詞")).toBeNull(); // かなし＝いとしい
    expect(resolveVocabKey("守る", undefined, "動詞")).toBeNull(); // まもる＝見つめる
    expect(resolveVocabKey("手", undefined, "")).toBeNull(); // て＝筆跡
  });
});

describe("resolveVocabKey 活用の種類・敬語の規則", () => {
  it("ラ変「さる」（然り）は避る（ラ四）に当てない", () => {
    expect(resolveVocabKey("さる", undefined, "動詞", { conjugationType: "ラ変" })).toBeNull();
    expect(resolveVocabKey("さる", "さる", "動詞", { conjugationType: "ラ四" })).toBe("さる");
  });
  it("ラ四「送る」は後る（ラ下二）に当てない", () => {
    expect(resolveVocabKey("おくる", undefined, "動詞", { conjugationType: "ラ四" })).toBeNull();
    expect(resolveVocabKey("後れ", undefined, "動詞", { conjugationType: "ラ下二" })).toBe("おくる");
  });
  it("動詞「掛く」「解く」は副詞「かく」「とく」に当てない", () => {
    expect(resolveVocabKey("かけ", "かく", "動詞", { conjugationType: "カ下二" })).toBeNull();
    expect(resolveVocabKey("とけ", "とく", "動詞", { conjugationType: "カ下二" })).toBeNull();
  });
  it("謙譲の「聞こゆ」は「きこゆ・きこえさす」へ", () => {
    expect(resolveVocabKey("聞こえ", undefined, "動詞", { honorific: "謙譲" })).toBe("きこゆ・きこえさす");
    expect(resolveVocabKey("聞こえ", undefined, "動詞", {})).toBe("きこゆ");
  });
  it("接頭語・接尾語は当てない", () => {
    expect(resolveVocabKey("うち", undefined, "接頭語")).toBeNull();
    expect(resolveVocabKey("たち", undefined, "接尾語")).toBeNull();
  });
});
