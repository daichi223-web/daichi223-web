import { describe, it, expect } from "vitest";
import { makeReturnTo, quizUrlWithReturn, safeReturnPath, tokenIdFromHash } from "@/lib/returnTo";

describe("教材から単語クイズへ：戻り先", () => {
  it("今の教材画面と押した語を戻り先にする", () => {
    expect(makeReturnTo("/read/texts/97a9d9174a", "?layer=2", "s1-t20")).toBe("/read/texts/97a9d9174a?layer=2#t=s1-t20");
    expect(makeReturnTo("/read/texts/97a9d9174a", "")).toBe("/read/texts/97a9d9174a");
  });
  it("クイズの URL に qid と戻り先を付ける（戻り先が無ければ qid だけ）", () => {
    const url = quizUrlWithReturn(["151-1", "151-2"], "/read/texts/x?layer=2#t=s1-t2");
    const p = new URLSearchParams(url.slice(2));
    expect(p.get("qid")).toBe("151-1,151-2");
    expect(p.get("back")).toBe("/read/texts/x?layer=2#t=s1-t2");
    expect(quizUrlWithReturn(["1-1"], null)).toBe("/?qid=1-1");
  });
  it("教材画面のパスだけ受け付ける", () => {
    expect(safeReturnPath("/read/texts/abc#t=s1-t2")).toBe("/read/texts/abc#t=s1-t2");
    expect(safeReturnPath("https://example.com/read/texts/abc")).toBeNull();
    expect(safeReturnPath("//example.com")).toBeNull();
    expect(safeReturnPath("/teacher")).toBeNull();
    expect(safeReturnPath("/read/texts/a b")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
  it("hash から押した語を取り出す", () => {
    expect(tokenIdFromHash("#t=s1-t20")).toBe("s1-t20");
    expect(tokenIdFromHash("#other")).toBeNull();
    expect(tokenIdFromHash("")).toBeNull();
  });
});
