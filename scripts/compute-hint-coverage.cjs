#!/usr/bin/env node
/**
 * 各教材の hint カバレッジを計算し、textsV3Index.json に `hintCoverage`
 * (パーセント、0-100) を追記する。
 *
 * カバレッジ計算:
 *   total = その教材の全 token 数
 *   with_hint = hint が入っている token 数
 *   hintCoverage = round(with_hint / total * 100)
 *
 * UI (HomeV3) 側で hintCoverage >= 50 なら「✓ 重要ポイント入り」バッジ表示。
 *
 * 実行タイミング:
 *   - token hint を追加/更新した後に手動実行
 *   - または npm run build:hint-coverage を package.json に登録して CI で自動化
 */
const fs = require("fs");
const path = require("path");

const TEXTS_V3_DIR = path.join(__dirname, "..", "public", "texts-v3");
const INDEX_SRC = path.join(__dirname, "..", "src", "data", "textsV3Index.json");
const INDEX_PUB = path.join(__dirname, "..", "public", "texts-v3", "index.json");
const TEXTS_INDEX_SRC = path.join(__dirname, "..", "src", "data", "textsIndex.json");
const TEXTS_INDEX_PUB = path.join(__dirname, "..", "public", "texts", "index.json");

const v3Index = JSON.parse(fs.readFileSync(INDEX_SRC, "utf8"));
const textsIndex = JSON.parse(fs.readFileSync(TEXTS_INDEX_SRC, "utf8"));

let updated = 0;
let missing = 0;
const coverageMap = {};

for (const entry of v3Index) {
  const textPath = path.join(TEXTS_V3_DIR, `${entry.id}.json`);
  if (!fs.existsSync(textPath)) {
    missing++;
    entry.hintCoverage = 0;
    coverageMap[entry.id] = 0;
    continue;
  }
  const t = JSON.parse(fs.readFileSync(textPath, "utf8"));
  let total = 0;
  let withHint = 0;
  for (const s of t.sentences || []) {
    for (const tok of s.tokens || []) {
      total++;
      if (tok.hint) withHint++;
    }
  }
  const pct = total > 0 ? Math.round((withHint / total) * 100) : 0;
  entry.hintCoverage = pct;
  coverageMap[entry.id] = pct;
  updated++;
}

// textsIndex (HomeV3 が使う方) にも同期
for (const entry of textsIndex) {
  const key = entry.id || entry.slug;
  entry.hintCoverage = coverageMap[key] ?? 0;
}

fs.writeFileSync(INDEX_SRC, JSON.stringify(v3Index));
fs.writeFileSync(INDEX_PUB, JSON.stringify(v3Index));
fs.writeFileSync(TEXTS_INDEX_SRC, JSON.stringify(textsIndex));
fs.writeFileSync(TEXTS_INDEX_PUB, JSON.stringify(textsIndex));

console.log(`updated ${updated} entries (missing: ${missing})`);
const covered = v3Index.filter((e) => (e.hintCoverage || 0) >= 50).length;
console.log(`>=50% coverage: ${covered}/${v3Index.length}`);
