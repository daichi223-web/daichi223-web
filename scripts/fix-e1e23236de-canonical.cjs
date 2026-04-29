#!/usr/bin/env node
/**
 * 道長、栄華への第一歩 (大鏡 道長伝) e1e23236de を正典本文に修正。
 *
 * 現状の問題:
 *  - s1 が冒頭文の「未パース版（1 token のみ）」として残っており s2 の開始部と内容重複
 *  - s2 が「（世継）﹁」+ 第1文 + 第2文 をまとめて保持している (本来 1文/sentence)
 *  - s2 内 token 14 = 「、帥」, token 16 = 「、河原」 と読点が連結している
 *  - s32 末尾に編集記号 「﹂（）」 が混入
 *  - s33 が 閉じ括弧 + 全角スペース + 「（道長上）」 という編集メタ情報のみ (本文に非ず)
 *
 * 修正:
 *  - s1 を破棄
 *  - 旧 s2 を s1 (祓へ〜出でさせたまへり。) と s2 (平張り〜出でさせたまへる。) に分割
 *  - s2 内 token 14「、帥」を「、」「帥」に分割、token 16「、河原」を「、」「河原」に分割
 *  - s32 末尾の「﹂（）」3 token を破棄
 *  - s33 全体を破棄
 *  - 全 sentence の token id・start/end と sentence id を再採番
 *
 * 既存 hint, learningPoints, modernTranslation は保持。読解ガイドの sentence ID は
 * 元々 s1〜s32 (実コンテンツ) に対応していたので、s33 の annotation だけ別途処理。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', 'e1e23236de.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', 'e1e23236de.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── 旧 s2 の解体 → 新 s1 + 新 s2 ────────────────────────
const oldS2 = t.sentences.find(s => s.id === 's2');
if (!oldS2) throw new Error('old s2 not found');
const ks = oldS2.tokens.map(tk => ({ ...tk }));

// token 14 「、帥」を 「、」「帥」 に分割
{
  const idx = ks.findIndex(tk => tk.text === '、帥');
  if (idx === -1) throw new Error('「、帥」 not found');
  const replacements = [
    { text: '、', layer: 0, grammarTag: { pos: '記号' } },
    { text: '帥', layer: 0, grammarTag: { pos: '名詞', baseForm: '帥' } },
  ];
  ks.splice(idx, 1, ...replacements);
}
// token (旧16, 新17) 「、河原」を 「、」「河原」 に分割
{
  const idx = ks.findIndex(tk => tk.text === '、河原');
  if (idx === -1) throw new Error('「、河原」 not found');
  const replacements = [
    { text: '、', layer: 0, grammarTag: { pos: '記号' } },
    { text: '河原', layer: 0, grammarTag: { pos: '名詞', baseForm: '河原' } },
  ];
  ks.splice(idx, 1, ...replacements);
}

// 「（世継）」「﹁」 (先頭 2 token) を捨てる
const headDropped = ks.slice(2);

// 第 1 文の終わりは最初の「。」
const periodIdx = headDropped.findIndex(tk => tk.text === '。');
if (periodIdx === -1) throw new Error('first 「。」 not found');
const newS1Tokens = headDropped.slice(0, periodIdx + 1);
const newS2Tokens = headDropped.slice(periodIdx + 1);

const newS1 = {
  id: 's1',
  originalText: '三月巳の日の祓へに、やがて逍遥したまふとて、帥殿、河原にさるべき人々あまた具して出でさせたまへり。',
  modernTranslation: oldS2.modernTranslation || t.sentences[0].modernTranslation,
  tokens: newS1Tokens,
};
const newS2 = {
  id: 's2',
  originalText: '平張りどもあまたうちわたしたるおはし所に、入道殿も出でさせたまへる。',
  modernTranslation: '（河原に張りめぐらした）平張り（の幔幕）がたくさん張り渡してあるご座所に、入道殿（＝道長）もいらっしゃっていた。',
  tokens: newS2Tokens,
};

// ── s32 末尾「﹂（）」を除去 ─────────────────────────────
const oldS32 = t.sentences.find(s => s.id === 's32');
if (!oldS32) throw new Error('s32 not found');
{
  const dropFrom = oldS32.tokens.findIndex(tk => tk.text === '﹂');
  if (dropFrom === -1) throw new Error('「﹂」 not found in s32');
  oldS32.tokens = oldS32.tokens.slice(0, dropFrom);
  oldS32.originalText = oldS32.originalText.replace(/﹂[（()）]+$/, '');
}

// ── 新 sentence 配列を構築 ──────────────────────────────
// 旧 s1 を破棄、旧 s2 を newS1+newS2 に置換、旧 s33 を破棄
const newSentences = [];
for (const s of t.sentences) {
  if (s.id === 's1') continue; // drop duplicated header
  if (s.id === 's33') continue; // drop trailing junk
  if (s.id === 's2') {
    newSentences.push(newS1);
    newSentences.push(newS2);
    continue;
  }
  newSentences.push(s);
}

// ── id と token の renumber/start-end 再計算 ────────────
let counter = 1;
const idMap = {};
for (const s of newSentences) {
  const newId = `s${counter}`;
  idMap[s.id] = newId;
  s.id = newId;
  counter++;
}

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

// ── 検証 ───────────────────────────────────────────────
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
console.log(`Fixed e1e23236de: ${newSentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
console.log('ID map (old → new):');
for (const [old, neu] of Object.entries(idMap)) {
  if (old !== neu) console.log(`  ${old} → ${neu}`);
}
