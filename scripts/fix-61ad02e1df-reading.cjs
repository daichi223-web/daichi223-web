#!/usr/bin/env node
/**
 * 雲林院にて (61ad02e1df) reading sentence ID 再マップ。
 * fix-61ad02e1df-canonical.cjs で重複6文 (s2/s8/s15/s20/s23/s26) を削除し
 * 残り 28 文を s1〜s28 に再採番した。reading の annotation も同じマップで更新する。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', '61ad02e1df.json');
const distFp = path.join(__dirname, '..', 'dist', 'reading', '61ad02e1df.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

// 旧 → 新 ID 写像 (重複削除分は除外)
const dropIds = new Set(['s2', 's8', 's15', 's20', 's23', 's26']);
const allOldIds = [];
for (let i = 1; i <= 34; i++) allOldIds.push('s' + i);
const oldToNew = {};
let counter = 1;
for (const oid of allOldIds) {
  if (!dropIds.has(oid)) {
    oldToNew[oid] = 's' + counter++;
  }
}

const before = r.annotations.length;
r.annotations = r.annotations
  .filter(a => !dropIds.has(a.sentenceId))
  .map(a => ({ ...a, sentenceId: oldToNew[a.sentenceId] || a.sentenceId }));

console.log('Before:', before, 'After:', r.annotations.length);
console.log('IDs:', r.annotations.map(a => a.sentenceId).join(','));

fs.writeFileSync(fp, JSON.stringify(r, null, 2), 'utf8');
fs.mkdirSync(path.dirname(distFp), { recursive: true });
fs.writeFileSync(distFp, JSON.stringify(r, null, 2), 'utf8');
console.log('wrote:', fp, '+', distFp);
