// ============================================================
// R2 移行後のキルスイッチ：Supabase `grammar-videos` バケットを空にする
//
// 動画は R2 配信に切替済み（dojoData.videoUrl の VIDEO_BASE 既定=R2）。
// Supabase 側のオブジェクトはもう参照されないので、空にして egress を確実にゼロ＋storage回収。
// 動画は R2 とローカル(videos/optimized・narrated)に二重バックアップあり。
//
// 使い方（プロジェクト直下で）:
//   node --env-file=.env.local scripts/grammar-video-supabase-purge.mjs        # ドライラン（一覧のみ）
//   node --env-file=.env.local scripts/grammar-video-supabase-purge.mjs --yes  # 実削除
//
// 必要: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（削除は service role 必須）
// ============================================================

import { createClient } from "@supabase/supabase-js";

const BUCKET = "grammar-videos";
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const doIt = process.argv.includes("--yes");

if (!url) { console.error("✘ SUPABASE_URL 未設定"); process.exit(1); }
if (!key) { console.error("✘ SUPABASE_SERVICE_ROLE_KEY 未設定（--env-file=.env.local で実行）"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: files, error } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
if (error) { console.error("✘ list 失敗:", error.message); process.exit(1); }

const paths = (files ?? []).filter((f) => f.name && !f.id === false).map((f) => f.name);
const mb = (files ?? []).reduce((s, f) => s + (f.metadata?.size ?? 0), 0) / 1048576;
console.log(`バケット ${BUCKET}: ${paths.length} 件 / 約 ${mb.toFixed(1)}MB`);
for (const p of paths) console.log("  - " + p);

if (!doIt) {
  console.log("\n（ドライラン）実削除するには --yes を付けて実行してください。");
  process.exit(0);
}

const { data, error: e2 } = await sb.storage.from(BUCKET).remove(paths);
if (e2) { console.error("✘ remove 失敗:", e2.message); process.exit(1); }
console.log(`\n✓ ${data?.length ?? paths.length} 件削除。Supabase の動画 egress は今後ゼロです。`);
