#!/usr/bin/env node
/**
 * 品詞分解の辞書を、既存教材の MD 表から作る（read-only・data/ に書き出すだけ）。
 *
 *   node scripts/build-morph-lexicon.cjs            … 作って data/morph-lexicon.json へ
 *   node scripts/build-morph-lexicon.cjs --labels   … ラベルの揺れ・稀なラベルも報告する
 *
 * 元データ
 *   public/texts/<id>.json の sections.品詞分解（vault MD の表そのまま）。
 *   表は「| 語 | 品詞・活用 |」の2列。セルは Obsidian の wikilink で、
 *   その表示名（例「格助・体修」）が実際のラベルになる。
 *
 * 出す辞書
 *   { surfaces: { 語形: { cells: {セル: 件数}, label: {表示名: 件数} },
 *     prev:  { "前の語\t語形": {セル: 件数} },
 *     next:  { "語形\t次の語": {セル: 件数} } }
 *
 * 用途
 *   1) 既存教材の検算（scripts/check-morph.cjs）
 *   2) 新しい本文の品詞分解の下書き
 */
const fs = require('fs');
const path = require('path');

const IN = path.join(process.cwd(), 'public', 'texts');
const OUT = path.join(process.cwd(), 'data', 'morph-lexicon.json');
const WITH_LABELS = process.argv.includes('--labels');

/** 表の行を割る。セルの中の wikilink は バックスラッシュ+| を含むのでそこでは割らない */
function splitRow(line) {
  const body = line.replace(/^\|/, '').replace(/\|$/, '');
  const out = [];
  let buf = '';
  const BS = String.fromCharCode(92);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '|' && body[i - 1] !== BS) { out.push(buf.trim()); buf = ''; }
    else buf += ch;
  }
  out.push(buf.trim());
  return out;
}

/** wikilink の表示名（「…\|格助・体修]]」→「格助・体修」）。素の文字列ならそのまま */
const labelOf = (cell) => {
  const m = (cell || '').match(/\|([^\]]+)\]\]/);
  return m ? m[1].trim() : (cell || '').trim();
};

/** 語の欄も wikilink のことがある（「[[…\|たまふ]]」→「たまふ」） */
const wordOf = (w) => {
  const m = (w || '').match(/\|([^\]]+)\]\]/);
  return m ? m[1].trim() : (w || '').trim();
};

function rowsOf(md) {
  const out = [];
  for (const line of (md || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const c = splitRow(t);
    if (c.length < 2) continue;
    if (c[0] === '語' || /^:?-+:?$/.test(c[0])) continue;
    if (/^【(歌意|句意)】/.test(c[0])) break; // 表の末尾に訳が続く教材がある
    out.push({ word: wordOf(c[0]), raw: c[0], cell: c[1], label: labelOf(c[1]) });
  }
  return out;
}

const bump = (obj, k1, k2) => {
  if (!obj[k1]) obj[k1] = {};
  obj[k1][k2] = (obj[k1][k2] || 0) + 1;
};

const surfaces = {};
const prev = {};
const next = {};
const labelCount = {};
const labelWhere = {};
let docs = 0, rows = 0;

for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const d = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  const r = rowsOf((d.sections || {})['品詞分解']);
  if (r.length < 20) continue;
  docs++;
  rows += r.length;
  for (let i = 0; i < r.length; i++) {
    const w = r[i].word;
    if (!w) continue;
    if (!surfaces[w]) surfaces[w] = { cells: {}, label: {} };
    surfaces[w].cells[r[i].cell] = (surfaces[w].cells[r[i].cell] || 0) + 1;
    surfaces[w].label[r[i].label] = (surfaces[w].label[r[i].label] || 0) + 1;
    bump(prev, (i > 0 ? r[i - 1].word : '^') + '\t' + w, r[i].cell);
    bump(next, w + '\t' + (i + 1 < r.length ? r[i + 1].word : '$'), r[i].cell);
    if (r[i].label) {
      labelCount[r[i].label] = (labelCount[r[i].label] || 0) + 1;
      if (!labelWhere[r[i].label]) labelWhere[r[i].label] = new Set();
      labelWhere[r[i].label].add(d.title);
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ builtFrom: docs, rows, surfaces, prev, next }, null, 0), 'utf8');
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`教材 ${docs} 本 / 行 ${rows} 件 → 見出し語 ${Object.keys(surfaces).length} 語`);
console.log(`ラベル ${Object.keys(labelCount).length} 種`);
console.log(`書き出し: data/morph-lexicon.json（${kb}KB）`);

if (!WITH_LABELS) process.exit(0);

// ---- ラベルの揺れ・稀なラベル -------------------------------------------
// 全角空白や「補助/補動」「命令/命」のような表記ゆれを、正規化して同じになる組で探す
const norm = (s) => s
  .replace(/[\s\u3000]/g, '')
  .replace(/補助/g, '補動')
  .replace(/命令/g, '命')
  .replace(/強調/g, '強意')
  .replace(/連用/g, '用')
  .replace(/[（(]/g, '(')
  .replace(/[）)]/g, ')');
const groups = {};
for (const [L, n] of Object.entries(labelCount)) {
  const k = norm(L);
  (groups[k] ||= []).push([L, n]);
}
const wobble = Object.values(groups).filter((g) => g.length > 1)
  .sort((a, b) => b.reduce((x, y) => x + y[1], 0) - a.reduce((x, y) => x + y[1], 0));
console.log(`\n表記が揺れている組: ${wobble.length} 組`);
for (const g of wobble) {
  console.log('  ' + g.sort((a, b) => b[1] - a[1]).map((x) => `${x[0]} x${x[1]}`).join('  /  '));
}
const rare = Object.entries(labelCount).filter((e) => e[1] === 1).sort();
console.log(`\n1回しか出ないラベル: ${rare.length} 種`);
for (const [L] of rare) console.log(`  ${L}\t（${[...labelWhere[L]][0]}）`);
