// ============================================================
// 文法道場・講義動画を Cloudflare R2 へアップロード
//
// grammar_media.storage_path（= "<topicId>.mp4"）をそのまま R2 のキーに使うので、
// フロントは VITE_VIDEO_BASE_URL を R2 の公開URLに向けるだけで切替わる（DB変更不要）。
// 長期キャッシュ＆ faststart 済み前提で immutable cache-control を付与。
//
// 事前準備:
//   1) Cloudflare で R2 バケット作成（例: kobun-grammar-videos）
//   2) 認証: `npx wrangler login`  もしくは 環境変数
//        CLOUDFLARE_API_TOKEN（R2 編集権限）/ CLOUDFLARE_ACCOUNT_ID
//
// 使い方（プロジェクト直下で）:
//   node scripts/grammar-video-r2.mjs <bucket> [入力ディレクトリ]
//   省略時の入力ディレクトリ: videos/optimized
//
// 例:
//   node scripts/grammar-video-r2.mjs kobun-grammar-videos
// ============================================================

import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const bucket = process.argv[2];
const inDir = process.argv[3] || "videos/optimized";

if (!bucket) {
  console.error('✘ 使い方: node scripts/grammar-video-r2.mjs <bucket> [入力ディレクトリ]');
  process.exit(1);
}
if (!existsSync(inDir)) {
  console.error(`✘ 入力ディレクトリが無い: ${inDir}（先に grammar-video-optimize.mjs を実行）`);
  process.exit(1);
}

const files = readdirSync(inDir).filter((f) => f.toLowerCase().endsWith(".mp4"));
if (files.length === 0) {
  console.error(`✘ アップロード対象 mp4 が無い: ${inDir}`);
  process.exit(1);
}

const mb = (n) => (n / 1048576).toFixed(1);
let ok = 0;

for (const key of files) {
  const path = join(inDir, key);
  console.log(`↑ ${key} (${mb(statSync(path).size)}MB) → r2://${bucket}/${key}`);
  // shell 経由でコマンド文字列を渡す。Windows では spawnSync("npx.cmd", [...], {shell:false})
  // が .cmd を起動できず無言で失敗するため、shell:true ＋ 引用符付き文字列にする。
  const cmd =
    `npx --yes wrangler r2 object put "${bucket}/${key}" ` +
    `--file "${path}" --content-type video/mp4 ` +
    `--cache-control "public, max-age=31536000, immutable" --remote`;
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status === 0) ok++;
  else console.error(`  ✘ ${key} 失敗（認証/権限/バケット名を確認）`);
}

console.log(`\n✓ ${ok}/${files.length} 本アップロード完了`);
console.log("次: バケットに公開アクセス（r2.dev 開発URL or カスタムドメイン）を設定し、");
console.log("    その公開URLを Vercel の環境変数 VITE_VIDEO_BASE_URL に入れて再デプロイ。");
