#!/usr/bin/env node
/**
 * 記述回答（answers 表・question_type=writing）の read-only 集計。
 *   node --env-file=.env.local scripts/_writing-stats-readonly.mjs <出力フォルダ>
 * SELECT のみ。uid / anonId は取得しない。結果は UTF-8 のファイルに書く。
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local にありません");
  process.exit(1);
}
const outDir = process.argv[2];
if (!outDir) { console.error("出力フォルダを指定してください"); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const sb = createClient(url, key, { auth: { persistSession: false } });

// ---------- 読み出し（uid / anonId を含む raw 全体は取らず、必要なキーだけ） ----------
const rows = [];
const page = 1000;
for (let from = 0; from < 200000; from += page) {
  const { data, error } = await sb
    .from("answers")
    .select("qid, answer_norm, created_at, answerRaw:raw->>answerRaw, auto:raw->auto, manual, final")
    .eq("question_type", "writing")
    .order("created_at", { ascending: true })
    .range(from, from + page - 1);
  if (error) { console.error(`answers: ${error.message}`); process.exit(1); }
  rows.push(...data);
  if (data.length < page) break;
}

// ---------- 正解データ ----------
const words = JSON.parse(fs.readFileSync("src/data/kobunQ.v2.slim.json", "utf8"));
const byQid = new Map(words.map((w) => [w.qid, w]));
const byLemma = new Map();
for (const w of words) {
  if (!byLemma.has(w.lemma)) byLemma.set(w.lemma, []);
  byLemma.get(w.lemma).push(w);
}

const norm = (s) =>
  (s ?? "").normalize("NFKC").replace(/[〔〕（）()「」『』"'\s、。,.・〜~…]/g, "");
// 活用語尾のゆれを吸収する粗い語幹（3文字以上で末尾がひらがななら1文字落とす）
const stem = (s) => (s.length >= 3 && /[ぁ-ん]$/.test(s) ? s.slice(0, -1) : s);
const brackets = (s) => [...(s ?? "").matchAll(/〔\s*(.+?)\s*〕/g)].map((m) => m[1]);

function variants(w) {
  const v = new Set();
  for (const p of (w.senseNorm ?? "").split(/[・／/]/)) v.add(norm(p));
  for (const b of brackets(w.sense)) v.add(norm(b));
  for (const ex of w.examples ?? []) for (const b of brackets(ex.translation)) v.add(norm(b));
  v.delete("");
  return [...v];
}
function trapVariants(w) {
  const v = new Set();
  const m = w.trap?.modern ?? "";
  for (const p of m.split(/[・／/（）()]/)) v.add(norm(p));
  v.delete("");
  return [...v];
}
const hit = (a, vs) => vs.some((x) => x === a || (stem(x).length >= 2 && stem(x) === stem(a)));

function classify(qid, answerRaw) {
  const w = byQid.get(qid);
  if (!w) return "qid不明";
  const a = norm(answerRaw);
  if (!a) return "空";
  const t = hit(a, variants(w));
  const sib = (byLemma.get(w.lemma) ?? []).filter((x) => x.qid !== qid);
  const s = sib.some((x) => hit(a, variants(x)));
  const tr = hit(a, trapVariants(w));
  if (t && s) return "正解かつ別義（意味が重なる）";
  if (t) return "正解";
  if (s) return "別義";
  if (tr) return "現代語の罠";
  return "未決";
}

// ---------- 集計 ----------
const inc = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : "0.0");
const table = (m, total) =>
  [...m.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `| ${k} | ${v} | ${pct(v, total)}% |`).join("\n");

const N = rows.length;
const byMonth = new Map(), byScore = new Map(), byClass = new Map(), bySource = new Map();
const autoXmanual = new Map(), classXauto = new Map(), classXmanual = new Map();
const lens = [];
const pending = new Map(); // 未決のユニーク表現
const uniq = new Set();
const out = [];

for (const r of rows) {
  const score = r.auto?.score ?? 0;
  const autoOK = score >= 60 ? "自動○" : "自動×";
  const manual = r.manual?.result ?? null;
  const cls = classify(r.qid, r.answerRaw);
  inc(byMonth, (r.created_at ?? "").slice(0, 7));
  inc(byScore, String(score));
  inc(byClass, cls);
  inc(bySource, r.final?.source ?? "なし");
  inc(classXauto, `${cls} × ${autoOK}`);
  if (manual) {
    inc(autoXmanual, `${autoOK} → 自己判定${manual}`);
    inc(classXmanual, `${cls} → 自己判定${manual}`);
  }
  lens.push(norm(r.answerRaw).length);
  uniq.add(`${r.qid}::${r.answer_norm}`);
  if (cls === "未決") {
    const k = `${r.qid}::${norm(r.answerRaw)}`;
    const p = pending.get(k) ?? { qid: r.qid, ans: r.answerRaw, n: 0, autoOK: 0, manOK: 0, manNG: 0 };
    p.n++; if (score >= 60) p.autoOK++;
    if (manual === "OK") p.manOK++; if (manual === "NG") p.manNG++;
    pending.set(k, p);
  }
  out.push({ qid: r.qid, month: (r.created_at ?? "").slice(0, 7), answer: r.answerRaw, score, reason: r.auto?.reason ?? "", manual, source: r.final?.source ?? null, final: r.final?.result ?? null, cls });
}
lens.sort((a, b) => a - b);
const manualN = rows.filter((r) => r.manual?.result).length;
const pendN = byClass.get("未決") ?? 0;

const md = [];
md.push(`# 記述回答の集計（read-only）`, ``);
md.push(`- 記述回答 総数: ${N}`);
md.push(`- 出題された qid: ${new Set(rows.map((r) => r.qid)).size} / 740`);
md.push(`- ユニークな (qid, 回答): ${uniq.size}`);
md.push(`- 回答の長さ（正規化後）: 中央値 ${lens[lens.length >> 1] ?? 0} / 90% ${lens[Math.floor(lens.length * 0.9)] ?? 0} / 最大 ${lens[lens.length - 1] ?? 0}`);
md.push(`- 自己判定あり: ${manualN}（${pct(manualN, N)}%）`, ``);
md.push(`## 月別`, `| 月 | 件 | 割合 |`, `|---|---|---|`, table(byMonth, N), ``);
md.push(`## 自動採点の点数分布`, `| 点 | 件 | 割合 |`, `|---|---|---|`, table(byScore, N), ``);
md.push(`## 最終判定の出どころ（final.source）`, `| source | 件 | 割合 |`, `|---|---|---|`, table(bySource, N), ``);
md.push(`## 自動判定 × 自己判定（自己判定のあった ${manualN} 件）`, `| 組合せ | 件 | 割合 |`, `|---|---|---|`, table(autoXmanual, manualN), ``);
md.push(`## 1段目の照合だけでの分類（新仕様の試算）`, `| 分類 | 件 | 割合 |`, `|---|---|---|`, table(byClass, N), ``);
md.push(`## 1段目の分類 × 現行の自動判定`, `| 組合せ | 件 | 割合 |`, `|---|---|---|`, table(classXauto, N), ``);
md.push(`## 1段目の分類 × 自己判定`, `| 組合せ | 件 | 割合 |`, `|---|---|---|`, table(classXmanual, manualN), ``);
md.push(`## 未決の回答（${pendN} 件・ユニーク ${pending.size}）頻度上位 80`, `| qid | 語 | 正解(senseNorm) | 回答 | 件 | 自動○ | 自己○ | 自己× |`, `|---|---|---|---|---|---|---|---|`);
for (const p of [...pending.values()].sort((a, b) => b.n - a.n).slice(0, 80)) {
  const w = byQid.get(p.qid);
  md.push(`| ${p.qid} | ${w?.lemma ?? ""} | ${w?.senseNorm ?? ""} | ${String(p.ans).replace(/\|/g, "／").slice(0, 40)} | ${p.n} | ${p.autoOK} | ${p.manOK} | ${p.manNG} |`);
}

fs.writeFileSync(path.join(outDir, "writing-stats.md"), md.join("\n"), "utf8");
fs.writeFileSync(path.join(outDir, "writing-rows.jsonl"), out.map((o) => JSON.stringify(o)).join("\n"), "utf8");
console.log(`done rows=${N} -> ${outDir}`);
