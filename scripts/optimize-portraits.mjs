// ============================================================
// public/portraits/*.png を webp 化（Vercel 配信帯域の削減）
//
// 7〜10MB級の PNG を webp(lossy) にすると概ね 1/10 以下。
// 既に nobleData.ts は一部 .webp を参照しており UI は webp 対応済み。
// 変換後に src/lib/nobleData.ts の '/portraits/*.png' を '*.webp' に差し替える。
//
// 使い方（プロジェクト直下で）:
//   node scripts/optimize-portraits.mjs [quality]
//   quality 省略時 82（チャート系で文字が潰れるなら 90 に上げる）
//
// 必要: ffmpeg が PATH にあること。
// ※ 動画エンコード(grammar-video-optimize.mjs)と同時に走らせないこと（CPU競合）。
// ============================================================

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DIR = "public/portraits";
const quality = process.argv[2] || "82";
const mb = (n) => (n / 1048576).toFixed(2);

const pngs = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".png"));
if (pngs.length === 0) {
  console.error(`✘ png が無い: ${DIR}`);
  process.exit(1);
}

let totalIn = 0;
let totalOut = 0;
for (const png of pngs) {
  const src = join(DIR, png);
  const dst = join(DIR, png.replace(/\.png$/i, ".webp"));
  const inSize = statSync(src).size;
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-i", src, "-c:v", "libwebp", "-quality", quality, "-compression_level", "6", dst],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.log(`✘ ${png}`);
    if (r.stderr) console.error(String(r.stderr).split("\n").slice(-4).join("\n"));
    continue;
  }
  const outSize = statSync(dst).size;
  totalIn += inSize;
  totalOut += outSize;
  console.log(`✓ ${png.padEnd(26)} ${mb(inSize).padStart(6)}MB → ${mb(outSize).padStart(6)}MB`);
}
console.log("────────────────────────");
console.log(`合計 ${mb(totalIn)}MB → ${mb(totalOut)}MB  (${Math.round((1 - totalOut / totalIn) * 100)}% 減)`);
console.log("次: src/lib/nobleData.ts の '/portraits/*.png' を '.webp' に差し替え、元 png は削除可。");
