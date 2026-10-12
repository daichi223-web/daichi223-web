import { describe, it, expect } from "vitest";
import { findShikibetsu, GROUPS } from "@/lib/kobun/shikibetsu";
import type { Token } from "@/lib/kobun/types";

let n = 0;
function tk(text: string, grammarTag: Partial<Token["grammarTag"]> = {}): Token {
  n++;
  return { id: `t${n}`, text, start: 0, end: 0, layer: 2, grammarTag: { pos: "", ...grammarTag } };
}
const answers = (tokens: Token[]) => findShikibetsu(tokens).map((t) => `${t.form}:${t.answer}`);

describe("「に」の識別", () => {
  it("6つの正体を grammarTag から決める", () => {
    expect(answers([tk("暮れ", { pos: "動詞", conjugationForm: "用" }), tk("に", { pos: "助動詞", conjugationForm: "用", meaning: "完了" }), tk("けり", { pos: "助動詞" })])).toEqual(["に:kanryo"]);
    expect(answers([tk("夢"), tk("に", { pos: "助動詞", conjugationForm: "用", meaning: "断定" }), tk("や", { pos: "係助詞" })])).toEqual(["に:dantei"]);
    expect(answers([tk("京"), tk("に", { pos: "格助詞", meaning: "場所" })])).toEqual(["に:kaku"]);
    expect(answers([tk("待つ", { pos: "動詞", conjugationForm: "体" }), tk("に", { pos: "接続助詞" })])).toEqual(["に:setsuzoku"]);
    expect(answers([tk("静かに", { pos: "形容動詞", conjugationForm: "用" })])).toEqual(["に:keidoshi"]);
    expect(answers([tk("げに", { pos: "副詞" })])).toEqual(["に:fukushi"]);
  });

  it("語の中の「に」は末尾の1文字だけを指す", () => {
    const [t] = findShikibetsu([tk("あはれに", { pos: "形容動詞" })]);
    expect(t.parts).toEqual([{ tokenId: expect.any(String), from: 3 }]);
    expect(t.clue).toContain("「あはれ」と合わせて一語");
  });

  it("手がかりに直前の活用形と直後の語を出す", () => {
    const [t] = findShikibetsu([tk("暮れ", { pos: "動詞", conjugationForm: "用" }), tk("に", { pos: "助動詞", meaning: "完了" }), tk("けり", { pos: "助動詞" })]);
    expect(t.clue).toBe("直前「暮れ」（連用形）・直後「けり」");
  });

  it("読点と文末を言い分ける", () => {
    expect(findShikibetsu([tk("盛り"), tk("に", { pos: "格助詞" }), tk("、")])[0].clue).toContain("直後に読点");
    expect(findShikibetsu([tk("盛り"), tk("に", { pos: "格助詞" }), tk("。")])[0].clue).toContain("直後で文が終わる");
  });

  it("正体を決められないものは出さない", () => {
    expect(findShikibetsu([tk("に")])).toEqual([]);
    expect(findShikibetsu([tk("に", { pos: "係助詞", meaning: "比較" })])).toEqual([]);
  });
});

describe("2語にまたがる「なむ」「らむ」", () => {
  it("な（完了・強意）＋む", () => {
    const r = findShikibetsu([tk("帰り", { pos: "動詞", conjugationForm: "用" }), tk("な", { pos: "助動詞", meaning: "強意" }), tk("む", { pos: "助動詞" })]);
    expect(r.map((t) => `${t.form}:${t.answer}`)).toEqual(["なむ:nu_mu"]);
    expect(r[0].parts.map((p) => p.from)).toEqual([0, 0]);
  });

  it("ナ変の未然形＋む", () => {
    const r = findShikibetsu([tk("往な", { pos: "動詞", conjugationType: "ナ変" }), tk("む", { pos: "助動詞" })]);
    expect(r.map((t) => `${t.form}:${t.answer}`)).toEqual(["なむ:nahen"]);
    expect(r[0].parts[0].from).toBe(1);
  });

  it("係助詞・終助詞の「なむ」は1語", () => {
    expect(answers([tk("これ"), tk("なむ", { pos: "係助詞" })])).toEqual(["なむ:kakari"]);
    expect(answers([tk("帰ら", { pos: "動詞" }), tk("なむ", { pos: "終助詞" })])).toEqual(["なむ:ganbou"]);
  });

  it("らむ3種", () => {
    expect(answers([tk("鳴く", { pos: "動詞", conjugationForm: "終" }), tk("らむ", { pos: "助動詞", meaning: "現在推量" })])).toEqual(["らむ:genzai"]);
    expect(answers([tk("よめ", { pos: "動詞", conjugationForm: "已" }), tk("ら", { pos: "助動詞", meaning: "完了" }), tk("む", { pos: "助動詞" })])).toEqual(["らむ:ri_mu"]);
    expect(answers([tk("あら", { pos: "動詞", conjugationType: "ラ変", conjugationForm: "未" }), tk("む", { pos: "助動詞" })])).toEqual(["らむ:gobi_mu"]);
    expect(answers([tk("ざら", { pos: "助動詞", meaning: "打消" }), tk("め", { pos: "助動詞" })])).toEqual(["らめ:gobi_mu"]);
  });

  it("「む」が助動詞でなければ組まない", () => {
    expect(findShikibetsu([tk("あら", { pos: "動詞" }), tk("む", { pos: "" })])).toEqual([]);
  });
});

describe("ぬ・ね／る・れ／し／なり", () => {
  it("ぬ・ね", () => {
    expect(answers([tk("咲か", { pos: "動詞" }), tk("ぬ", { pos: "助動詞", meaning: "打消" })])).toEqual(["ぬ:uchikeshi"]);
    expect(answers([tk("咲き", { pos: "動詞" }), tk("ぬ", { pos: "助動詞", meaning: "完了" })])).toEqual(["ぬ:kanryo"]);
    expect(answers([tk("行き", { pos: "動詞" }), tk("ね", { pos: "助動詞", meaning: "強意" })])).toEqual(["ね:kanryo"]);
    expect(answers([tk("死ぬ", { pos: "動詞", conjugationType: "ナ変" })])).toEqual(["ぬ:nahen"]);
  });

  it("る・れ", () => {
    expect(answers([tk("咲け", { pos: "動詞" }), tk("る", { pos: "助動詞", meaning: "存続" })])).toEqual(["る:ri"]);
    expect(answers([tk("言は", { pos: "動詞" }), tk("れ", { pos: "助動詞", meaning: "受身" })])).toEqual(["れ:ru"]);
  });

  it("し", () => {
    expect(answers([tk("見", { pos: "動詞" }), tk("し", { pos: "助動詞", meaning: "過去" }), tk("人")])).toEqual(["し:kako"]);
    expect(answers([tk("し", { pos: "動詞", conjugationType: "サ変" }), tk("けり")])).toEqual(["し:sahen"]);
    expect(answers([tk("名"), tk("に", { pos: "格助詞" }), tk("し", { pos: "副助詞" })])).toEqual(["に:kaku", "し:fukujoshi"]);
  });

  it("なり", () => {
    expect(answers([tk("竹"), tk("なり", { pos: "助動詞", meaning: "断定" })])).toEqual(["なり:dantei"]);
    expect(answers([tk("あ"), tk("なり", { pos: "助動詞", meaning: "推定" })])).toEqual(["なり:denbun"]);
    expect(answers([tk("近く"), tk("なり", { pos: "動詞", conjugationType: "ラ四" })])).toEqual(["なり:doushi"]);
    expect(answers([tk("あはれなり", { pos: "形容動詞" })])).toEqual(["なり:keidoshi"]);
  });

  it("正解は必ず選択肢の中にある", () => {
    for (const g of Object.values(GROUPS)) expect(new Set(g.choices.map((c) => c.id)).size).toBe(g.choices.length);
    const all = findShikibetsu([
      tk("静かに", { pos: "形容動詞" }), tk("帰り"), tk("な", { pos: "助動詞", meaning: "完了" }), tk("む", { pos: "助動詞" }),
      tk("咲け"), tk("る", { pos: "助動詞", meaning: "存続" }), tk("あら", { pos: "動詞" }), tk("む", { pos: "助動詞" }),
    ]);
    for (const t of all) expect(GROUPS[t.group].choices.some((c) => c.id === t.answer)).toBe(true);
  });
});
