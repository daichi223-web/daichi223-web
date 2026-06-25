// ============================================================
// 文法道場・講義動画の軽量化（再エンコード）
//
// 目的: Cached Egress 削減。faststart 付与（preload の無駄取り）＋
//       過剰だった音声(~320kbps)をナレーション向けに圧縮(mono 80k)＋
//       最大720pに統一(CRF26)。低モーションの板書/スライド動画は
//       これで体感劣化なく概ね半減する。
//
// 使い方（プロジェクト直下で）:
//   node scripts/grammar-video-optimize.mjs [入力ディレクトリ] [出力ディレクトリ]
//   省略時: videos/narrated → videos/optimized
//
// 1本だけ試す:
//   node scripts/grammar-video-optimize.mjs videos/narrated videos/optimized keigo.mp4
//
// 必要: ffmpeg / ffprobe が PATH にあること。
// 出力後は scripts/grammar-video-r2.mjs で R2 にアップロードする。
// ============================================================

import { readdirSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";

const inDir = process.argv[2] || "videos/narrated";
const outDir = process.argv[3] || "videos/optimized";
const only = process.argv[4]; // 任意: 1ファイル名だけ処理

if (!existsSync(inDir)) {
  console.error(`✘ 入力ディレクトリが無い: ${inDir}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const mb = (n) => (n / 1048576).toFixed(1);
const files = readdirSync(inDir)
  .filter((f) => f.toLowerCase().endsWith(".mp4"))
  .filter((f) => !only || f === only);

if (files.length === 0) {
  console.error(`✘ 対象 mp4 が無い: ${inDir}${only ? ` (${only})` : ""}`);
  process.exit(1);
}

let totalIn = 0;
let totalOut = 0;
const rows = [];

for (const f of files) {
  const src = join(inDir, f);
  const dst = join(outDir, basename(f));
  const inSize = statSync(src).size;

  // 幅が1280超のときだけ 1280 に縮小（360p等は拡大しない）。-2 で高さは偶数自動。
  // ※ scale 内にカンマを書くと ffmpeg がフィルタ区切りと誤読するため ffprobe で分岐。
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width", "-of", "csv=p=0", src,
  ], { encoding: "utf8" });
  const width = parseInt(String(probe.stdout).trim(), 10) || 0;

  const args = [
    "-y",
    "-i", src,
    "-c:v", "libx264",
    "-crf", "26",
    "-preset", "medium",
    ...(width > 1280 ? ["-vf", "scale=1280:-2"] : []),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ac", "1",
    "-b:a", "80k",
    "-movflags", "+faststart",
    dst,
  ];

  process.stdout.write(`↻ ${f} (${mb(inSize)}MB, ${width || "?"}px) … `);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.log("✘ 失敗");
    if (r.error) console.error("  spawn error:", r.error.code || r.error.message);
    if (r.stderr) console.error(String(r.stderr).split("\n").slice(-6).join("\n"));
    continue;
  }
  const outSize = statSync(dst).size;
  totalIn += inSize;
  totalOut += outSize;
  rows.push({ f, inSize, outSize });
  console.log(`✓ ${mb(outSize)}MB (${Math.round((1 - outSize / inSize) * 100)}% 減)`);
}

console.log("\n──────── まとめ ────────");
for (const { f, inSize, outSize } of rows) {
  console.log(`  ${f.padEnd(28)} ${mb(inSize).padStart(6)}MB → ${mb(outSize).padStart(6)}MB`);
}
console.log("────────────────────────");
console.log(`合計 ${mb(totalIn)}MB → ${mb(totalOut)}MB  (${Math.round((1 - totalOut / totalIn) * 100)}% 減)`);
console.log(`出力先: ${outDir}/`);
