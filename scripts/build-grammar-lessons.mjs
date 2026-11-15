#!/usr/bin/env node
/**
 * 文法道場「先生と学ぶ」の台本（docs/grammar-lessons/*.md の ```lesson ブロック）を検査し、アプリのデータに書き出す（2026-11-15）。
 *   node scripts/build-grammar-lessons.mjs --check   … 検査だけ（誤りがあれば終了コード 1）
 *   node scripts/build-grammar-lessons.mjs --write   … 検査を通ったら public/grammar-lessons/<id>.json と index.json を書く
 * 台本の形と決まり = docs/grammar-lessons/README.md と F:\A2A\_work\grammar-lessons\BRIEF.md。
 * 検査: JSON が読める・単元が実在・用語は用語集の48語・節の見出し（table / drillHeading）が実在・
 *       drillHeading はその単元のドリルの ref_heading にある・問いの正解が選択肢に1つ・選択肢の重なりなし・miss の鍵が誤答の選択肢・字数。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--write") ? "write" : "check";
const DOCS = join(root, "docs/grammar-lessons");

// 用語集の48語
const glossSrc = readFileSync(join(root, "src/lib/kobun/glossary.ts"), "utf8");
const GLOSS = new Set([...glossSrc.matchAll(/term:\s*"([^"]+)"/g)].map((m) => m[1]));

// ドリル（seed）の ref_heading を単元ごとに
const refs = new Map();
for (const f of readdirSync(join(root, "supabase/seeds")).filter((x) => x.endsWith(".json"))) {
  let d;
  try {
    d = JSON.parse(readFileSync(join(root, "supabase/seeds", f), "utf8"));
  } catch {
    continue;
  }
  for (const r of Array.isArray(d) ? d : d?.drills ?? []) {
    if (!r || typeof r.topic_id !== "string") continue;
    if (!refs.has(r.topic_id)) refs.set(r.topic_id, new Set());
    if (r.ref_heading) refs.get(r.topic_id).add(r.ref_heading);
  }
}

const errors = [];
const warns = [];
const lessons = new Map();
let pending = 0;
const len = (s) => [...(s ?? "")].length;

for (const file of readdirSync(DOCS).filter((f) => f.endsWith(".md") && f !== "README.md").sort()) {
  const md = readFileSync(join(DOCS, file), "utf8").replace(/\r\n/g, "\n");
  pending += (md.match(/〔要確認〕/g) ?? []).length;
  for (const m of md.matchAll(/```lesson\n([\s\S]*?)\n```/g)) {
    const at = `${file}`;
    let L;
    try {
      L = JSON.parse(m[1]);
    } catch (e) {
      errors.push(`${at}: JSON が読めない（${e.message.slice(0, 80)}）`);
      continue;
    }
    const id = L.id;
    const where = `${file} ${id}`;
    let topic;
    try {
      topic = JSON.parse(readFileSync(join(root, "public/grammar", `${id}.json`), "utf8"));
    } catch {
      errors.push(`${where}: public/grammar/${id}.json が無い`);
      continue;
    }
    if (lessons.has(id)) errors.push(`${where}: 同じ単元の台本が2つある`);
    const heads = new Set((topic.sections ?? []).map((s) => s.heading));
    for (const t of L.terms ?? []) if (!GLOSS.has(t)) errors.push(`${where}: 用語「${t}」は用語集に無い`);
    const parts = L.parts ?? [];
    if (parts.length < 2 || parts.length > 5) warns.push(`${where}: parts が ${parts.length}（2〜5）`);
    const keys = new Set();
    for (const p of parts) {
      const pw = `${where} [${p.key}]`;
      if (!/^[a-z0-9-]+$/i.test(p.key ?? "")) errors.push(`${pw}: key は英数字`);
      if (keys.has(p.key)) errors.push(`${pw}: key が重なっている`);
      keys.add(p.key);
      for (const [f, max] of [["title", 14], ["ask", 20], ["known", 20]])
        if (!p[f]) errors.push(`${pw}: ${f} が無い`);
        else if (len(p[f]) > max) warns.push(`${pw}: ${f} が ${len(p[f])} 字（${max} 字まで）`);
      if (!Array.isArray(p.say) || p.say.length === 0) errors.push(`${pw}: say が無い`);
      for (const s of p.say ?? []) {
        if (len(s) > 60) warns.push(`${pw}: say が ${len(s)} 字「${s.slice(0, 20)}…」`);
        if (!/[。？！」）]$/.test(s)) warns.push(`${pw}: say の終わり「${s.slice(-8)}」`);
      }
      if (p.table && !heads.has(p.table)) errors.push(`${pw}: table「${p.table}」は節の見出しに無い`);
      if (p.drillHeading) {
        if (!heads.has(p.drillHeading)) errors.push(`${pw}: drillHeading「${p.drillHeading}」は節の見出しに無い`);
        if (!refs.get(id)?.has(p.drillHeading)) errors.push(`${pw}: drillHeading「${p.drillHeading}」を使うドリルが無い`);
      }
      const checks = p.checks ?? [];
      if (checks.length < 1 || checks.length > 3) warns.push(`${pw}: checks が ${checks.length}（1〜3）`);
      for (const c of checks) {
        const cw = `${pw} 問「${(c.prompt ?? "").slice(0, 16)}」`;
        const ch = c.choices ?? [];
        if (!c.prompt) errors.push(`${cw}: prompt が無い`);
        if (ch.length < 2 || ch.length > 4) errors.push(`${cw}: 選択肢が ${ch.length}（2〜4）`);
        if (new Set(ch).size !== ch.length) errors.push(`${cw}: 選択肢が重なっている`);
        if (!ch.includes(c.answer)) errors.push(`${cw}: 正解が選択肢に無い`);
        if (!c.explain) errors.push(`${cw}: explain が無い`);
        for (const k of Object.keys(c.miss ?? {}))
          if (!ch.includes(k) || k === c.answer) errors.push(`${cw}: miss の「${k}」は誤答の選択肢でない`);
        if (!c.miss || Object.keys(c.miss).length === 0) warns.push(`${cw}: miss が無い`);
      }
    }
    const wrap = L.wrap ?? [];
    if (wrap.length < 2 || wrap.length > 4) warns.push(`${where}: wrap が ${wrap.length}（2〜4）`);
    lessons.set(id, L);
  }
}

// 本番の文法道場にある単元（ドリルがあり、vocab-* でないもの）が全部そろっているか
const expected = [...refs.keys()].filter((id) => !id.startsWith("vocab-")).sort();
const missing = expected.filter((id) => !lessons.has(id));

console.log(`台本 ${lessons.size} 単元・誤り ${errors.length}・注意 ${warns.length}・〔要確認〕 ${pending}`);
if (missing.length) console.log(`台本の無い単元（${missing.length}）: ${missing.join(" ")}`);
for (const e of errors) console.log(`  ✗ ${e}`);
for (const w of warns) console.log(`  △ ${w}`);
if (errors.length) process.exit(1);

if (mode === "write") {
  const out = join(root, "public/grammar-lessons");
  mkdirSync(out, { recursive: true });
  for (const [id, L] of lessons) writeFileSync(join(out, `${id}.json`), JSON.stringify(L, null, 2) + "\n", "utf8");
  writeFileSync(join(out, "index.json"), JSON.stringify([...lessons.keys()].sort(), null, 2) + "\n", "utf8");
  console.log(`public/grammar-lessons/ に ${lessons.size} 単元を書き出しました`);
}
