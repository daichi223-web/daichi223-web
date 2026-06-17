// ============================================================
// 助動詞例文集の本番投入（grammar_jodoshi_meanings / grammar_reibun を全置換）
//
// service_role キーで REST 経由 delete→insert する。SQL を手で貼らずに適用できる。
// 行データは build-reibun-seed.mjs の buildRows() を共用（SQL seed と同一ソース）。
//
// 使い方:
//   node --env-file=.env.local scripts/apply-reibun.mjs            # 本番適用
//   node --env-file=.env.local scripts/apply-reibun.mjs --dry-run  # 件数だけ確認
//   node --env-file=.env.local scripts/apply-reibun.mjs path/to/_all_sets.json
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { buildRows, DEFAULT_SRC } from "./build-reibun-seed.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✘ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定。`--env-file=.env.local` を付けて実行してください。");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const srcArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const src = srcArg || DEFAULT_SRC;

const { meanings, reibun, setCount } = buildRows(src);
const quizN = reibun.filter((r) => r.is_quiz).length;
console.log(`ソース: ${src}`);
console.log(`意味セット ${meanings.length}（${setCount}）/ 例文 ${reibun.length}（出題 is_quiz=${quizN}）`);
console.log(`接続先: ${url}`);

if (dryRun) {
  console.log("— dry-run のため DB へは書き込みません。");
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function die(label, error) {
  if (error) {
    console.error(`✘ ${label}:`, error.message || error);
    process.exit(1);
  }
}

async function insertBatched(table, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await sb.from(table).insert(chunk);
    die(`insert ${table} [${i}..${i + chunk.length}]`, error);
    process.stdout.write(`  ${table}: ${Math.min(i + size, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write("\n");
}

// 全置換：子(grammar_reibun)→親(grammar_jodoshi_meanings)の順で delete、逆順で insert。
// PostgREST の delete はフィルタ必須のため、必ず真になる条件で全件指定。
console.log("→ 既存行を削除…");
die("delete grammar_reibun", (await sb.from("grammar_reibun").delete().neq("id", "__none__")).error);
die("delete grammar_jodoshi_meanings", (await sb.from("grammar_jodoshi_meanings").delete().neq("meaning_key", "__none__")).error);

console.log("→ grammar_jodoshi_meanings を投入…");
await insertBatched("grammar_jodoshi_meanings", meanings);

console.log("→ grammar_reibun を投入…");
await insertBatched("grammar_reibun", reibun);

// 検証：件数を読み戻す
const { count: mCount, error: mErr } = await sb
  .from("grammar_jodoshi_meanings")
  .select("*", { count: "exact", head: true });
die("count grammar_jodoshi_meanings", mErr);
const { count: rCount, error: rErr } = await sb
  .from("grammar_reibun")
  .select("*", { count: "exact", head: true });
die("count grammar_reibun", rErr);

console.log(`✅ 完了: grammar_jodoshi_meanings=${mCount} / grammar_reibun=${rCount}`);
if (mCount !== meanings.length || rCount !== reibun.length) {
  console.error(`⚠ 件数不一致（期待 ${meanings.length}/${reibun.length}）。ダッシュボードで確認してください。`);
  process.exit(1);
}
