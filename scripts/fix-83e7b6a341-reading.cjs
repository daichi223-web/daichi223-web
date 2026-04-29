#!/usr/bin/env node
/**
 * 飽かぬ別れ (83e7b6a341) の読解ガイド annotation を sentence ID 再マップ。
 *
 * texts-v3 の本文修正に伴い:
 *  - s11 (重複和歌行) を削除 → annotation s11 (辞世の歌) を s10 にマージ
 *    (s10 originalText に和歌が既に含まれているため)
 *  - s12〜s21 → s11〜s20 にシフト
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', '83e7b6a341.json');
const distFp = path.join(__dirname, '..', 'dist', 'reading', '83e7b6a341.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

const idMap = {
  s1: 's1', s2: 's2', s3: 's3', s4: 's4', s5: 's5',
  s6: 's6', s7: 's7', s8: 's8', s9: 's9',
  s10: 's10', // s10 は維持 (和歌内容を含む)
  s11: 's10', // s11 (辞世の歌 annotation) を s10 にマージ
  s12: 's11',
  s13: 's12',
  s14: 's13',
  s15: 's14',
  s16: 's15',
  s17: 's16',
  s18: 's17',
  s19: 's18',
  s20: 's19',
  s21: 's20',
};

const newAnnotations = [];
const merged = {}; // newId -> annotation

for (const ann of r.annotations) {
  const newId = idMap[ann.sentenceId];
  if (!newId) continue;
  if (merged[newId]) {
    // マージ: 既存 annotation の hints に追加
    // s10 + s11 の場合、s10 の hints に s11 の hints (和歌関連) を追加
    const existing = merged[newId];
    // guide を更新 (両方の内容を統合)
    if (newId === 's10') {
      existing.guide = '呼称が「御息所」→「女」に変化。帝と更衣の愛の関係を際立たせる表現効果に注目。文末に更衣の辞世の歌が始まる。';
    }
    // hints を追加 (重複を避けつつ)
    for (const h of ann.hints) {
      existing.hints.push(h);
    }
  } else {
    const newAnn = { ...ann, sentenceId: newId };
    merged[newId] = newAnn;
    newAnnotations.push(newAnn);
  }
}

r.annotations = newAnnotations;

fs.writeFileSync(fp, JSON.stringify(r, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(r, null, 2), 'utf8');
}

console.log('Reading annotations after remap:');
console.log('  IDs:', r.annotations.map(a => a.sentenceId).join(','));
console.log('  count:', r.annotations.length);
