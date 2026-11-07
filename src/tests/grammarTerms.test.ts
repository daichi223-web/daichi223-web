import { describe, it, expect } from "vitest";
import { TERM_GROUPS, ALL_TERM_CARDS, groupDone, resumeIndex } from "@/lib/kobun/grammarTerms";
import { GLOSSARY } from "@/lib/kobun/glossary";

describe("文法用語になれる（学び始め 段0）", () => {
  it("glossary の全部の用語が1枚ずつカードになっている（48語）", () => {
    const terms = ALL_TERM_CARDS.map((c) => c.term);
    expect(new Set(terms).size).toBe(terms.length);
    const want = GLOSSARY.map((g) => g.term).sort();
    expect([...terms].sort()).toEqual(want);
    expect(terms.length).toBe(48);
  });

  it("id は重複せず gt- で始まる", () => {
    const ids = ALL_TERM_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^gt-/);
  });

  it("確認の1問は正解が選択肢に入り、選択肢に重複が無く、2つ以上ある", () => {
    for (const c of ALL_TERM_CARDS) {
      expect(c.check.choices, c.term).toContain(c.check.answer);
      expect(new Set(c.check.choices).size).toBe(c.check.choices.length);
      expect(c.check.choices.length).toBeGreaterThanOrEqual(2);
      expect(c.check.explanation.length).toBeGreaterThan(0);
      expect(c.examples.length).toBeGreaterThan(0);
    }
  });

  it("6グループで、発展は 本動詞・補助動詞・自動詞・他動詞", () => {
    expect(TERM_GROUPS.map((g) => g.title)).toEqual(["きほん", "用言", "助動詞", "助詞", "敬語", "発展"]);
    expect(TERM_GROUPS[5].cards.map((c) => c.term)).toEqual(["本動詞", "補助動詞", "自動詞", "他動詞"]);
  });

  it("進み具合：済んだ枚数と続きの位置", () => {
    const g = TERM_GROUPS[0];
    const p = { solved: [g.cards[0].id, g.cards[1].id, "gt-nothing"], first: {} };
    expect(groupDone(g, p)).toBe(2);
    expect(resumeIndex(g, p)).toBe(2);
    expect(resumeIndex(g, { solved: g.cards.map((c) => c.id), first: {} })).toBe(0);
  });
});
