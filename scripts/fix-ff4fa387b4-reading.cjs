#!/usr/bin/env node
/**
 * 倭建命 (ff4fa387b4) 読解ガイド: 削除された sentence (旧 s7, s32) と
 * 再採番後に存在しない ID (旧 s36, s37 → 新では sentence 数 35 まで) を整理。
 *
 * 旧 ID (37 sentences) → 新 ID (35 sentences) のマッピング:
 *   旧 s1   → 新 s1
 *   旧 s2..s6 → 新 s2..s6
 *   旧 s7   → DROP (s6 末尾と重複していた重複文)
 *   旧 s8..s31 → 新 s7..s30
 *   旧 s32  → DROP (s31 後半と重複していた重複文)
 *   旧 s33..s37 → 新 s31..s35
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', 'ff4fa387b4.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

// 旧 ID → 新 ID のマッピング
function remap(oldId) {
  const m = oldId.match(/^s(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n === 7) return null; // DROP
  if (n === 32) return null; // DROP
  if (n <= 6) return 's' + n;
  if (n <= 31) return 's' + (n - 1);
  if (n <= 37) return 's' + (n - 2);
  return null;
}

const newAnnotations = [];
const dropped = [];
for (const a of r.annotations) {
  const newId = remap(a.sentenceId);
  if (!newId) {
    dropped.push(a.sentenceId);
    continue;
  }
  newAnnotations.push({ ...a, sentenceId: newId });
}

r.annotations = newAnnotations;

console.log('dropped annotations:', dropped);
console.log('new annotation count:', r.annotations.length);
console.log('new annotation IDs:', r.annotations.map(a => a.sentenceId).join(','));

fs.writeFileSync(fp, JSON.stringify(r, null, 2), 'utf8');
console.log(`Wrote: ${fp}`);
