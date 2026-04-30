#!/usr/bin/env node
/**
 * 母子の別離 (0a93657296 / 源氏物語 薄雲巻 明石の君と姫君引き渡し) を
 * 正典本文 (新編日本古典文学全集 源氏物語三 / 岩波文庫) と照合し、
 * 構造異変・捏造行・改変を修復する。
 *
 * 検出した差分:
 *  1) s24 が s23 末尾の源氏返歌「生ひそめし根も深ければ武隈の松に小松の千代をならべむ」
 *     を半角左かぎ括弧「｢」付きで重複生成している (token も 1 個の塊で未分節)。
 *     → s23 末尾の和歌を削り、s24 をそのまま和歌の正規 sentence として再構築する。
 *  2) s20 + s21 はもとは「片言の声はいとうつくしうて、袖をとらへて、「乗りたまへ。」
 *     と引くも、いみじうおぼえて、」という一文だが、本文 split で 2 つに割れて
 *     reading.json annotation の sentenceId off-by-1 を生じている (annot s20 が
 *     旧 s20+s21 を一括 guide)。→ 一文に再結合して annotation と一致させる。
 *  3) s30 末尾に文章記号「（）」(空の括弧) が残骸として混入。→ 除去。
 *
 * 実行後、sentence は 31 → 30 になり、reading の annotation も
 * s31 (closing markers) を drop して 31 → 30 に整合する (この作業は別スクリプト
 * fix-0a93657296-reading.cjs で行う)。
 *
 * 既存 hint と learningPoints は保持。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', '0a93657296.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '0a93657296.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── 編集 1: s20 と s21 を再結合 ─────────────────────────────
const s20 = t.sentences.find(s => s.id === 's20');
const s21 = t.sentences.find(s => s.id === 's21');
if (!s20 || !s21) throw new Error('s20 or s21 missing');
const mergedS20 = {
  id: 's20',
  originalText: s20.originalText + s21.originalText,
  modernTranslation: (s20.modernTranslation || '') + (s21.modernTranslation || ''),
  tokens: [...s20.tokens.map(tk => ({ ...tk })), ...s21.tokens.map(tk => ({ ...tk }))],
};

// ── 編集 2: s23 の末尾「「生ひそめし...ならべむ」を切り離して新 s24 に移す ──
const s23 = t.sentences.find(s => s.id === 's23');
const oldS24 = t.sentences.find(s => s.id === 's24');
if (!s23 || !oldS24) throw new Error('s23 or s24 missing');

// s23-t19 (「) 以降が和歌部分。narration 部分は s23-t1..s23-t18 まで。
const narrationTokens = [];
const wakaTokens = [];
for (const tk of s23.tokens) {
  // 末尾の 「、」 (s23-t18) までを narration とする
  // s23-t19 (「) からが和歌。
  const idNum = parseInt(tk.id.split('-t')[1], 10);
  if (idNum <= 18) narrationTokens.push({ ...tk });
  else wakaTokens.push({ ...tk });
}

const newS23 = {
  id: 's23',
  originalText: 'えも言ひやらず、いみじう泣けば、さりや、あな苦し、と思して、',
  // 旧 s23 の modernTranslation はそのまま narration を解説していたので保持
  modernTranslation: s23.modernTranslation,
  tokens: narrationTokens,
};

// 新 s24 = 源氏の返歌 (元 s23 の和歌部分、token 構造を再利用)
const newS24 = {
  id: 's24',
  originalText: '「生ひそめし根も深ければ武隈の松に小松の千代をならべむ',
  // 旧 s24 の modernTranslation (源氏の返歌の訳) を保持
  modernTranslation: oldS24.modernTranslation,
  tokens: wakaTokens,
};

// ── 編集 3: s30 末尾の「（）」を除去 ───────────────────────
const s30 = t.sentences.find(s => s.id === 's30');
if (!s30) throw new Error('s30 missing');
{
  // 末尾 2 トークン (「（」「）」) を削除
  const last = s30.tokens.length;
  const t19 = s30.tokens[last - 2];
  const t20 = s30.tokens[last - 1];
  if (t19?.text !== '（' || t20?.text !== '）') {
    throw new Error(`s30: 末尾 2 token が「（」「）」 ではない: ${JSON.stringify([t19?.text, t20?.text])}`);
  }
  s30.tokens = s30.tokens.slice(0, -2).map(tk => ({ ...tk }));
  s30.originalText = '道すがら、とまりつる人の心苦しさを、いかに罪や得らむと思す。';
}

// ── sentences リストを再構築 ──────────────────────────────
//   旧:  s1..s19, s20, s21, s22, s23, s24(dup), s25..s31
//   新:  s1..s19, mergedS20 (←旧 s20+s21), s21=旧 s22, s22=新 s23 (narration),
//        s23=新 s24 (Genji waka), s24..s30 = 旧 s25..s31
const newSentences = [];
for (const s of t.sentences) {
  if (s.id === 's20') {
    newSentences.push(mergedS20); // 結合 (旧 s20+s21)
  } else if (s.id === 's21') {
    // 旧 s21 はマージ済みなのでスキップ
    continue;
  } else if (s.id === 's22') {
    newSentences.push({ ...s, tokens: s.tokens.map(tk => ({ ...tk })) });
  } else if (s.id === 's23') {
    newSentences.push(newS23);
  } else if (s.id === 's24') {
    newSentences.push(newS24);
  } else {
    newSentences.push({ ...s, tokens: s.tokens.map(tk => ({ ...tk })) });
  }
}

// ── 全 sentence ID を s1..sN に振り直す ────────────────────
const idMap = {};
let counter = 1;
for (const s of newSentences) {
  const oldId = s.id;
  const newId = `s${counter}`;
  idMap[oldId] = newId;
  s.id = newId;
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

// ── 検証 ───────────────────────────────────────────
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
console.log(`Fixed 0a93657296: ${newSentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
console.log('ID map (old → new):');
for (const [old, neu] of Object.entries(idMap)) {
  if (old !== neu) console.log(`  ${old} → ${neu}`);
}
