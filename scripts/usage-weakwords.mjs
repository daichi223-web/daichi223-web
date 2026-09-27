#!/usr/bin/env node
/**
 * 苦手単語の集計（read-only）→ 古典小テスト作成ツールに取り込む JSON。
 *   node --env-file=.env.local scripts/usage-weakwords.mjs [--cohort <名>] [--since YYYY-MM-DD] [--min 10] [--top 150]
 * SELECT のみ。出力に user_id・氏名・学籍などの個人情報は含めない（語ごとの集計値だけ）。
 * 出力: reports/weakwords-<YYYY-MM-DD>.json
 *   {tool:'kobun-tan-weakwords', version:1, made, cohort, since, min, words:[{qid, lemma, meaning, core, example, exampleSrc, n, err, users}]}
 *   err＝誤答率（0〜1）、n＝解答数、users＝解いた人数。n が min 未満の語は除く（少数の偶然を拾わない）。
 * 語の見出し・意味・例文は src/data/kobunQ.v2.slim.json（正本 Excel 由来）のまま。qid は不変。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const COHORT = opt("--cohort", null), SINCE = opt("--since", null), MIN = +opt("--min", 10), TOP = +opt("--top", 150);

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が無い（node --env-file=.env.local で実行）"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, cols, cap = 300000) {
  const out = []; const page = 1000;
  for (let from = 0; from < cap; from += page) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + page - 1);
    if (error) { console.error(`${table}: ${error.message}`); break; }
    out.push(...data); if (data.length < page) break;
  }
  return out;
}

const slim = JSON.parse(readFileSync(join(root, "src/data/kobunQ.v2.slim.json"), "utf8"));
const byQ = new Map(slim.map((q) => [q.qid, q]));
const ws = await fetchAll("word_stats", "user_id,qid,correct,incorrect,last_seen");
let allowed = null;
if (COHORT) {
  const profiles = await fetchAll("profiles", "id,cohort");
  allowed = new Set(profiles.filter((p) => (p.cohort ?? "default") === COHORT).map((p) => p.id));
}
const agg = new Map();
for (const r of ws) {
  if (!byQ.has(r.qid)) continue;                              // 単語の qid だけ（文法ドリルは除く）
  if (allowed && !allowed.has(r.user_id)) continue;
  if (SINCE && String(r.last_seen || "").slice(0, 10) < SINCE) continue;
  const a = agg.get(r.qid) ?? { c: 0, i: 0, users: new Set() };
  a.c += r.correct || 0; a.i += r.incorrect || 0; a.users.add(r.user_id);
  agg.set(r.qid, a);
}
const words = [...agg.entries()]
  .map(([qid, a]) => ({ qid, n: a.c + a.i, err: (a.c + a.i) ? a.i / (a.c + a.i) : 0, users: a.users.size }))
  .filter((w) => w.n >= MIN)
  .sort((x, y) => y.err - x.err || y.n - x.n)
  .slice(0, TOP)
  .map((w) => {
    const q = byQ.get(w.qid), ex = (q.examples || [])[0] || {};
    return { qid: w.qid, lemma: q.lemma, meaning: q.senseNorm ?? q.sense ?? "", core: q.senseCore ?? "", example: ex.jp ?? "", exampleSrc: ex.source ?? "",
      n: w.n, err: Math.round(w.err * 1000) / 1000, users: w.users };
  });
const made = new Date().toISOString().slice(0, 10);
mkdirSync(join(root, "reports"), { recursive: true });
const out = join(root, "reports", `weakwords-${made}.json`);
writeFileSync(out, JSON.stringify({ tool: "kobun-tan-weakwords", version: 1, made, cohort: COHORT, since: SINCE, min: MIN, words }, null, 1));
console.log(`words ${words.length}（解答 ${MIN} 回以上、誤答率の高い順）→ ${out}`);
