#!/usr/bin/env node
/**
 * 飽かぬ別れ (83e7b6a341, 源氏物語・桐壺巻) を正典本文に修正。
 *
 * 修正内容:
 *  1. s11 の重複行 "｢限りとて別るる道の悲しきにいかまほしきは命なりけり" を削除
 *     (s10 末尾に既に同じ和歌「限りとて〜命なりけり」が含まれており重複)
 *  2. s18 末尾の余分な「（）」(空括弧) を削除
 *  3. 後続 sentence (s12〜s21) を s11〜s20 に renumber
 *  4. token id を再採番
 *
 * 既存の hint と learningPoints, modernTranslation は保持。
 * 読解ガイド annotation は別スクリプトで sentence ID 再マップ。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', '83e7b6a341.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '83e7b6a341.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── 編集 1: s11 (重複和歌行) を削除 ──────────────────
// s10 originalText 末尾に既に「限りとて...命なりけり」が含まれているため s11 は重複
// ── 編集 2: s18 末尾の「（）」を削除 ──────────────────
const s18 = t.sentences.find(s => s.id === 's18');
if (!s18) throw new Error('s18 not found');
{
  // 末尾 2 トークン (（、）) を削除
  const lastIdx = s18.tokens.length - 1;
  const t14 = s18.tokens[lastIdx - 1];
  const t15 = s18.tokens[lastIdx];
  if (t14.text !== '（' || t15.text !== '）') {
    throw new Error('s18: expected trailing （） tokens, got: ' + t14.text + ' ' + t15.text);
  }
  s18.tokens.splice(lastIdx - 1, 2);
  s18.originalText = '聞こしめす御心まどひ、何ごとも思しめしわかれず、籠もりおはします。';
}

// ── 文章リスト再構築: s11 を除外 ─────────────────────
const newSentences = [];
const idMap = {};
let counter = 1;
for (const s of t.sentences) {
  if (s.id === 's11') {
    // 重複行 — drop
    idMap[s.id] = null;
    continue;
  }
  const newId = `s${counter}`;
  idMap[s.id] = newId;
  s.id = newId;
  newSentences.push(s);
  counter++;
}

// 各 sentence 内 token を renumber + start/end 再計算
for (const s of newSentences) {
  let pos = 0;
  s.tokens = s.tokens.map((tk, i) => {
    const newTk = {
      ...tk,
      id: `${s.id}-t${i + 1}`,
      start: pos,
      end: pos + tk.text.length,
    };
    pos += tk.text.length;
    return newTk;
  });
}

// 検証
let allOk = true;
for (const s of newSentences) {
  const concat = s.tokens.map(tk => tk.text).join('');
  if (concat !== s.originalText) {
    console.error(`MISMATCH ${s.id}:`);
    console.error(`  orig:    [${s.originalText}]`);
    console.error(`  joined:  [${concat}]`);
    allOk = false;
  }
}
if (!allOk) {
  console.error('Validation failed. Not writing.');
  process.exit(1);
}

t.sentences = newSentences;
fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');
}

const totalTokens = newSentences.reduce((n, s) => n + s.tokens.length, 0);
const totalHints = newSentences.flatMap(s => s.tokens).filter(tk => tk.hint).length;
console.log(`Fixed 83e7b6a341: ${newSentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
console.log('ID map (old → new):');
for (const [old, neu] of Object.entries(idMap)) {
  if (old !== neu) console.log(`  ${old} → ${neu || '[DELETED]'}`);
}
