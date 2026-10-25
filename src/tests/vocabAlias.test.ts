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

// 2026-10-25 紐づけの誤り2件（燕の子安貝の「さはる」＝触る、中世の歌の「はやさよ」の接尾語「さ」）
describe("resolveVocabKey 同音の別語と接尾語「さ」", () => {
  it("基本形が「触る」なら単語帳の「さはる」（障る）に当てない", () => {
    expect(resolveVocabKey("さはる", "触る", "動詞", { conjugationType: "ラ四" })).toBeNull();
  });
  it("障るの「さはる」は、漢字表記や基本形の無い活用形（天の羽衣「さはらじ」）でも当たる", () => {
    expect(resolveVocabKey("さはら", undefined, "動詞", { conjugationType: "ラ四" })).toBe("さはる");
    expect(resolveVocabKey("障る", undefined, "動詞", { conjugationType: "ラ四" })).toBe("さはる");
    expect(resolveVocabKey("さはる", undefined, "動詞", { conjugationType: "ラ四" })).toBe("さはる");
  });
  it("接尾語の「さ」は単語帳の「さ」に当てない（品詞が空なら従来どおり当たる＝データ側で接尾語にする）", () => {
    expect(resolveVocabKey("さ", undefined, "接尾語")).toBeNull();
    expect(resolveVocabKey("さ", undefined, "")).toBe("さ");
  });
});

// 2026-10-25 紐づけ漏れの点検（品詞の照合をクイズのデータの品詞でも見る／同じ形で品詞の違う見出し）
describe("resolveVocabKey 紐づけ漏れ", () => {
  it("vocabIndex の品詞が粗い見出しでも、クイズのデータの品詞で当たる（はべり・副詞かく・副詞さ・ことなり）", () => {
    expect(resolveVocabKey("はべり", undefined, "補助動詞", { conjugationType: "ラ変" })).toBe("はべり");
    expect(resolveVocabKey("かく", undefined, "副詞")).toBe("かく");
    expect(resolveVocabKey("さ", undefined, "副詞")).toBe("さ");
    expect(resolveVocabKey("異なり", undefined, "形容動詞", { conjugationType: "ナリ" })).toBe("ことなり");
  });
  it("除外は保つ（動詞の「かく」、接尾語の「さ」、ラ変の「さる」）", () => {
    expect(resolveVocabKey("かけ", "かく", "動詞", { conjugationType: "カ下二" })).toBeNull();
    expect(resolveVocabKey("さ", undefined, "接尾語")).toBeNull();
    expect(resolveVocabKey("さる", undefined, "動詞", { conjugationType: "ラ変" })).toBeNull();
  });
  it("動詞の「おぼえ」は名詞の見出し「おぼえ」でなく「おぼゆ」、形容詞の「とく」は副詞の見出し「とく」", () => {
    expect(resolveVocabKey("おぼえ", "おぼえ", "動詞", { conjugationType: "ヤ下二" })).toBe("おぼゆ");
    expect(resolveVocabKey("おぼえ", undefined, "")).toBe("おぼえ");
    expect(resolveVocabKey("とく", undefined, "形容詞", { conjugationType: "ク" })).toBe("とく");
  });
  it("漢字の「鳴る」は「なる」へ", () => {
    expect(resolveVocabKey("鳴り", undefined, "動詞", { conjugationType: "ラ四" })).toBe("なる");
  });
  it("1語にまとめた複合語は構成語の見出しへ（品詞・活用は末尾の語のものなので照合しない）", () => {
    expect(resolveVocabKey("うちまもり", "うちまもる", "動詞", { conjugationType: "ラ四" })).toBe("まもる");
    expect(resolveVocabKey("聞こえやら", "聞こえやる", "動詞", { conjugationType: "ラ四", honorific: "謙譲" })).toBe("きこゆ・きこえさす");
    expect(resolveVocabKey("聞こえまほしげなる", "聞こえまほしげなり", "形容動詞", { conjugationType: "ナリ", honorific: "謙譲" })).toBe("きこゆ・きこえさす");
    expect(resolveVocabKey("帰り参り", "帰り参る", "動詞", { conjugationType: "ラ四", honorific: "謙譲" })).toBe("まゐる");
    expect(resolveVocabKey("念じあへ", "念じあふ", "動詞", { conjugationType: "ハ下二" })).toBe("ねんず");
    expect(resolveVocabKey("群れゐ", "群れゐる", "動詞", { conjugationType: "ワ上一" })).toBe("ゐる");
    expect(resolveVocabKey("女はらから", undefined, "")).toBe("はらから");
    expect(resolveVocabKey("おぼつかなさ", undefined, "")).toBe("おぼつかなし");
  });
  it("接頭語「うち」の複合語は名詞の見出し「うち」（宮中・中）に当てない", () => {
    expect(resolveVocabKey("うち泣き", "うち泣く", "動詞", { conjugationType: "カ四" })).toBeNull();
  });
});
