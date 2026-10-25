import { describe, it, expect } from "vitest";
import { cardSenses, senseKey, sensesOf } from "@/lib/kobun/wordCardSenses";

const names = (ss: { senseNorm?: string; sense?: string }[]) => ss.map((s) => s.senseNorm ?? s.sense);

describe("浮かぶ解説カード：単語帳の意味の一覧", () => {
  it("「活用違い」だけを1つにまとめる", () => {
    expect(senseKey("おっしゃる（活用違い）")).toBe("おっしゃる");
    expect(senseKey("いらっしゃる（本動詞・活用違い）")).toBe("いらっしゃる（本動詞）");
    expect(names(sensesOf("おほす", 152))).toEqual(["おっしゃる"]);
  });
  it("かっこの中身が違う意味は別に残す（のたまふ／のたまはす）", () => {
    expect(names(sensesOf("のたまふ・のたまはす", 151))).toEqual(["おっしゃる（のたまふ）", "おっしゃる（のたまはす・最高敬語）"]);
  });
  it("この箇所の意味が既定の群にあれば、その群のまま", () => {
    const r = cardSenses("たまふ", 159, "お〜になる（四段・補助動詞）");
    expect(r.group).toBe(159);
    expect(r.curIdx).toBe(1);
  });
  it("既定の群に無く同じ見出しの別の群にあれば、その群を出す（下二段の「たまふ」、名詞の「よし」）", () => {
    const t = cardSenses("たまふ", 159, "〜ております（下二段・謙譲/丁寧）");
    expect(t.group).toBe(160);
    expect(names(t.senses)[t.curIdx]).toBe("〜ております（下二段・謙譲/丁寧）");
    const y = cardSenses("よし", 16, "旨");
    expect(y.group).toBe(122);
    expect(names(y.senses)[y.curIdx]).toBe("旨");
  });
  it("完全に一致する意味を部分一致より先に取る", () => {
    const r = cardSenses("のたまふ・のたまはす", 151, "おっしゃる（のたまはす・最高敬語）");
    expect(names(r.senses)[r.curIdx]).toBe("おっしゃる（のたまはす・最高敬語）");
  });
  it("どの群にも無ければ既定の群で、太字なし", () => {
    const r = cardSenses("よし", 16, "まったく関係のない意味");
    expect(r.group).toBe(16);
    expect(r.curIdx).toBe(-1);
  });
});
