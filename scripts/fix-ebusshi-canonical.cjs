#!/usr/bin/env node
/**
 * 絵仏師良秀 (31d11bf2f8) を正典本文 (宇治拾遺物語 巻第三第六話) に修正。
 *
 * 修正内容:
 *  s5  「向かひに立てり」→「向かひのつらに立てり」 (のつら 復元)
 *  s7  「人ども来とぶらひける**に**、…笑ひけり。」を分割:
 *       new s7  「人ども来とぶらひけれ**ど**、騒がず。」
 *       new s8  「『いかに。』と人言ひければ、向かひに立ちて、…笑ひけり。」
 *  s11 (旧 s10) 「かくてはおはするぞ」→「かくては立ちたまへるぞ」
 *  s18 (旧 s17) 「百千の家もまた出で来なむ」→「百千の家もいでこなむ」
 *  s21 (旧 s20) 「そののちにぞ」→「そののちにや」
 *
 * 既存の hint と learningPoints は保持。読解ガイド annotation は別スクリプト。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', '31d11bf2f8.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '31d11bf2f8.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── 編集 1: s5 「向かひのつら」復元 ─────────────────────
const s5 = t.sentences.find(s => s.id === 's5');
{
  const idx = s5.tokens.findIndex(tk => tk.text === '、向かひ');
  if (idx === -1) throw new Error('s5: 「、向かひ」 token not found');
  // 旧 s5-t14 「、向かひ」 の後に 「のつら」 トークンを 2 つ挿入
  const inserts = [
    { text: 'の', layer: 3, grammarTag: { pos: '格助詞', meaning: '体修' }, grammarRefId: 'joshi-kaku' },
    { text: 'つら', layer: 0, grammarTag: { pos: '名詞', baseForm: 'つら' } },
  ];
  s5.tokens.splice(idx + 1, 0, ...inserts);
  s5.originalText = 'それも知らず、ただ逃げ出でたるをことにして、向かひのつらに立てり。';
}

// ── 編集 2: s7 を分割して new s7 + new s8 を作る ───────
const s7Orig = t.sentences.find(s => s.id === 's7');
let newS7Tokens = [];
let newS8Tokens = [];
{
  // 旧 s7 tokens を s7-t1 〜 s7-t7 まで残し、それ以降は s8 に移す
  // ただし s7-t6「ける」→「けれ」、s7-t7「に」→「ど」 に置換
  const ks = [];
  for (const tk of s7Orig.tokens) {
    ks.push({ ...tk });
  }
  // s7-t1〜t5: そのまま
  // s7-t6 「ける」→「けれ」
  ks[5].text = 'けれ';
  if (ks[5].grammarTag) ks[5].grammarTag.conjugationForm = '已然形';
  // s7-t7 「に」→「ど」 (接続助詞 逆接)
  ks[6].text = 'ど';
  ks[6].grammarTag = { pos: '接続助詞', meaning: '逆接' };
  delete ks[6].grammarRefId;
  // 既存 hint は 「に」 用だったので削除して新たに「ど」 用 hint を付与
  ks[6].hint = '接続助詞「ど」: 已然形接続で逆接「〜けれども・〜のに」。「とぶらひけれど、騒がず」＝「弔いに来たのに、騒がない」。';

  // ks[0..6] が新 s7 のヘッド (8 tokens 含む)
  // 続けて新 s7 末尾に「、騒がず。」 を追加
  const s7Tail = [
    { text: '、', layer: 0, grammarTag: { pos: '記号' } },
    { text: '騒が', layer: 1, grammarTag: { pos: '動詞', conjugationType: 'ガ四', conjugationForm: '未然形', baseForm: 'さわぐ' }, grammarRefId: 'doushi-katsuyo' },
    { text: 'ず', layer: 2, grammarTag: { pos: '助動詞', conjugationType: '特殊', conjugationForm: '終止形', baseForm: 'ず', meaning: '打消' } },
    { text: '。', layer: 0, grammarTag: { pos: '記号' } },
  ];
  newS7Tokens = [...ks.slice(0, 7), ...s7Tail];

  // 新 s8 のヘッド: 「「いかに。」と人言ひければ、」
  const s8Head = [
    { text: '「', layer: 0, grammarTag: { pos: '記号' } },
    { text: 'いかに', layer: 0, grammarTag: { pos: '副詞', baseForm: 'いかに' }, hint: '副詞「いかに」: 「どのように・どうして・どうしたのか」。ここでは家が燃えているのに動じない良秀に向けて発する驚きの呼びかけ。' },
    { text: '。', layer: 0, grammarTag: { pos: '記号' } },
    { text: '」', layer: 0, grammarTag: { pos: '記号' } },
    { text: 'と', layer: 3, grammarTag: { pos: '格助詞', meaning: '引用' }, grammarRefId: 'joshi-kaku' },
    { text: '人', layer: 0, grammarTag: { pos: '名詞', baseForm: 'ひと' } },
    { text: '言ひ', layer: 1, grammarTag: { pos: '動詞', conjugationType: 'ハ四', conjugationForm: '連用形', baseForm: 'いふ' }, grammarRefId: 'doushi-katsuyo' },
    { text: 'けれ', layer: 2, grammarTag: { pos: '助動詞', conjugationForm: '已然形', baseForm: 'けり', meaning: '過去' } },
    { text: 'ば', layer: 3, grammarTag: { pos: '接続助詞', meaning: '順接確定' } },
  ];
  // s7-t8 以降 (旧 s7-t8 〜 s7-t23) を s8 末尾に追加
  const s7TailKept = ks.slice(7).map(tk => ({ ...tk }));
  newS8Tokens = [...s8Head, ...s7TailKept];
}
// 新 s7 の originalText
const newS7 = {
  id: 's7',
  originalText: '」とて、人ども来とぶらひけれど、騒がず。',
  modernTranslation: '」と言って、人々が見舞いに来たけれども、（良秀は）騒がない。',
  tokens: newS7Tokens,
};
// 新 s8 の originalText
const newS8 = {
  id: 's8',
  originalText: '「いかに。」と人言ひければ、向かひに立ちて、家の焼くるを見て、うちうなづきて、ときどき笑ひけり。',
  modernTranslation: '「どうしたのか。」と人が言ったところ、（良秀は）向かいに立って、家の焼けるのを見て、うなずきうなずき、時々笑った。',
  tokens: newS8Tokens,
};

// ── 編集 3: 旧 s10 「かくてはおはするぞ」→「かくては立ちたまへるぞ」 ──
const s10Orig = t.sentences.find(s => s.id === 's10');
{
  const idx = s10Orig.tokens.findIndex(tk => tk.text === 'おはする');
  if (idx === -1) throw new Error('s10: 「おはする」 not found');
  const oldHint = s10Orig.tokens[idx].hint;
  const inserts = [
    { text: '立ち', layer: 1, grammarTag: { pos: '動詞', conjugationType: 'タ四', conjugationForm: '連用形', baseForm: 'たつ' }, grammarRefId: 'doushi-katsuyo' },
    { text: 'たまへ', layer: 4, grammarTag: { pos: '動詞', conjugationType: 'ハ四', conjugationForm: '已然形', baseForm: 'たまふ', meaning: '尊敬語', honorific: '尊敬' }, grammarRefId: 'doushi-katsuyo', hint: '尊敬の補助動詞「たまふ」: 已然形「たまへ」+ 助動詞「り」(存続)。「立ちたまへる」=「お立ちになっている」。良秀への敬意を示す訪問者の発話。' },
    { text: 'る', layer: 2, grammarTag: { pos: '助動詞', conjugationType: 'ラ変', conjugationForm: '連体形', baseForm: 'り', meaning: '存続' } },
  ];
  s10Orig.tokens.splice(idx, 1, ...inserts);
  s10Orig.originalText = '」と言ふ時に、とぶらひに来たる者ども、「こはいかに、かくては立ちたまへるぞ。';
}

// ── 編集 4: 旧 s17 「百千の家もまた出で来なむ」→「百千の家もいでこなむ」 ──
const s17Orig = t.sentences.find(s => s.id === 's17');
{
  const idxMata = s17Orig.tokens.findIndex(tk => tk.text === 'また');
  if (idxMata === -1) throw new Error('s17: 「また」 not found');
  s17Orig.tokens.splice(idxMata, 1); // remove 「また」

  const idxIdeku = s17Orig.tokens.findIndex(tk => tk.text === '出で来');
  if (idxIdeku === -1) throw new Error('s17: 「出で来」 not found');
  // 「出で来」「な」「む」 を 「いでこ」「なむ」 に再分析
  s17Orig.tokens[idxIdeku] = {
    text: 'いでこ',
    layer: 1,
    grammarTag: { pos: '動詞', conjugationType: 'カ変', conjugationForm: '未然形', baseForm: 'いでく' },
    grammarRefId: 'doushi-katsuyo',
    hint: 'カ変動詞「出で来（いでく）」: 「出てくる・現れる」。未然形「いでこ」に終助詞「なむ」が接続し願望を表す。',
  };
  // 元の「な」「む」 トークンを削除し「なむ」を 1 つ挿入
  s17Orig.tokens.splice(idxIdeku + 1, 2, {
    text: 'なむ',
    layer: 3,
    grammarTag: { pos: '終助詞', meaning: '願望（他者への希望）' },
    hint: '終助詞「なむ」: 未然形接続で「（誰々が）〜してほしい」の願望。「いでこなむ」=「（家々が）出てきてほしい」。',
  });
  s17Orig.originalText = 'この道を立てて世にあらむには、仏だによく書き奉らば、百千の家もいでこなむ。';
}

// ── 編集 5: 旧 s20 「そののちにぞ」→「そののちにや」 ──
const s20Orig = t.sentences.find(s => s.id === 's20');
{
  const idxNi = s20Orig.tokens.findIndex(tk => tk.text === 'に' && tk.grammarTag?.pos === '格助詞');
  if (idxNi !== -1) {
    // 「に」を断定助動詞へ再分析
    s20Orig.tokens[idxNi] = {
      ...s20Orig.tokens[idxNi],
      layer: 2,
      grammarTag: { pos: '助動詞', conjugationType: '形容動詞型', conjugationForm: '連用形', baseForm: 'なり', meaning: '断定' },
    };
  }
  const idxZo = s20Orig.tokens.findIndex(tk => tk.text === 'ぞ');
  if (idxZo === -1) throw new Error('s20: 「ぞ」 not found');
  s20Orig.tokens[idxZo] = {
    ...s20Orig.tokens[idxZo],
    text: 'や',
    grammarTag: { pos: '係助詞', meaning: '疑問・余情' },
    hint: '係助詞「や」: 疑問・余情を表す。「にや」=「〜であろうか」(下に「あらむ」省略の余情形)。「そののちにや」=「その後でだろうか」と語り手の余情を残す結語。',
  };
  s20Orig.originalText = 'そののちにや、良秀がよぢり不動とて、今に人々めで合へり。';
}

// ── 文章リストを再構築 (s7→s7,s8 分割を反映) ─────────
const newSentences = [];
for (const s of t.sentences) {
  if (s.id === 's7') {
    newSentences.push(newS7);
    newSentences.push(newS8);
  } else {
    newSentences.push(s);
  }
}
// renumber id 「s8」 以降のもの
let counter = 1;
const idMap = {};
for (const s of newSentences) {
  const newId = `s${counter}`;
  idMap[s.id] = newId;
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
console.log(`Fixed 31d11bf2f8: ${newSentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
console.log('ID map (old → new):');
for (const [old, neu] of Object.entries(idMap)) {
  if (old !== neu) console.log(`  ${old} → ${neu}`);
}
