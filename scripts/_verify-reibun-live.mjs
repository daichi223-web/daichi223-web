// 読み取り専用：本番DBの grammar_reibun / grammar_jodoshi_meanings を
// ソース(_all_sets.json の buildRows)と突き合わせて検証する。書き込みなし。
//   node --env-file=.env.local scripts/_verify-reibun-live.mjs
import { createClient } from "@supabase/supabase-js";
import { buildRows, DEFAULT_SRC } from "./build-reibun-seed.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✘ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// --- ソース側 ---
const { meanings, reibun } = buildRows(DEFAULT_SRC);
const srcMu = meanings.filter((m) => m.jodoshi === "む");
const srcMuReibun = reibun.filter((r) => srcMu.some((m) => m.meaning_key === r.meaning_key));
console.log(`接続先: ${url}`);
console.log(`[ソース] 意味 ${meanings.length} / 例文 ${reibun.length} ｜ む意味 ${srcMu.length} / む例文 ${srcMuReibun.length}`);
console.log(`[ソース] む意味内訳: ${srcMu.map((m) => `${m.meaning_key}=${m.meaning}`).join(" / ")}`);

// --- 本番DB側 ---
const { count: liveReibun, error: e1 } = await sb
  .from("grammar_reibun").select("*", { count: "exact", head: true });
const { count: liveMeanings, error: e2 } = await sb
  .from("grammar_jodoshi_meanings").select("*", { count: "exact", head: true });
const { data: muRows, error: e3 } = await sb
  .from("grammar_jodoshi_meanings").select("meaning_key,meaning").eq("jodoshi", "む").order("meaning_key");
if (e1 || e2 || e3) { console.error("DBエラー", e1 || e2 || e3); process.exit(1); }

console.log(`[本番DB] 意味 ${liveMeanings} / 例文 ${liveReibun} ｜ む意味 ${muRows.length}`);
console.log(`[本番DB] む意味内訳: ${muRows.map((r) => `${r.meaning_key}=${r.meaning}`).join(" / ")}`);

// む例文の本番件数
const muKeys = muRows.map((r) => r.meaning_key);
let liveMuReibun = 0;
if (muKeys.length) {
  const { count } = await sb.from("grammar_reibun")
    .select("*", { count: "exact", head: true }).in("meaning_key", muKeys);
  liveMuReibun = count;
}
console.log(`[本番DB] む例文 ${liveMuReibun}`);

const ok = liveReibun === reibun.length && liveMeanings === meanings.length
  && muRows.length === srcMu.length && liveMuReibun === srcMuReibun.length;
console.log(ok ? "✔ ソースと本番DBは一致" : "✘ 不一致あり（要再適用）");
