#!/usr/bin/env node
/**
 * kobun-tan 「単語と教材」の利用状況（read-only）。教員画面の「単語と教材」表示と同じ DB 関数 usage_by_area を呼ぶ。
 *   node --env-file=.env.local scripts/usage-areas.mjs [from YYYY-MM-DD] [to YYYY-MM-DD]
 * 日付は JST で両端を含む。省略すると記録の全期間。
 * 出力: reports/usage-areas-<from>_<to>.json （集計値のみ。生徒別は匿名 ID の先頭 8 桁に置き換える。reports/ は gitignore 済）
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local にありません");
  process.exit(1);
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const [from, to] = process.argv.slice(2).map((s) => (DAY.test(s ?? "") ? s : null));
/** JST の日付の 0 時を UTC の ISO に直す（shift 日ずらす） */
const jstStartIso = (day, shift = 0) =>
  new Date(new Date(day + "T00:00:00Z").getTime() + shift * 864e5 - 9 * 3600e3).toISOString();

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb.rpc("usage_by_area", {
  p_from: from ? jstStartIso(from) : null,
  p_to: to ? jstStartIso(to, 1) : null,
});
if (error) {
  console.error(`usage_by_area: ${error.message}`);
  process.exit(1);
}

const titles = Object.fromEntries(
  JSON.parse(readFileSync(join(root, "src/data/textsV3Index.json"), "utf8")).map((t) => [t.id, t.title]),
);
for (const t of data.texts) t.title = titles[t.slug] ?? "";
data.people = data.people.map(({ uid, ...rest }) => ({ id: uid.slice(0, 8), ...rest }));

const label = { vocab: "単語", text: "教材", grammar: "文法" };
console.log(`期間 ${from ?? "…"} 〜 ${to ?? "…"}・${data.events} 件`);
for (const a of data.areas) {
  const rate = a.answers ? `・回答 ${a.answers}（正答率 ${Math.round((a.correct / a.answers) * 1000) / 10}%）` : "";
  console.log(`  ${label[a.area] ?? a.area}: ${a.users} 人・起動 ${a.sessions}・操作 ${a.events}${rate}`);
}
const o = data.overlap;
console.log(`  重なり: 単語だけ ${o.vocabOnly}・教材だけ ${o.textOnly}・両方 ${o.both}（全 ${o.all} 人）`);

mkdirSync(join(root, "reports"), { recursive: true });
const out = join(root, `reports/usage-areas-${from ?? "start"}_${to ?? "now"}.json`);
writeFileSync(out, JSON.stringify(data, null, 2), "utf8");
console.log(`${out} を書き出しました`);
