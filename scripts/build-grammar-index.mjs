#!/usr/bin/env node
/**
 * 文法の単元の「小さな索引」を作る（道場ホーム・学び始めが、単元ごとの JSON を何十個も取らずに済ませるため）。
 *   入力: public/grammar/*.json（単元の本体。この中身は変えない）
 *   出力: src/data/grammarTopicIndex.json（{ <単元ID>: { title, category, layer, summary } }。生成物。手で編集しない）
 *
 * 使い方:
 *   node scripts/build-grammar-index.mjs           索引を書き出す
 *   node scripts/build-grammar-index.mjs --check   いまの索引が単元の JSON と一致するか確かめる（違えば終了コード1）
 *
 * 単元を足したり題名・要約・分野・layer を直したりしたら、このスクリプトを回して索引をコミットする。
 * （索引に無い単元は画面が従来どおり単元の JSON を取りに行くので、回し忘れても画面は壊れないが、
 *   題名などが古いままになる。vitest の grammarTopicIndex.test.ts が食い違いを検出する）
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "grammar");
const out = join(root, "src", "data", "grammarTopicIndex.json");

export function buildIndex() {
  const index = {};
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
  for (const id of ids) {
    const t = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
    index[id] = { title: t.title, category: t.category, layer: t.layer, summary: t.summary };
  }
  return index;
}

const text = JSON.stringify(buildIndex(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  let cur = "";
  try {
    cur = readFileSync(out, "utf8");
  } catch {
    /* 無い */
  }
  if (cur !== text) {
    console.error("grammarTopicIndex.json が public/grammar/*.json と食い違っています。node scripts/build-grammar-index.mjs を回してください。");
    process.exit(1);
  }
  console.log("grammarTopicIndex.json は一致しています。");
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out} (${Object.keys(JSON.parse(text)).length} topics)`);
}
