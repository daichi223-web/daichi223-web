import { describe, it, expect } from "vitest";
import { GLOSSARY, splitGloss } from "@/lib/kobun/glossary";
import { STAGES, stageStyle } from "@/lib/kobun/manabinaoshi";

const marked = (text: string, exclude?: string[]) =>
  splitGloss(text, exclude).filter((p) => p.entry).map((p) => p.text);

describe("用語のタップ解説", () => {
  it("長い語を先に取る（形容動詞・助動詞・格助詞・四段活用）", () => {
    expect(marked("形容動詞と助動詞と格助詞と四段活用")).toEqual(["形容動詞", "助動詞", "格助詞", "四段活用"]);
  });

  it("同じ語は1つの文で最初の1回だけ", () => {
    expect(marked("活用する。活用しない。")).toEqual(["活用"]);
  });

  it("exclude の語（カード自身の見出し語）には印を付けない", () => {
    expect(marked("用言は動詞などの言葉", ["用言"])).toEqual(["動詞"]);
  });

  it("分けた文をつなぐと元の文に戻る", () => {
    const t = "「ず」は未然形に接続する。だから「書く」は「書か」になって「書かず」。";
    expect(splitGloss(t).map((p) => p.text).join("")).toBe(t);
  });

  it("用語カードの見出し語の多くが用語集にある", () => {
    const terms = new Set(GLOSSARY.map((g) => g.term));
    for (const id of ["用言", "体言", "活用", "助動詞", "助詞", "接続", "音便", "係り結び"]) expect(terms.has(id)).toBe(true);
  });

  it("用語集に1字の語や重複を入れない", () => {
    const terms = GLOSSARY.map((g) => g.term);
    expect(new Set(terms).size).toBe(terms.length);
    for (const t of terms) expect(t.length).toBeGreaterThan(1);
  });
});

describe("やるうちに学ぶ（問いが先）", () => {
  it("下の段は問いが先、上の段は説明が先", () => {
    expect(stageStyle(0).questionFirst).toBe(true);
    expect(stageStyle(2).questionFirst).toBe(true);
    expect(stageStyle(4).questionFirst).toBe(false);
    expect(STAGES.length).toBe(5);
  });
});
