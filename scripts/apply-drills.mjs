// ============================================================
// 文法道場・ドリル投入（grammar_drills へ upsert）
//
// service_role キーで REST 経由 upsert するため、ダッシュボードへの
// 貼り付け不要。JSON 配列ファイルを渡すと、その topic 群を入れ替える。
//
// 使い方:
//   node --env-file=.env.local scripts/apply-drills.mjs supabase/seeds/<batch>.json
//
// JSON 形式（1要素 = 1ドリル）:
//   { "id","topic_id","kind","prompt","context"|null,"choices":[...],
//     "answer":"..."|[...],"explanation","ref_heading","sort" }
//
// 同梱 topic は事前に delete してから insert（再実行可能）。
// ============================================================

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✘ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定。`--env-file=.env.local` を付けて実行してください。");
  process.exit(1);
}
const file = process.argv[2];
if (!file) {
  console.error("✘ 使い方: node --env-file=.env.local scripts/apply-drills.mjs <jsonファイル>");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const rows = JSON.parse(await readFile(file, "utf-8"));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("✘ JSON は1件以上のドリル配列である必要があります。");
  process.exit(1);
}

// 簡易バリデーション
const REQUIRED = ["id", "topic_id", "kind", "prompt", "choices", "answer", "explanation"];
for (const r of rows) {
  for (const f of REQUIRED) {
    if (r[f] === undefined) { console.error(`✘ 必須フィールド欠落 (${f}):`, r.id ?? "(id不明)"); process.exit(1); }
  }
}

const topics = [...new Set(rows.map((r) => r.topic_id))];
console.log(`対象 topic: ${topics.join(", ")}（${rows.length}問）`);

const del = await sb.from("grammar_drills").delete().in("topic_id", topics);
if (del.error) { console.error("✘ delete失敗:", del.error.message); process.exit(1); }

const ins = await sb.from("grammar_drills").insert(rows);
if (ins.error) { console.error("✘ insert失敗:", ins.error.message); process.exit(1); }

// 検証
const { data, error } = await sb
  .from("grammar_drills")
  .select("topic_id")
  .in("topic_id", topics);
if (error) { console.error("✘ 検証失敗:", error.message); process.exit(1); }
const counts = {};
for (const r of data) counts[r.topic_id] = (counts[r.topic_id] ?? 0) + 1;
console.log("✓ 投入完了:");
for (const t of topics.sort()) console.log(`   ${String(counts[t] ?? 0).padStart(2)}  ${t}`);
