// 単語帳（330）に紐づく語の出現数と、決め手（decider）の有無を教材ごとに数える（読み取りのみ）
// 使い方: npx tsx scripts/vocab-deciders-count.ts [--all]
import fs from "node:fs";
import path from "node:path";
import { resolveVocabKey } from "../src/lib/vocabAlias";

const root = process.cwd(); // リポジトリの根元で実行する
const idx = JSON.parse(fs.readFileSync(path.join(root, "src/data/textsV3Index.json"), "utf8")) as { id: string; title: string }[];
const titles = new Map(idx.map((e) => [e.id, e.title]));
const rows: [number, number, string, string][] = [];
let texts = 0, total = 0, have = 0;
for (const f of fs.readdirSync(path.join(root, "public/texts-v3"))) {
  if (!f.endsWith(".json") || f === "index.json") continue;
  const id = f.slice(0, -5);
  const d = JSON.parse(fs.readFileSync(path.join(root, "public/texts-v3", f), "utf8"));
  if (!d || !Array.isArray(d.sentences)) continue;
  let an: Record<string, any> = {};
  try {
    const a = JSON.parse(fs.readFileSync(path.join(root, "public/analysis", f), "utf8"));
    for (const t of a.tokenAnalyses ?? []) an[t.tokenId] = t;
  } catch { /* 無ければ空 */ }
  let n = 0, h = 0;
  for (const s of d.sentences) for (const t of s.tokens ?? []) {
    const g = t.grammarTag ?? {};
    if (g.pos === "助動詞" || /助詞$/.test(g.pos ?? "") || g.pos === "記号") continue;
    if (!resolveVocabKey(t.text, g.baseForm, g.pos, g)) continue;
    n++; if (an[t.id]?.decider) h++;
  }
  rows.push([n, h, id, titles.get(id) ?? "?"]); texts++; total += n; have += h;
}
console.log(`教材 ${texts}　単語帳に紐づく語の出現 ${total}　うち決め手あり ${have}`);
rows.sort((a, b) => b[0] - a[0]);
for (const r of process.argv.includes("--all") ? rows : rows.slice(0, 15)) console.log(r.join("\t"));
