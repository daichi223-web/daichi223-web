import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { topicMetaFromIndex } from "@/lib/kobun/grammarTopicMeta";
import indexJson from "@/data/grammarTopicIndex.json";

const dir = join(process.cwd(), "public", "grammar");
const FIX = "直し方: node scripts/build-grammar-index.mjs（npm run build:grammar-index）を回して src/data/grammarTopicIndex.json をコミットする。";

describe("文法単元の索引 grammarTopicIndex.json", () => {
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();

  it("public/grammar/*.json の単元がすべて索引にあり、余分な単元がない", () => {
    const idx = Object.keys(indexJson as Record<string, unknown>).sort();
    expect(idx, `単元の一覧が食い違っています。${FIX}`).toEqual(ids);
  });

  it("題名・要約・分野・layer が単元の JSON と一致する", () => {
    for (const id of ids) {
      const t = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
      const m = topicMetaFromIndex(id);
      expect(m, `${id} が索引にありません。${FIX}`).toBeDefined();
      expect(
        { title: m!.title, summary: m!.summary, layer: m!.layer, category: m!.category },
        `${id} の索引が古くなっています。${FIX}`
      ).toEqual({ title: t.title, summary: t.summary, layer: t.layer, category: t.category });
    }
  });

  it("索引に無い単元は undefined（画面は単元の JSON を取りに行く）", () => {
    expect(topicMetaFromIndex("no-such-topic")).toBeUndefined();
    expect(topicMetaFromIndex("toString")).toBeUndefined();
  });
});
