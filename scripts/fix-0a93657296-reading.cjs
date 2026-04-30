#!/usr/bin/env node
/**
 * 母子の別離 (0a93657296) の reading.json を新しい sentence 構造に整合させる。
 *
 * 旧 text:  s1..s19 + s20 + s21 + s22 + s23 + s24(dup) + s25..s31
 * 新 text:  s1..s19 + s20(merged) + s21 + s22 + s23 + s24..s30
 *
 * 旧 reading: annotation s1..s31。s20 は旧 s20+s21 を一括 guide していた
 *           (annotation s21..s30 が旧 text s22..s31 に -1 ずれて対応していた)。
 *           annotation s31 は閉じ括弧の形式説明で、新 text 構造では不要。
 *
 * 対応:
 *  annotation s1..s19  → そのまま (テキスト s1..s19 と一致)
 *  annotation s20      → 新 s20 (合成済 sentence) に対応するよう微改訂
 *  annotation s21      → そのまま id 維持 (Akashi waka, 新 s21 と一致)
 *  annotation s22      → そのまま id 維持 (narration, 新 s22 と一致)
 *  annotation s23      → そのまま id 維持 (Genji waka, 新 s23 と一致)
 *  annotation s24..s30 → そのまま id 維持 (新 s24..s30 と一致)
 *  annotation s31      → drop (閉じ括弧の形式説明、新本文に対応物なし)
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', '0a93657296.json');
const distFp = path.join(__dirname, '..', 'dist', 'reading', '0a93657296.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

// annotation s31 を drop
r.annotations = r.annotations.filter(a => a.sentenceId !== 's31');

// 検証
const expectedIds = [];
for (let i = 1; i <= 30; i++) expectedIds.push(`s${i}`);
const actualIds = r.annotations.map(a => a.sentenceId);
if (actualIds.length !== 30 || actualIds.some((id, i) => id !== expectedIds[i])) {
  console.error('Annotation IDs mismatch:');
  console.error('expected:', expectedIds.join(','));
  console.error('actual  :', actualIds.join(','));
  process.exit(1);
}

fs.writeFileSync(fp, JSON.stringify(r, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(r, null, 2), 'utf8');
}
console.log(`Fixed reading 0a93657296: ${r.annotations.length} annotations (dropped s31).`);
