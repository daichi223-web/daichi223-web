import { describe, expect, it } from "vitest";
import { buildCsv, buildPrintHtml, csvCell, noOf, pct, sortRows, type ExportMeta, type WordMistakeRow } from "../lib/wordMistakeExport";
import { parseWordRange, wordNo } from "../../api/_wordRange";

const row = (id: string, o: Partial<WordMistakeRow> = {}): WordMistakeRow => ({
  id,
  n: 10,
  wrong: 2,
  users: 5,
  wrongUsers: 2,
  repeatUsers: 0,
  firstWrong: 1,
  confused: [],
  ...o,
});

const info = {
  "101-1": { lemma: "あはれなり", sense: "しみじみと趣深い" },
  "102-2": { lemma: "をかし", sense: "趣がある" },
  "9-1": { lemma: "=危険", sense: "+式" },
};

const meta: ExportMeta = {
  from: "2026-11-01",
  to: "2026-11-26",
  scope: "KU 1年 3組",
  range: [101, 150],
  generatedAt: "2026-11-26T03:00:00.000Z",
  totals: { words: 2, n: 20, wrong: 7 },
};

describe("番号範囲", () => {
  it("101-150 を読み、逆順・0・形違いは null", () => {
    expect(parseWordRange("101-150")).toEqual([101, 150]);
    expect(parseWordRange(" 5-5 ")).toEqual([5, 5]);
    expect(parseWordRange("150-101")).toBeNull();
    expect(parseWordRange("0-10")).toBeNull();
    expect(parseWordRange("101")).toBeNull();
    expect(parseWordRange(undefined)).toBeNull();
  });
  it("qid の番号", () => {
    expect(wordNo("123-2")).toBe(123);
    expect(wordNo("abc")).toBeNull();
    expect(noOf("7-1")).toBe(7);
  });
});

describe("並べ替え", () => {
  const rows = [row("102-2", { wrongUsers: 3, users: 6 }), row("101-1", { wrongUsers: 3, users: 3 }), row("9-1", { wrongUsers: 1 })];
  it("間違えた人の多い順（同数は割合の高い方が先）", () => {
    expect(sortRows(rows, "wrongUsers").map((r) => r.id)).toEqual(["101-1", "102-2", "9-1"]);
  });
  it("番号順は数として並べる（9 < 101）", () => {
    expect(sortRows(rows, "number").map((r) => r.id)).toEqual(["9-1", "101-1", "102-2"]);
  });
});

describe("CSV", () => {
  it("BOM・CRLF・見出し・行の数値が元データどおり", () => {
    const csv = buildCsv([row("101-1", { n: 12, wrong: 5, users: 6, wrongUsers: 4, repeatUsers: 1, firstWrong: 3, confused: [{ id: "102-2", n: 3, users: 2 }] })], info, meta);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.includes("\r\n")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe('"期間","2026-11-01 〜 2026-11-26"');
    expect(lines[2]).toBe('"単語の範囲","101〜150番"');
    expect(lines[3]).toBe('"形式","選択式だけ（語→意味・意味→語・例文・空欄補充・多義語の例文理解。○×と記述は入れない）"');
    expect(lines[4]).toBe('"作成","2026-11-26 12:00"');
    expect(lines[7]).toBe('101,"101-1","あはれなり","しみじみと趣深い",6,4,"66.7%",3,1,12,5,"41.7%","をかし（趣がある） 2人・3回"');
  });
  it("数式に見える文字列は ' を付けて無害化し、\" は二重にする", () => {
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(3)).toBe("3");
    const csv = buildCsv([row("9-1")], info, meta);
    expect(csv).toContain(`"'=危険","'+式"`);
  });
  it("割合は分母0なら空", () => {
    expect(pct(1, 0)).toBe("");
    expect(pct(1, 3)).toBe("33.3%");
  });
});

describe("印刷用の表", () => {
  it("見出し・要約・行・注記が入り、HTML をエスケープする", () => {
    const html = buildPrintHtml([row("101-1"), row("x<y>")], info, meta, "number", false);
    expect(html).toContain("2026-11-01 〜 2026-11-26");
    expect(html).toContain("KU 1年 3組");
    expect(html).toContain("101〜150番");
    expect(html).toContain("番号順");
    expect(html).toContain("選択式だけ");
    expect(html).toContain("2026-11-26 12:00"); // JST
    expect(html).toContain("<strong>35%</strong>"); // 7/20
    expect(html).toContain("あはれなり");
    expect(html).toContain("x&lt;y&gt;");
    expect(html).not.toContain("x<y>");
    expect(html).not.toContain("window.print()},300"); // autoPrint=false
  });
  it("行が無いときは「ありません」", () => {
    expect(buildPrintHtml([], info, { ...meta, totals: { words: 0, n: 0, wrong: 0 } }, "wrongUsers")).toContain("回答のあった単語はありません");
  });
});
