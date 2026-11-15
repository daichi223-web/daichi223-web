#!/usr/bin/env node
/**
 * 文法道場のドリルで、どの問いを・何と間違えているか（read-only。2026-11-15。文法の全単元の分析＝docs/grammar-lessons/ の材料）。
 *   node --env-file=.env.local scripts/usage-drill-stumbles.mjs [--since YYYY-MM-DD]
 * SELECT のみ（learning_events の area=grammar・action=answer・target_type=drill）。本番の DB には書かない。
 * 「もう一度」の再出題（ctx.role = retry）は数えない。ctx.mode（無し＝ドリル／lesson／manabinaoshi）で分けても数える。
 * 出力に user_id・氏名・組・番号は含めない。解いた人が 3 人未満・回答が 5 件未満の問いは出さない（個人が特定されないように）。
 * 出力: reports/drill-stumbles-<YYYY-MM-DD>.json （reports/ は gitignore 済）
 *   { made, since, topics: [{ topic, answers, users, wrong, firstWrong }],
 *     drills: [{ id, topic, prompt, answer, answers, users, wrong, firstTry, firstWrong, chosen: {選択肢: 回数}, byMode: {mode: [回答, 誤答]} }] }
 * 問いの文・正解は supabase/seeds/*.json（本番へ入れた元）から引く。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local にありません");
  process.exit(1);
}
const args = process.argv.slice(2);
const sinceArg = args[args.indexOf("--since") + 1];
const since = args.includes("--since") && /^\d{4}-\d{2}-\d{2}$/.test(sinceArg ?? "") ? sinceArg : null;
const MIN_USERS = 3;
const MIN_ANSWERS = 5;

// 問いの文・正解（seed）
const seed = new Map();
for (const f of readdirSync(join(root, "supabase/seeds")).filter((x) => x.endsWith(".json"))) {
  let d;
  try {
    d = JSON.parse(readFileSync(join(root, "supabase/seeds", f), "utf8"));
  } catch {
    continue;
  }
  const rows = Array.isArray(d) ? d : d?.drills ?? [];
  for (const r of rows) if (r && typeof r.topic_id === "string") seed.set(String(r.id), r);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 1000;
const rows = [];
for (let from = 0; ; from += PAGE) {
  let q = sb
    .from("learning_events")
    .select("user_id, at, target_id, correct, chosen, ctx")
    .eq("area", "grammar")
    .eq("action", "answer")
    .eq("target_type", "drill")
    .order("at", { ascending: true })
    .range(from, from + PAGE - 1);
  if (since) q = q.gte("at", new Date(since + "T00:00:00+09:00").toISOString());
  const { data, error } = await q;
  if (error) {
    console.error(`learning_events: ${error.message}`);
    process.exit(1);
  }
  rows.push(...data);
  if (data.length < PAGE) break;
}

const drills = new Map();
const firstSeen = new Set(); // `${user}:${drill}`（その人のその問いの最初の1回）
for (const r of rows) {
  if (r.ctx?.role === "retry") continue;
  const id = r.target_id;
  const s = seed.get(id);
  const topic = s?.topic_id ?? r.ctx?.topic ?? "?";
  let d = drills.get(id);
  if (!d) {
    d = { id, topic, answers: 0, users: new Set(), wrong: 0, firstTry: 0, firstWrong: 0, chosen: {}, byMode: {} };
    drills.set(id, d);
  }
  d.answers++;
  d.users.add(r.user_id);
  const ok = r.correct === true;
  if (!ok) {
    d.wrong++;
    if (r.chosen) d.chosen[r.chosen] = (d.chosen[r.chosen] ?? 0) + 1;
  }
  const k = `${r.user_id}:${id}`;
  if (!firstSeen.has(k)) {
    firstSeen.add(k);
    d.firstTry++;
    if (!ok) d.firstWrong++;
  }
  const mode = r.ctx?.mode ?? "drill";
  const m = (d.byMode[mode] ??= [0, 0]);
  m[0]++;
  if (!ok) m[1]++;
}

const out = [];
const topics = new Map();
for (const d of drills.values()) {
  const users = d.users.size;
  const t = topics.get(d.topic) ?? { topic: d.topic, answers: 0, users: new Set(), wrong: 0, firstWrong: 0 };
  t.answers += d.answers;
  d.users.forEach((u) => t.users.add(u));
  t.wrong += d.wrong;
  t.firstWrong += d.firstWrong;
  topics.set(d.topic, t);
  if (users < MIN_USERS || d.answers < MIN_ANSWERS) continue;
  const s = seed.get(d.id);
  out.push({
    id: d.id, topic: d.topic, prompt: s?.prompt ?? null, context: s?.context ?? null, answer: s?.answer ?? null,
    answers: d.answers, users, wrong: d.wrong, firstTry: d.firstTry, firstWrong: d.firstWrong, chosen: d.chosen, byMode: d.byMode,
  });
}
out.sort((a, b) => a.topic.localeCompare(b.topic) || b.firstWrong / b.firstTry - a.firstWrong / a.firstTry);
const topicOut = [...topics.values()]
  .map((t) => ({ topic: t.topic, answers: t.answers, users: t.users.size, wrong: t.wrong, firstWrong: t.firstWrong }))
  .filter((t) => t.users >= MIN_USERS)
  .sort((a, b) => a.topic.localeCompare(b.topic));

const day = new Date().toISOString().slice(0, 10);
mkdirSync(join(root, "reports"), { recursive: true });
const file = join(root, `reports/drill-stumbles-${day}.json`);
writeFileSync(file, JSON.stringify({ made: new Date().toISOString(), since, minUsers: MIN_USERS, minAnswers: MIN_ANSWERS, topics: topicOut, drills: out }, null, 2), "utf8");
console.log(`回答 ${rows.length} 件・問い ${drills.size}（出力 ${out.length}）・単元 ${topicOut.length}`);
console.log(`${file} を書き出しました`);
