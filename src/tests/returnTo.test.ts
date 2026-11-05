import { describe, it, expect } from "vitest";
import {
  dojoBack, drillUrlFromReference, makeReturnTo, quizUrlWithReturn, referenceUrlFromTopic, returnLabels, safeDojoBackPath, safeReturnPath,
  tokenIdFromHash, topicUrlWithBack, wordCardBack, wordCardUrlWithBack,
} from "@/lib/returnTo";

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

// 2026-11-06 状態遷移の見直し 案 E：単語カードからクイズへ・単語カードの戻り先
describe("単語カードから単語クイズへ：戻り先", () => {
  const card = `/word/${encodeURIComponent("あはれなり")}`;
  it("単語カードのパスも戻り先として受け付ける（?back= つき・エンコード前の見出し語も可）", () => {
    expect(safeReturnPath(card)).toBe(card);
    expect(safeReturnPath("/word/あはれなり")).toBe("/word/あはれなり");
    const withBack = `${card}?back=${encodeURIComponent("/read/texts/abc?layer=2#t=s1-t2")}`;
    expect(safeReturnPath(withBack)).toBe(withBack);
  });
  it("単語カード以外・壊れた値は通さない", () => {
    expect(safeReturnPath("/word/")).toBeNull();
    expect(safeReturnPath("/word")).toBeNull();
    expect(safeReturnPath("/word/a/b")).toBeNull();
    expect(safeReturnPath("/word/..")).toBeNull();
    expect(safeReturnPath("/word/../teacher")).toBeNull();
    expect(safeReturnPath("/words/abc")).toBeNull();
    expect(safeReturnPath("/word/a b")).toBeNull();
    expect(safeReturnPath("/word/a\\b")).toBeNull();
    expect(safeReturnPath("//example.com/word/abc")).toBeNull();
    expect(safeReturnPath("https://example.com/word/abc")).toBeNull();
    expect(safeReturnPath("/vocab")).toBeNull();
  });
  it("クイズの URL に付けた単語カードの戻り先は、受け取る側でそのまま読める", () => {
    const back = makeReturnTo(card, `?back=${encodeURIComponent("/read/texts/abc#t=s1-t2")}`);
    const url = quizUrlWithReturn(["151-1", "151-2"], back);
    const got = new URLSearchParams(url.slice(2)).get("back");
    expect(got).toBe(back);
    expect(safeReturnPath(got)).toBe(back);
  });
  it("戻るボタンの文字：単語カードなら「単語カード」、教材なら今までどおり「教材」", () => {
    expect(returnLabels(card)).toEqual({ short: "単語カードへ", long: "単語カードに戻る", title: "単語クイズを開いた単語カードに戻る" });
    expect(returnLabels(`${card}?back=%2Fread%2Ftexts%2Fabc`).short).toBe("単語カードへ");
    const text = { short: "教材へ", long: "教材に戻る", title: "単語クイズを開いた教材に戻る" };
    expect(returnLabels("/read/texts/abc#t=s1-t2")).toEqual(text);
    expect(returnLabels(null)).toEqual(text);
  });
});

describe("単語カード：戻り先", () => {
  it("単語カードの URL に戻り先を付ける（無ければ今までと同じ URL）", () => {
    expect(wordCardUrlWithBack("あはれなり", null)).toBe(`/word/${encodeURIComponent("あはれなり")}`);
    const back = makeReturnTo("/read/texts/97a9d9174a", "?layer=2", "s1-t20");
    const url = wordCardUrlWithBack("あはれなり", back);
    expect(url.startsWith(`/word/${encodeURIComponent("あはれなり")}?`)).toBe(true);
    const got = new URLSearchParams(url.split("?")[1]).get("back");
    expect(got).toBe("/read/texts/97a9d9174a?layer=2#t=s1-t20");
    expect(wordCardBack(got)).toEqual({ path: "/read/texts/97a9d9174a?layer=2#t=s1-t20", label: "← 教材に戻る" });
  });
  it("教材から来たときだけ「← 教材に戻る」。無い・教材以外・通せない値は今までどおり「← 単語」", () => {
    const home = { path: "/vocab", label: "← 単語" };
    expect(wordCardBack("/read/texts/abc")).toEqual({ path: "/read/texts/abc", label: "← 教材に戻る" });
    expect(wordCardBack(null)).toEqual(home);
    expect(wordCardBack("")).toEqual(home);
    expect(wordCardBack("/manabinaoshi")).toEqual(home);
    expect(wordCardBack("/read/grammar")).toEqual(home);
    expect(wordCardBack("/read/texts/")).toEqual(home);
    expect(wordCardBack("/read/texts/../../teacher")).toEqual(home);
    expect(wordCardBack("https://example.com/read/texts/abc")).toEqual(home);
    expect(wordCardBack("//example.com")).toEqual(home);
  });
});

// 2026-11-06 文法道場の見直し ⑥：単元ページ（/read/grammar/:topicId）の戻り先
describe("文法道場の単元ページ：戻り先", () => {
  it("通すのは 教材・学び始め・単語道場・文法道場ホーム だけ", () => {
    expect(safeDojoBackPath("/read/texts/abc?layer=2#t=s1-t2")).toBe("/read/texts/abc?layer=2#t=s1-t2");
    expect(safeDojoBackPath("/manabinaoshi")).toBe("/manabinaoshi");
    expect(safeDojoBackPath("/tango-dojo")).toBe("/tango-dojo");
    expect(safeDojoBackPath("/read/grammar")).toBe("/read/grammar");
  });
  it("外の URL・// で始まるもの・別の画面・壊れた値は通さない", () => {
    expect(safeDojoBackPath("https://example.com/read/texts/abc")).toBeNull();
    expect(safeDojoBackPath("//example.com/manabinaoshi")).toBeNull();
    expect(safeDojoBackPath("javascript:alert(1)")).toBeNull();
    expect(safeDojoBackPath("/\\example.com")).toBeNull();
    expect(safeDojoBackPath("/teacher")).toBeNull();
    expect(safeDojoBackPath("/manabinaoshi-x")).toBeNull();
    expect(safeDojoBackPath("/tango-dojo/../teacher")).toBeNull();
    expect(safeDojoBackPath("/read/texts/../../teacher")).toBeNull();
    expect(safeDojoBackPath("/read/grammar/review")).toBeNull();
    expect(safeDojoBackPath("/read/texts/")).toBeNull();
    expect(safeDojoBackPath("/read/texts/a b")).toBeNull();
    expect(safeDojoBackPath("manabinaoshi")).toBeNull();
    expect(safeDojoBackPath("")).toBeNull();
    expect(safeDojoBackPath(null)).toBeNull();
    expect(safeDojoBackPath(undefined)).toBeNull();
  });
  it("来た所で、戻るリンクの行き先と文字が変わる", () => {
    expect(dojoBack("/read/texts/abc#t=s1-t2")).toEqual({ path: "/read/texts/abc#t=s1-t2", label: "← 教材に戻る", fromOutside: true });
    expect(dojoBack("/manabinaoshi")).toEqual({ path: "/manabinaoshi", label: "← 学び始めに戻る", fromOutside: true });
    expect(dojoBack("/tango-dojo")).toEqual({ path: "/tango-dojo", label: "← 見分けるに戻る", fromOutside: true });
  });
  it("戻り先が無い・通せない値のときは、今までどおり「← 文法道場」", () => {
    const home = { path: "/read/grammar", label: "← 文法道場", fromOutside: false };
    expect(dojoBack(null)).toEqual(home);
    expect(dojoBack("/read/grammar")).toEqual(home);
    expect(dojoBack("https://example.com")).toEqual(home);
    expect(dojoBack("//example.com")).toEqual(home);
  });
  it("単元ページの URL に戻り先を付ける（無ければ今までと同じ URL）。付けた値は受け取る側でそのまま読める", () => {
    expect(topicUrlWithBack("jodoshi-mu", null)).toBe("/read/grammar/jodoshi-mu");
    const back = makeReturnTo("/read/texts/97a9d9174a", "?layer=2", "s1-t20");
    const url = topicUrlWithBack("jodoshi-mu", back);
    expect(url.startsWith("/read/grammar/jodoshi-mu?")).toBe(true);
    const got = new URLSearchParams(url.split("?")[1]).get("back");
    expect(got).toBe("/read/texts/97a9d9174a?layer=2#t=s1-t20");
    expect(dojoBack(got).label).toBe("← 教材に戻る");
  });
  it("解説ページへは来た単元を渡し、解説ページはその単元ページへ戻すリンクを作る", () => {
    expect(referenceUrlFromTopic("jodoshi-mu", null)).toBe("/read/reference/jodoshi-mu?from=jodoshi-mu");
    const url = referenceUrlFromTopic("jodoshi-mu", "/manabinaoshi");
    const p = new URLSearchParams(url.split("?")[1]);
    expect(p.get("from")).toBe("jodoshi-mu");
    expect(drillUrlFromReference(p.get("from"), p.get("back"))).toBe("/read/grammar/jodoshi-mu?back=%2Fmanabinaoshi");
    expect(drillUrlFromReference("jodoshi-mu", null)).toBe("/read/grammar/jodoshi-mu");
  });
  it("解説ページ：from が無い・単元の ID の形でないときは「ドリルに戻る」を出さない。通せない戻り先は捨てる", () => {
    expect(drillUrlFromReference(null, null)).toBeNull();
    expect(drillUrlFromReference("", null)).toBeNull();
    expect(drillUrlFromReference("../teacher", null)).toBeNull();
    expect(drillUrlFromReference("https://example.com", null)).toBeNull();
    expect(drillUrlFromReference("a/b", null)).toBeNull();
    expect(drillUrlFromReference("jodoshi-mu", "https://example.com")).toBe("/read/grammar/jodoshi-mu");
  });
});
