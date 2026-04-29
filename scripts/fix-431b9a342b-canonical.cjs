#!/usr/bin/env node
/**
 * 落窪の君（落窪物語 巻一冒頭）(431b9a342b) を正典本文に修正。
 *
 * 検出された本文の異変:
 *  1. s13 の末尾に「若くめでたき人は…縫ふままに、」(28 tokens) が含まれているが、
 *     その後 s14 「若くめでたき人は…少なかりけむ。」(1-token blob) と
 *     s15 「あなづりやすくて…縫ふままに。」(1-token blob) が重複して挿入されている。
 *     → s13 を「落窪の君、まして暇なく、苦しきことまさる。」で切り、
 *       新 s14 として「若くめでたき人は…縫ふままに、」を分割。s15(旧) は drop。
 *
 *  2. s24 の末尾「「落窪の君も、これを今さへ呼びこめたまふこと。」腹立たれたまへば、
 *     心のどかに物語もせず。」と、s25 「落窪の君も、これを今さへ呼びこめたまふこと、
 *     腹立たれたまへば、心のどかに物語もせず。」が重複。
 *     → 旧 s24 を canonical のまま保持、s25(旧, 1-token blob 重複) は drop。
 *
 *  3. s30 末尾「（）」(empty parens) の余計な記号を除去。
 *
 *  4. s31 「（巻の一）」は底本の編集注記。保持する (NotebookLM 校本に準じる)。
 *
 * 既存 hint と learningPoints は保持。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', '431b9a342b.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '431b9a342b.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── 編集 1: s13 を分割。tokens[0..9] = 落窪の君…まさる。/ tokens[10..37] = 若く…ままに、 ──
const s13Orig = t.sentences.find(s => s.id === 's13');
if (!s13Orig) throw new Error('s13 not found');

const s13HeadTokens = s13Orig.tokens.slice(0, 10).map(tk => ({ ...tk }));
const s13TailTokens = s13Orig.tokens.slice(10).map(tk => ({ ...tk }));

const newS13 = {
  id: 's13',
  originalText: '落窪の君、まして暇なく、苦しきことまさる。',
  modernTranslation: s13Orig.modernTranslation,
  tokens: s13HeadTokens,
};
const newS14 = {
  id: 's14',
  originalText: '若くめでたき人は、多くかやうのまめわざする人や少なかりけむ、あなづりやすくて、いとわびしければ、うち泣きて縫ふままに、',
  modernTranslation: '若く立派な人で、これほど実用的な仕事をする人は少なかったのだろうか、軽んじやすく、ひどくつらいので、泣きながら縫うにつれて、',
  tokens: s13TailTokens,
};

// ── 編集 2: 旧 s14, s15 (duplicates) は drop ─────────────
// ── 編集 3: 旧 s16 (waka) → 新 s15 ───────────────────────
// ── 編集 4: 旧 s24 を保持 (canonical な括弧付きバージョン), 旧 s25 (duplicate) drop ─

// ── 編集 5: 旧 s30 末尾「（）」(空 paren) 除去 ──────────
const s30Orig = t.sentences.find(s => s.id === 's30');
if (!s30Orig) throw new Error('s30 not found');
{
  // tokens の最後 2 つ (「（」と「）」) を削除
  const toks = s30Orig.tokens.filter(tk => tk.text !== '（' && tk.text !== '）');
  s30Orig.tokens = toks;
  s30Orig.originalText = '」と明け暮れ「あたらもの」と言ひ思ふ。';
}

// ── 文章リストを再構築 ────────────────────────────────
const newSentences = [];
for (const s of t.sentences) {
  if (s.id === 's13') {
    newSentences.push(newS13);
    newSentences.push(newS14);
  } else if (s.id === 's14' || s.id === 's15') {
    // skip (duplicate corruption)
    continue;
  } else if (s.id === 's25') {
    // skip (duplicate of s24 tail)
    continue;
  } else {
    newSentences.push({ ...s });
  }
}

// renumber sentence id sequentially
const idMap = {};
for (let i = 0; i < newSentences.length; i++) {
  const newId = `s${i + 1}`;
  idMap[newSentences[i].id] = newId;
}
// apply
for (let i = 0; i < newSentences.length; i++) {
  newSentences[i].id = `s${i + 1}`;
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
console.log(`Fixed 431b9a342b: ${newSentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
console.log('ID map (old → new):');
for (const [old, neu] of Object.entries(idMap)) {
  if (old !== neu) console.log(`  ${old} → ${neu}`);
}
