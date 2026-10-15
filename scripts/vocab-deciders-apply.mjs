#!/usr/bin/env node
// 単語の「理由」（decider）を検証して public/analysis/<id>.json に合流させる。
//   node scripts/vocab-deciders-apply.mjs <textId> <input.json>          … 検証だけ（書かない）
//   node scripts/vocab-deciders-apply.mjs <textId> <input.json> --write  … 検証を通ったら書く（既存の decider・reasoning は保持）
// input.json = { "deciders": { "<tokenId>": { "meaning", "type", "summary", "cues": [{ "text", "type", "note" }] } }, "flags": [...] }
import fs from "node:fs";
import path from "node:path";

const [textId, inPath, ...rest] = process.argv.slice(2);
const write = rest.includes("--write");
if (!textId || !inPath) { console.error("usage: node scripts/vocab-deciders-apply.mjs <textId> <input.json> [--write]"); process.exit(1); }
const root = process.cwd();
const text = JSON.parse(fs.readFileSync(path.join(root, "public/texts-v3", `${textId}.json`), "utf8"));
const input = JSON.parse(fs.readFileSync(inPath, "utf8"));
const TYPES = new Set(["後接", "呼応", "形", "主語", "文脈"]);
const tokens = new Map();
for (const s of text.sentences) for (const t of s.tokens ?? []) tokens.set(t.id, { t, s });

const errors = [];
const count = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const entries = Object.entries(input.deciders ?? {});
for (const [tid, d] of entries) {
  const hit = tokens.get(tid);
  if (!hit) { errors.push(`${tid}: 教材にこの語がない`); continue; }
  const pos = hit.t.grammarTag?.pos ?? "";
  if (pos === "助動詞" || /助詞$/.test(pos)) errors.push(`${tid}: 助詞・助動詞は対象外（既存の決め手を使う）`);
  if (!d || typeof d !== "object") { errors.push(`${tid}: 形式が違う`); continue; }
  if (!d.meaning || !String(d.meaning).trim()) errors.push(`${tid}: meaning が空`);
  if (!TYPES.has(d.type)) errors.push(`${tid}: type「${d.type}」は 後接/呼応/形/主語/文脈 のどれかに`);
  const len = String(d.summary ?? "").trim().length;
  if (len < 30 || len > 120) errors.push(`${tid}: summary の長さ ${len} 字（30〜120 字に）`);
  if (d.cues !== undefined && !Array.isArray(d.cues)) errors.push(`${tid}: cues は配列に`);
  for (const [i, c] of (Array.isArray(d.cues) ? d.cues : []).entries()) {
    if (!TYPES.has(c.type)) errors.push(`${tid} cue${i}: type が不正`);
    if (!c.note || !String(c.note).trim()) errors.push(`${tid} cue${i}: note が空`);
    if (c.text) {
      const n = count(hit.s.originalText, c.text);
      if (n === 0) errors.push(`${tid} cue${i}: 「${c.text}」は本文に無い`);
      else if (n > 1) errors.push(`${tid} cue${i}: 「${c.text}」は本文に ${n} 回出る（1回だけの語にするか text を空に）`);
    }
  }
}
console.log(`${text.title}: 入力 ${entries.length} 語　不備 ${errors.length}　要確認(flags) ${(input.flags ?? []).length}`);
for (const e of errors) console.log("  ✗ " + e);
if (errors.length) process.exit(1);
if (!write) { console.log("（--write を付けると書き込みます）"); process.exit(0); }

const outPath = path.join(root, "public/analysis", `${textId}.json`);
let existing = { textId, tokenAnalyses: [] };
try { existing = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { /* 新規 */ }
const byId = new Map((existing.tokenAnalyses ?? []).map((a) => [a.tokenId, a]));
let added = 0, replaced = 0;
for (const [tid, d] of entries) {
  const cur = byId.get(tid) ?? { tokenId: tid };
  if (cur.decider) replaced++; else added++;
  cur.decider = { meaning: String(d.meaning).trim(), type: d.type, summary: String(d.summary).trim(), cues: (d.cues ?? []).map((c) => ({ text: c.text ?? "", type: c.type, note: String(c.note).trim() })) };
  byId.set(tid, cur);
}
// 教材の語順に並べる
const order = new Map([...tokens.keys()].map((id, i) => [id, i]));
const merged = { ...existing, textId, tokenAnalyses: [...byId.values()].sort((a, b) => (order.get(a.tokenId) ?? 1e9) - (order.get(b.tokenId) ?? 1e9)) };
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
console.log(`書き込み: ${outPath}（追加 ${added}・置換 ${replaced}）`);
