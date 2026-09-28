#!/usr/bin/env node
/**
 * 苦手単語の集計（read-only）→ 古典小テスト作成ツールに取り込む JSON。
 *   node --env-file=.env.local scripts/usage-weakwords.mjs [--since YYYY-MM-DD] [--min 10] [--top 150] [--minUsers 5]
 * SELECT のみ。出力に user_id・氏名・組・番号などの個人情報は含めない（まとまりごと・語ごとの集計値だけ）。
 * まとまり（groups）：全体／学校ごと／学校×学年ごと。学年はプロフィール（暗号化）を PII_ENCRYPTION_KEY で復号して読み、出力には書かない。
 *   解いた人が minUsers 人未満のまとまりは出さない（個人が特定されないように）。
 * 出力: reports/weakwords-<YYYY-MM-DD>.json
 *   {tool:'kobun-tan-weakwords', version:2, made, since, min, groups:[{key, label, school, grade, users, words:[{qid, lemma, meaning, core, example, exampleSrc, n, err}]}]}
 * 語の見出し・意味・例文は src/data/kobunQ.v2.slim.json（正本 Excel 由来）のまま。qid は不変。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SINCE = opt("--since", null), MIN = +opt("--min", 10), TOP = +opt("--top", 150), MINUSERS = +opt("--minUsers", 5);

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

/* 学校名（src/lib/schools.ts の SCHOOL_CODES）と学年（暗号化プロフィール）。usage-report.mjs と同じ読み方 */
const schoolNames = {};
try {
  const src = readFileSync(join(root, "src/lib/schools.ts"), "utf8");
  const block = src.match(/SCHOOL_CODES[^{]*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  for (const m of block.matchAll(/^\s*['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*'([^']+)'/gm)) schoolNames[m[1]] = m[2];
} catch { /* noop */ }
const { webcrypto } = await import("node:crypto");
const hex = process.env.PII_ENCRYPTION_KEY;
const piiKey = hex && /^[0-9a-fA-F]{64}$/.test(hex) ? await webcrypto.subtle.importKey("raw", Buffer.from(hex, "hex"), "AES-GCM", false, ["decrypt"]) : null;
async function gradeOf(b64) {
  if (!piiKey || !b64) return null;
  try { const buf = Buffer.from(b64, "base64"); const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, piiKey, buf.subarray(12));
    const g = JSON.parse(new TextDecoder().decode(plain)).grade; return g == null ? null : String(g); } catch { return null; }
}

const slim = JSON.parse(readFileSync(join(root, "src/data/kobunQ.v2.slim.json"), "utf8"));
const byQ = new Map(slim.map((q) => [q.qid, q]));
const [ws, profiles] = await Promise.all([fetchAll("word_stats", "user_id,qid,correct,incorrect,last_seen"), fetchAll("profiles", "id,profile_enc,cohort")]);
if (!piiKey) console.error("PII_ENCRYPTION_KEY が無いので学年ごとのまとまりは作らない（全体・学校ごとだけ）");
const who = new Map();   // user_id -> {school, grade}（メモリの中だけ。出力しない）
for (const p of profiles) who.set(p.id, { school: schoolNames[p.cohort ?? "default"] ?? p.cohort ?? "default", grade: await gradeOf(p.profile_enc) });

const groups = new Map();   // key -> {label, school, grade, users:Set, agg:Map}
const add = (key, label, school, grade, uid, r) => {
  const g = groups.get(key) ?? { label, school, grade, users: new Set(), agg: new Map() };
  g.users.add(uid);
  const a = g.agg.get(r.qid) ?? { c: 0, i: 0, users: new Set() };
  a.c += r.correct || 0; a.i += r.incorrect || 0; a.users.add(uid); g.agg.set(r.qid, a);
  groups.set(key, g);
};
for (const r of ws) {
  if (!byQ.has(r.qid)) continue;                              // 単語の qid だけ
  if (SINCE && String(r.last_seen || "").slice(0, 10) < SINCE) continue;
  const w = who.get(r.user_id) ?? { school: "（未登録）", grade: null };
  add("all", "全体", null, null, r.user_id, r);
  add(`s:${w.school}`, `${w.school}（全学年）`, w.school, null, r.user_id, r);
  if (w.grade) add(`s:${w.school}:g:${w.grade}`, `${w.school} ${w.grade}年`, w.school, w.grade, r.user_id, r);
}
const out = [];
for (const [key, g] of groups) {
  if (g.users.size < MINUSERS) continue;
  const words = [...g.agg.entries()]
    .map(([qid, a]) => ({ qid, n: a.c + a.i, err: (a.c + a.i) ? a.i / (a.c + a.i) : 0, users: a.users.size }))
    .filter((w) => w.n >= MIN).sort((x, y) => y.err - x.err || y.n - x.n).slice(0, TOP)
    .map((w) => { const q = byQ.get(w.qid), ex = (q.examples || [])[0] || {};
      return { qid: w.qid, lemma: q.lemma, meaning: q.senseNorm ?? q.sense ?? "", core: q.senseCore ?? "", example: ex.jp ?? "", exampleSrc: ex.source ?? "", n: w.n, err: Math.round(w.err * 1000) / 1000 }; });
  if (words.length) out.push({ key, label: g.label, school: g.school, grade: g.grade, users: g.users.size, words });
}
out.sort((a, b) => (a.key === "all" ? -1 : b.key === "all" ? 1 : a.key.localeCompare(b.key, "ja")));
const made = new Date().toISOString().slice(0, 10);
mkdirSync(join(root, "reports"), { recursive: true });
const file = join(root, "reports", `weakwords-${made}.json`);
writeFileSync(file, JSON.stringify({ tool: "kobun-tan-weakwords", version: 2, made, since: SINCE, min: MIN, groups: out }, null, 1));
console.log(out.map((g) => `${g.label}：${g.users}人・${g.words.length}語`).join("\n") + `\n→ ${file}`);
