#!/usr/bin/env node
/**
 * 若紫の君 fd3012c216 — 読解 annotation の sentence ID 再マップ。
 * canonical fix で削除/統合されたものに対応:
 *   旧 s4 (｢何事ぞや。 単独捏造文) → 削除 (s5 に統合)
 *   旧 s49 ((若紫巻) 出典ラベル) → 削除
 *   旧 s50 (源氏は…藤壺は皇子を産んだ AI 要約) → 削除
 *   旧 s51 (尼君を亡くした…AI 要約) → 削除
 * 旧 s5..s48 → 新 s4..s47 に -1 シフト。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', 'fd3012c216.json');
const distFp = path.join(__dirname, '..', 'dist', 'reading', 'fd3012c216.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

const dropOldIds = new Set(['s4', 's49', 's50', 's51']);
const idMap = {};
for (let i = 1; i <= 48; i++) idMap[`s${i}`] = `s${i}`; // identity start
// 旧 s4 削除 → 旧 s5..s48 → 新 s4..s47 に -1
for (let i = 5; i <= 48; i++) idMap[`s${i}`] = `s${i - 1}`;
// 旧 s49/s50/s51 は削除なのでマップ自体せず drop
for (const id of dropOldIds) delete idMap[id];

const newAnnotations = [];
for (const a of r.annotations) {
  if (dropOldIds.has(a.sentenceId)) continue;
  const newId = idMap[a.sentenceId];
  if (!newId) {
    console.warn(`unknown sentenceId ${a.sentenceId}, skip`);
    continue;
  }
  newAnnotations.push({ ...a, sentenceId: newId });
}

r.annotations = newAnnotations;

fs.writeFileSync(fp, JSON.stringify(r, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(r, null, 2), 'utf8');
}

console.log(`Fixed reading: ${r.annotations.length} annotations`);
console.log('IDs:', r.annotations.map((a) => a.sentenceId).join(','));
