#!/usr/bin/env node
/**
 * Supabase 利用実態の read-only 集計。
 *   node --env-file=.env.local scripts/_stats-readonly.mjs
 * SELECT のみ。user_id は集計にだけ使い、値は出力しない。
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local にありません");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function count(table, filter) {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) return `ERR ${error.message}`;
  return c ?? 0;
}

async function fetchAll(table, cols, cap = 200000) {
  const rows = [];
  const page = 1000;
  for (let from = 0; from < cap; from += page) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + page - 1);
    if (error) { console.error(`${table}: ${error.message}`); break; }
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

console.log("## テーブル行数");
for (const t of ["word_stats", "srs_state", "answers", "candidates", "overrides", "text_publications", "grammar_drills", "grammar_topic_progress", "grammar_reibun"]) {
  console.log(`- ${t}: ${await count(t)}`);
}

// ---------- word_stats ----------
console.log("\n## word_stats（単語クイズの記録）");
const ws = await fetchAll("word_stats", "user_id,qid,correct,incorrect,last_seen,created_at");
const users = new Map();
let totalAns = 0, totalCorrect = 0;
const byMonth = new Map();
const byQid = new Map();
for (const r of ws) {
  const n = (r.correct ?? 0) + (r.incorrect ?? 0);
  totalAns += n; totalCorrect += r.correct ?? 0;
  const u = users.get(r.user_id) ?? { rows: 0, ans: 0, first: r.created_at, last: r.last_seen };
  u.rows++; u.ans += n;
  if (r.created_at < u.first) u.first = r.created_at;
  if (r.last_seen > u.last) u.last = r.last_seen;
  users.set(r.user_id, u);
  const m = (r.last_seen ?? "").slice(0, 7);
  byMonth.set(m, (byMonth.get(m) ?? 0) + n);
  const q = byQid.get(r.qid) ?? { c: 0, i: 0, u: 0 };
  q.c += r.correct ?? 0; q.i += r.incorrect ?? 0; q.u++;
  byQid.set(r.qid, q);
}
console.log(`- 利用者（user_id 種類）: ${users.size}`);
console.log(`- 出題された語(qid): ${byQid.size} / 741`);
console.log(`- 回答総数: ${totalAns}（正答 ${pct(totalCorrect, totalAns)}%）`);
const ansPerUser = [...users.values()].map((u) => u.ans).sort((a, b) => b - a);
console.log(`- 1人あたり回答数: 中央値 ${median(ansPerUser)} / 上位5 ${ansPerUser.slice(0, 5).join(",")} / 10回以下の人 ${ansPerUser.filter((x) => x <= 10).length}人`);
const anonUsers = [...users.keys()].filter((k) => String(k).startsWith("anon_")).length;
console.log(`- anon_ で始まる user_id: ${anonUsers} / ${users.size}`);
console.log("- 月別回答数（last_seen 基準）:");
for (const [m, n] of [...byMonth.entries()].sort()) console.log(`    ${m}: ${n}`);
const lastActive = [...users.values()].map((u) => (u.last ?? "").slice(0, 10)).sort();
console.log(`- 最終活動日の分布: 最古 ${lastActive[0]} / 最新 ${lastActive[lastActive.length - 1]}`);
const recent30 = lastActive.filter((d) => d >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).length;
console.log(`- 直近30日に活動した人: ${recent30}`);

console.log("\n### 誤答率の高い qid（回答15件以上）上位20");
const hard = [...byQid.entries()].filter(([, q]) => q.c + q.i >= 15)
  .map(([qid, q]) => ({ qid, n: q.c + q.i, err: pct(q.i, q.c + q.i), users: q.u }))
  .sort((a, b) => b.err - a.err).slice(0, 20);
for (const h of hard) console.log(`    ${h.qid}\t誤答${h.err}%\t${h.n}回\t${h.users}人`);

console.log("\n### 出題回数の多い qid 上位10");
const freq = [...byQid.entries()].map(([qid, q]) => ({ qid, n: q.c + q.i })).sort((a, b) => b.n - a.n).slice(0, 10);
console.log("    " + freq.map((f) => `${f.qid}(${f.n})`).join(" "));

// group 帯（qid の前半＝単語帳番号）ごとの回答量
const byGroup = new Map();
for (const [qid, q] of byQid) {
  const g = parseInt(qid.split("-")[0], 10);
  const band = isNaN(g) ? "?" : `${Math.floor((g - 1) / 50) * 50 + 1}-${Math.floor((g - 1) / 50) * 50 + 50}`;
  byGroup.set(band, (byGroup.get(band) ?? 0) + q.c + q.i);
}
console.log("\n### 番号帯ごとの回答数");
for (const [b, n] of [...byGroup.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) console.log(`    ${b}: ${n}`);

// ---------- srs_state ----------
console.log("\n## srs_state（Leitner 箱）");
const srs = await fetchAll("srs_state", "user_id,qid,box,next_review,last_review");
const boxDist = [0, 0, 0, 0, 0, 0];
let due = 0; const now = new Date().toISOString();
const srsUsers = new Set();
for (const r of srs) { boxDist[r.box ?? 0]++; if ((r.next_review ?? "") <= now) due++; srsUsers.add(r.user_id); }
console.log(`- 行数 ${srs.length} / 利用者 ${srsUsers.size}`);
console.log(`- 箱分布 1:${boxDist[1]} 2:${boxDist[2]} 3:${boxDist[3]} 4:${boxDist[4]} 5:${boxDist[5]}`);
console.log(`- 期限到来（復習待ち）: ${due}（${pct(due, srs.length)}%）`);

// ---------- answers / candidates ----------
console.log("\n## 記述回答");
const cand = await fetchAll("candidates", "qid,freq,proposed_role");
const candQids = new Set(cand.map((c) => c.qid));
const roleDist = {};
for (const c of cand) roleDist[c.proposed_role ?? "null"] = (roleDist[c.proposed_role ?? "null"] ?? 0) + 1;
console.log(`- candidates: ${cand.length} 行 / ${candQids.size} qid / 役割 ${JSON.stringify(roleDist)}`);

// ---------- text_publications ----------
console.log("\n## text_publications（教材の公開）");
const pubs = await fetchAll("text_publications", "*");
const cohorts = new Map();
for (const p of pubs) {
  const c = p.cohort ?? "(none)";
  const o = cohorts.get(c) ?? { pub: 0, unpub: 0, slugs: [] };
  if (p.published) { o.pub++; o.slugs.push(p.slug); } else o.unpub++;
  cohorts.set(c, o);
}
for (const [c, o] of cohorts) console.log(`- cohort=${c}: 公開 ${o.pub} / 非公開 ${o.unpub}`);
const pubSlugs = new Set(pubs.filter((p) => p.published).map((p) => p.slug));
try {
  const { readFileSync } = await import("node:fs");
  const idx = JSON.parse(readFileSync("src/data/textsV3Index.json", "utf8"));
  const titles = idx.filter((t) => pubSlugs.has(t.id)).map((t) => `${t.title}(${t.source})`);
  console.log(`- 公開中の教材 ${titles.length} 本: ${titles.join("、")}`);
} catch { /* noop */ }

// ---------- grammar ----------
console.log("\n## 文法道場");
const drills = await fetchAll("grammar_drills", "topic_id,kind");
const byTopic = new Map();
for (const d of drills) byTopic.set(d.topic_id, (byTopic.get(d.topic_id) ?? 0) + 1);
const vocabTopics = [...byTopic.entries()].filter(([t]) => t.startsWith("vocab"));
console.log(`- topic 数 ${byTopic.size} / 問題数 ${drills.length}`);
console.log(`- vocab-* topic: ${vocabTopics.length ? vocabTopics.map(([t, n]) => `${t}(${n})`).join(" ") : "なし"}`);
const prog = await fetchAll("grammar_topic_progress", "*");
if (prog.length) {
  const cols = Object.keys(prog[0]).filter((k) => k !== "user_id");
  console.log(`- grammar_topic_progress: ${prog.length} 行 / 列 ${cols.join(",")}`);
  const pu = new Set(prog.map((p) => p.user_id));
  const pt = new Map();
  for (const p of prog) pt.set(p.topic_id, (pt.get(p.topic_id) ?? 0) + 1);
  console.log(`- 利用者 ${pu.size} / 触れられた topic 上位: ${[...pt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `${t}(${n})`).join(" ")}`);
} else {
  console.log("- grammar_topic_progress: 0 行");
}
