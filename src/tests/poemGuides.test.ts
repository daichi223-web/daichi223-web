import { describe, it, expect } from "vitest";
// 和歌教材の「歌ごとの解説」：vault の MD 節 → guides JSON の poems（scripts/poem-guides.mjs）
// @ts-expect-error scripts は型定義の無い mjs
import { parsePoemGuides, buildPoemsSection, POEM_FIELD_LABELS } from "../../scripts/poem-guides.mjs";

const SAMPLE = `
### 1. 春の野に若菜つまむと来しものを散りかふ花に道はまどひぬ
- 歌人: 紀貫之
- 文: s3
- 出典: 『古今和歌集』巻第二 春歌下・116
- 鑑賞: 目的と現実の落差。
- 歌意: 春の野に若菜を摘もうとやって来たのに、
  散り乱れる花のために道がわからなくなってしまった。
- 修辞: なし
- 根拠: https://example.invalid/（2026-11-08）

### 2. 仏は常にいませども　現ならぬぞあはれなる／人の音せぬ暁に　ほのかに夢に見えたまふ
- 文: s46 s47
- 歌意: …
- 鑑賞: 今様。
補足の行。
`;

describe("歌ごとの解説の MD → JSON", () => {
  it("h3 を1首として、歌人・文IDを属性に、ほかの箇条書きを決まった順の fields にする", () => {
    const items = parsePoemGuides(SAMPLE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ no: 1, text: "春の野に若菜つまむと来しものを散りかふ花に道はまどひぬ", author: "紀貫之", refs: ["s3"] });
    // 並びは POEM_FIELD_LABELS の順（MD の順ではない）
    // 根拠は vault にだけ残し、JSON（画面）には入れない
    expect(items[0].fields.map((f: { key: string }) => f.key)).toEqual(["出典", "歌意", "修辞", "鑑賞"]);
    // 2字下げの続きの行はつなぐ
    expect(items[0].fields.find((f: { key: string }) => f.key === "歌意").body).toBe("春の野に若菜を摘もうとやって来たのに、\n散り乱れる花のために道がわからなくなってしまった。");
  });
  it("文IDは空白区切りで複数書ける。歌人が無ければ属性を付けない。箇条書きの外の行は直前の項目に続く", () => {
    const items = parsePoemGuides(SAMPLE);
    expect(items[1].refs).toEqual(["s46", "s47"]);
    expect("author" in items[1]).toBe(false);
    expect(items[1].fields.find((f: { key: string }) => f.key === "鑑賞").body).toBe("今様。\n補足の行。");
  });
  it("節が空なら null", () => {
    expect(buildPoemsSection("")).toBeNull();
    expect(buildPoemsSection(SAMPLE)?.heading).toBe("歌ごとの解説");
  });
  it("札の一覧に歌意と鑑賞がある（T18 が必須にする項目）", () => {
    const keys = POEM_FIELD_LABELS.map(([k]: [string, string]) => k);
    expect(keys).toContain("歌意");
    expect(keys).toContain("鑑賞");
  });
});
