import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolveLayout, splitAttribution, kuMarks, dropAttributionPairs, pieceText, type WakaLayout } from "@/lib/kobun/wakaLayout";
import type { KobunText, Sentence, Token } from "@/lib/kobun/types";

const read = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8"));
const tok = (id: string, text: string, start: number): Token => ({ id, text, start, end: start + text.length, layer: 0, grammarTag: { pos: "" } });
const sentence = (id: string, parts: string[]): Sentence => {
  let pos = 0;
  const tokens = parts.map((p, i) => {
    const t = tok(`${id}-t${i + 1}`, p, pos);
    pos += p.length;
    return t;
  });
  return { id, originalText: parts.join(""), modernTranslation: "", tokens };
};

describe("右寄せの歌人名・出典を分ける", () => {
  it("スペースだけのトークンで頭と尾に分ける", () => {
    const s = sentence("s2", ["寛平", "の", "歌〈春〉", "　　　　", "紀貫之"]);
    const sp = splitAttribution(s)!;
    expect(sp.head.map((t) => t.text)).toEqual(["寛平", "の", "歌〈春〉"]);
    expect(sp.tail.map((t) => t.text)).toEqual(["紀貫之"]);
  });
  it("スペースがトークンの中にあれば、そのトークンを切った写しを作る（id は元のまま）", () => {
    const s = sentence("s1", ["秋", "の", "暮れ", "　　　松尾芭蕉"]);
    const sp = splitAttribution(s)!;
    expect(sp.head.map((t) => t.text)).toEqual(["秋", "の", "暮れ"]);
    expect(sp.tail.map((t) => [t.id, t.text])).toEqual([["s1-t4", "松尾芭蕉"]]);
    const s2 = sentence("s3", ["よめ", "る", "〈恋〉　　 　　", "皇嘉門院別当"]);
    const sp2 = splitAttribution(s2)!;
    expect(sp2.head.map((t) => t.text)).toEqual(["よめ", "る", "〈恋〉"]);
    expect(sp2.tail.map((t) => t.text)).toEqual(["皇嘉門院別当"]);
  });
  it("スペース1つや、スペースの後ろに何も無ければ分けない", () => {
    expect(splitAttribution(sentence("s4", ["玉だすき", "　", "畝傍"]))).toBeNull();
    expect(splitAttribution(sentence("s5", ["暮れ", "　　　"]))).toBeNull();
  });
});

describe("句の切れ目", () => {
  it("短歌は第三句の後ろで行を替え、ほかは空き", () => {
    const s = sentence("s3", ["春", "の", "野", "に", "若菜", "つま", "む", "と", "来", "し", "ものを", "散りかふ", "花", "に", "道", "は", "まどひ", "ぬ"]);
    const m = kuMarks(s.tokens, [4, 10, 15, 21], "tanka")!;
    expect([...m]).toEqual([
      ["s3-t4", "space"],
      ["s3-t8", "space"],
      ["s3-t11", "break"],
      ["s3-t14", "space"],
    ]);
  });
  it("語の途中の切れ目は付けない（語を割らない）", () => {
    const s = sentence("s9", ["春の夜の", "夢の浮橋"]);
    expect([...kuMarks(s.tokens, [2, 4], "tanka")!]).toEqual([["s9-t1", "space"]]);
  });
});

describe("構成ファイルが無い教材", () => {
  it("1文＝1かたまりで、末尾の右寄せだけ分ける", () => {
    const a = sentence("s1", ["行く春を", "惜しみ", "けり", "　　　　", "芭蕉"]);
    const b = sentence("s2", ["ここ", "は", "散文", "。"]);
    const blocks = resolveLayout(null, [a, b]);
    expect(blocks.map((x) => x.kind)).toEqual(["prose", "prose"]);
    expect(blocks[0].kind === "prose" && blocks[0].tail && pieceText(blocks[0].tail)).toBe("芭蕉");
    expect(blocks[1].kind === "prose" && blocks[1].tail).toBeNull();
  });
});

describe("逐語訳から右寄せの名前を除く", () => {
  it("名前とスペースだけの区切りを落とす", () => {
    expect(dropAttributionPairs([["歌", "歌"], ["〈春〉　　　", "〈春〉"], ["　　　", ""], ["紀貫之", "紀貫之"]] as [string, string][], "紀貫之")).toEqual([
      ["歌", "歌"],
      ["〈春〉　　　", "〈春〉"],
    ]);
  });
  it("名前は末尾側の1つだけ落とす（詞書の中の同じ名前は残す）", () => {
    expect(dropAttributionPairs([["額田王", "額田王"], ["の", "の（詠んだ）"], ["歌", "歌"], ["額田王", "額田王"]] as [string, string][], "額田王")).toEqual([
      ["額田王", "額田王"],
      ["の", "の（詠んだ）"],
      ["歌", "歌"],
    ]);
  });
});

describe("実データ：和歌4本の構成ファイル", () => {
  const ids = ["f0740d6350", "faa890f809", "2e45c61a81", "b1d89ce45e"];
  for (const id of ids) {
    const lp = `public/waka/${id}.json`;
    it(`${id}: 全文が1回ずつ現れ、歌人名と句の切れ目が本文に乗る`, () => {
      expect(existsSync(lp)).toBe(true);
      const layout = read<WakaLayout>(lp);
      const text = read<KobunText>(`public/texts-v3/${id}.json`);
      const blocks = resolveLayout(layout, text.sentences);
      // 安全弁（構成ファイルに無い文）は出ない
      expect(blocks.filter((b) => b.kind === "prose")).toHaveLength(0);
      // 描いた文字を全部つなぐと本文（スペースを除く）と同じ
      const drawn = blocks
        .flatMap((b) => (b.kind === "collection" ? b.pieces : b.kind === "poem" ? [...b.kotobagaki, ...b.lines, ...b.hanka, ...(b.author ? [b.author] : [])] : []))
        .map(pieceText)
        .join("")
        .replace(/[\s　]/g, "");
      const all = text.sentences.map((s) => s.originalText).join("").replace(/[\s　]/g, "");
      expect(drawn.length).toBe(all.length);
      expect([...drawn].sort().join("")).toBe([...all].sort().join(""));
      for (const b of blocks) {
        if (b.kind !== "poem") continue;
        if (b.author) expect(pieceText(b.author)).toMatch(/^[^\s　]{2,8}$/);
        for (const l of [...b.lines, ...b.hanka]) {
          if (!l.kuMarks) continue;
          expect(l.kuMarks.size).toBe(b.form === "hokku" ? 2 : 4);
        }
      }
    });
  }
  it("王朝の歌：割れた詞書が1つのかたまりになり、句の切れ目で上の句と下の句に分かれる", () => {
    const layout = read<WakaLayout>("public/waka/f0740d6350.json");
    const text = read<KobunText>("public/texts-v3/f0740d6350.json");
    const blocks = resolveLayout(layout, text.sentences);
    expect(blocks[0]).toMatchObject({ kind: "collection", title: "古今和歌集" });
    const tatsuta = blocks.find((b) => b.kind === "poem" && b.kotobagaki.some((p) => p.sentence.id === "s6"));
    expect(tatsuta && tatsuta.kind === "poem" && tatsuta.kotobagaki.map((p) => p.sentence.id)).toEqual(["s6", "s7"]);
    expect(tatsuta && tatsuta.kind === "poem" && pieceText(tatsuta.author!)).toBe("素性");
    expect(tatsuta && tatsuta.kind === "poem" && pieceText(tatsuta.kotobagaki[1])).toBe("に紅葉流れたる形を書けりけるを題にてよめる〈秋〉");
    const first = blocks[1];
    expect(first.kind === "poem" && [...first.lines[0].kuMarks!.values()]).toEqual(["space", "space", "break", "space"]);
  });
  it("万葉の歌：長歌の行には切れ目を付けず、反歌は短歌として行を替える", () => {
    const layout = read<WakaLayout>("public/waka/2e45c61a81.json");
    const text = read<KobunText>("public/texts-v3/2e45c61a81.json");
    const choka = resolveLayout(layout, text.sentences).find((b) => b.kind === "poem" && b.form === "choka");
    expect(choka && choka.kind === "poem" && choka.lines.every((l) => !l.kuMarks)).toBe(true);
    expect(choka && choka.kind === "poem" && [...choka.hanka[0].kuMarks!.values()]).toEqual(["space", "space", "break", "space"]);
  });
});
