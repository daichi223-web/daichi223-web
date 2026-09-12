#!/usr/bin/env node
/**
 * kobun-tan 利用状況ダッシュボードの生成（read-only）。
 *   node --env-file=.env.local scripts/usage-report.mjs
 * SELECT のみ。user_id は集計にだけ使い、生の値は出力しない（HTML には先頭 8 桁だけ埋め込む。reports/ は gitignore 済）。
 * 出力: reports/usage-dashboard.html （行データを埋め込んだ単一 HTML。期間指定・個別生徒はブラウザ側で集計）
 *       reports/usage-<YYYY-MM-DD>.json （全期間の集計値。個人別の一覧は含めない）
 * 集計ロジックは scripts/usage-aggregate.js（node とブラウザで共用）。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate } from "./usage-aggregate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local にありません");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

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
/** ISO 日時 → JST の "YYYY-MM-DD"（word_stats は UTC で保存されているので +9h） */
const jstDay = (iso) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : "");
const today = jstDay(new Date().toISOString());

// ---- 語彙・文法の見出し解決 -------------------------------------------------
const slim = JSON.parse(readFileSync(join(root, "src/data/kobunQ.v2.slim.json"), "utf8"));
const wordLabels = Object.fromEntries(slim.map((q) => [q.qid, `${q.lemma}（${q.senseNorm ?? q.sense ?? ""}）`]));

console.error("fetching...");
const ws = await fetchAll("word_stats", "user_id,qid,correct,incorrect,last_seen,created_at");
const srs = await fetchAll("srs_state", "user_id,qid,box,next_review,last_review");
const drills = await fetchAll("grammar_drills", "id,topic_id,prompt");
const prog = await fetchAll("grammar_topic_progress", "user_id,topic_id,drill_total,drill_correct,mastery_pct,updated_at");
const pubs = await fetchAll("text_publications", "slug,cohort,published");
const profiles = await fetchAll("profiles", "id,profile_enc,cohort");

// ---- プロフィール（暗号化）の復号：PII_ENCRYPTION_KEY が .env.local にある時だけ --------
// 復号した個人情報は HTML（reports/、gitignore 済）にだけ入る。JSON には入れない。
const { webcrypto } = await import("node:crypto");
async function loadPiiKey() {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return webcrypto.subtle.importKey("raw", Buffer.from(hex, "hex"), "AES-GCM", false, ["decrypt"]);
}
async function decryptPii(b64, key) {
  try {
    const buf = Buffer.from(b64, "base64");
    const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, key, buf.subarray(12));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { return null; }
}
// 学校コード（KU=県立浦和 / UW=浦和西）は src/lib/schools.ts の SCHOOL_CODES から拾う（無ければ cohort 名のまま）
const schoolNames = {};
try {
  const src = readFileSync(join(root, "src/lib/schools.ts"), "utf8");
  const block = src.match(/SCHOOL_CODES[^{]*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  for (const m of block.matchAll(/^\s*['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*'([^']+)'/gm)) schoolNames[m[1]] = m[2];
} catch { /* noop */ }
const piiKey = await loadPiiKey();
if (profiles.length && !piiKey) console.error("PII_ENCRYPTION_KEY が無いので、学校以外の個人情報は表示しません");
const identity = new Map(); // user_id -> {school, grade, cls, num}（メールは持たない：識別は年・組・番号だけ）
let decryptFailed = 0;
for (const p of profiles) {
  const ident = { school: schoolNames[p.cohort ?? "default"] ?? p.cohort ?? "default" };
  if (piiKey) {
    const plain = await decryptPii(p.profile_enc, piiKey);
    if (plain) {
      ident.grade = plain.grade ?? null; ident.cls = plain.class ?? null; ident.num = plain.number ?? null;
    } else decryptFailed++;
  }
  identity.set(p.id, ident);
}
if (decryptFailed) console.error(`復号できないプロフィール ${decryptFailed} 件（鍵違い？）`);

// ---- 匿名 ID → index（HTML には先頭 8 桁＋登録済みなら学校コード・年・組・番号） ---
const uidx = new Map();
const users = [];
const seen = new Set();
const uOf = (uid) => {
  if (uidx.has(uid)) return uidx.get(uid);
  let short = uid.slice(0, 8);
  while (seen.has(short)) short = uid.slice(0, short.length + 4); // 衝突時は延長
  seen.add(short);
  uidx.set(uid, users.length);
  users.push({ id: short, ...(identity.get(uid) ?? {}) });
  return users.length - 1;
};
for (const p of profiles) uOf(p.id); // 登録済みだが学習記録のない人も一覧に出す

const D = {
  generatedAt: new Date().toISOString(),
  today,
  users,
  ws: ws.map((r) => [uOf(r.user_id), r.qid, r.correct ?? 0, r.incorrect ?? 0, jstDay(r.last_seen), jstDay(r.created_at)]),
  srs: srs.map((r) => [uOf(r.user_id), r.qid, r.box ?? 0, jstDay(r.next_review), jstDay(r.last_review)]),
  prog: prog.map((r) => [uOf(r.user_id), r.topic_id, r.drill_total ?? 0, r.drill_correct ?? 0, r.mastery_pct ?? 0, jstDay(r.updated_at)]),
  wordLabels,
  drillLabels: Object.fromEntries(drills.map((d) => [d.id, d.prompt])),
  drillTopics: Object.fromEntries(drills.map((d) => [d.id, d.topic_id])),
  wordTotal: slim.length,
  drillTotal: drills.length,
  topicTotal: new Set(drills.map((d) => d.topic_id)).size,
  registered: profiles.length,
  piiDecrypted: !!piiKey,
  schools: [...new Set(profiles.map((p) => schoolNames[p.cohort ?? "default"] ?? p.cohort ?? "default"))].sort(),
  publications: null,
};

// ---- publications -----------------------------------------------------------
const cohorts = new Map();
for (const p of pubs) {
  const c = cohorts.get(p.cohort ?? "(none)") ?? { pub: 0, unpub: 0 };
  if (p.published) c.pub++; else c.unpub++;
  cohorts.set(p.cohort ?? "(none)", c);
}
let pubTitles = [];
try {
  const idx = JSON.parse(readFileSync(join(root, "src/data/textsV3Index.json"), "utf8"));
  const set = new Set(pubs.filter((p) => p.published).map((p) => p.slug));
  pubTitles = idx.filter((t) => set.has(t.id)).map((t) => ({ title: t.title, source: t.source }));
} catch { /* noop */ }
D.publications = { cohorts: [...cohorts.entries()].map(([c, o]) => ({ cohort: c, pub: o.pub, unpub: o.unpub })), titles: pubTitles };

// ---- 全期間の集計（JSON 用。個人別一覧は落とす） -----------------------------
const { people, ...agg } = aggregate(D, null, null, today);
const data = { generatedAt: D.generatedAt, today, ...agg, publications: D.publications };

mkdirSync(join(root, "reports"), { recursive: true });
writeFileSync(join(root, `reports/usage-${today}.json`), JSON.stringify(data, null, 2), "utf8");

const aggSrc = readFileSync(join(root, "scripts/usage-aggregate.js"), "utf8").replace(/^export .*$/m, "");
const tpl = readFileSync(join(root, "scripts/usage-dashboard.template.html"), "utf8");
writeFileSync(
  join(root, "reports/usage-dashboard.html"),
  tpl.replace("/*__DATA__*/null", JSON.stringify(D)).replace("/*__AGG__*/", aggSrc),
  "utf8",
);
console.log(`reports/usage-${today}.json と reports/usage-dashboard.html を書き出しました（${users.length} 人・word_stats ${ws.length} 行）`);
