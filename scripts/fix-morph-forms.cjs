#!/usr/bin/env node
/**
 * M4（接続の矛盾）で見つかった、明白な活用形の誤り7件を直す。
 *
 *   node scripts/fix-morph-forms.cjs          … 空打ち
 *   node scripts/fix-morph-forms.cjs --apply  … 直す
 *
 * どれも接続から機械的に決まるもの。1件ずつ根拠を書いてある。
 * 正本（kokugo-vault の MD）と、アプリ側の public/texts・public/texts-v3 を揃える。
 * 「語＋いまのラベル」が教材の中で一意であることを確かめてから書き換える。
 */
const fs = require('fs');
const path = require('path');

const VAULT = 'F:/A2A/NotebookLM/kokugo-vault/30-教材/古文';
const V2 = path.join(process.cwd(), 'public', 'texts');
const V3 = path.join(process.cwd(), 'public', 'texts-v3');
const APPLY = process.argv.includes('--apply');

const FIXES = [
  { title: '丹波に出雲といふ所あり', word: 'せ', from: '使役・用', to: '使役・未', why: '「かいもちひ召させむ」の「む」は未然接続' },
  { title: '土佐日記（帰京）', word: 'せ', from: '使役・用', to: '使役・未', why: '「ものも言はせず」の「ず」は未然接続' },
  { title: '土佐日記（門出）', word: '見', from: 'マ上一・用', to: 'マ上一・未', why: '「してみむと」の「む」は未然接続。上一段は未然も「見」' },
  { title: '宣耀殿の女御', word: '見せ', from: 'サ下二・用', to: 'サ下二・未', why: '「見せさせたまは」の「させ」は未然接続' },
  { title: '大納言殿参りたまひて', word: '寝', from: 'ナ下二・用', to: 'ナ下二・未', why: '「かう寝させたまふ」の「させ」は未然接続' },
  { title: '暁の雪', word: 'たり', from: '存続・体', to: '存続・用', why: '「思したりつる」の「つる」（完了「つ」）は連用接続' },
  { title: '里にまかでたるに', word: 'にくかる', from: 'ク・未', to: 'ク・体', why: '「にくかるまじ」はカリ活用連体形＋「まじ」' },
  { title: '千早城の戦い', word: 'なりがたし', from: 'ラ四・用（接尾）', to: 'ク・終（接尾）', why: '「〜がたし」はコーパス20例中19例がク活用（接尾）。「その功なりがたし。」は文末で終止形' },
];

// すでに直したものは「一致する行が 0 件」になって飛ばされる（何度流しても同じ結果）。

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
const labelOf = (c) => { const m = (c || '').match(/\|([^\]]+)\]\]/); return m ? m[1].trim() : (c || '').trim(); };
const wordOf = (w) => { const m = (w || '').match(/\|([^\]]+)\]\]/); return m ? m[1].trim() : (w || '').trim(); };

/** 教材名 → { id, file } */
const index = new Map();
for (const f of fs.readdirSync(V2).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const d = JSON.parse(fs.readFileSync(path.join(V2, f), 'utf8'));
  index.set(d.title, { id: d.id, file: d.file_name, json: path.join(V2, f) });
}

/** 表の行のうち、語とラベルが一致する行番号を返す */
function findRows(lines, from, to, word, label) {
  const hits = [];
  for (let i = from; i < to; i++) {
    const t = lines[i].trim();
    if (!t.startsWith('|')) continue;
    const c = splitRow(t);
    if (c.length < 2) continue;
    if (wordOf(c[0]) === word && labelOf(c[1]) === label) hits.push(i);
  }
  return hits;
}

let okCount = 0, ngCount = 0;
for (const fx of FIXES) {
  const meta = index.get(fx.title);
  if (!meta) { console.log(`✗ ${fx.title}: 教材が見つからない`); ngCount++; continue; }
  const md = path.join(VAULT, meta.file);
  if (!fs.existsSync(md)) { console.log(`✗ ${fx.title}: 正本 MD が無い`); ngCount++; continue; }

  const raw = fs.readFileSync(md, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let from = lines.findIndex((l) => /^##\s*\d*\.?\s*品詞分解/.test(l.trim()));
  let to = from + 1;
  while (to < lines.length && !/^##\s/.test(lines[to])) to++;

  const hits = findRows(lines, from, to, fx.word, fx.from);
  if (hits.length !== 1) {
    console.log(`✗ ${fx.title} 「${fx.word}」${fx.from}: 一致する行が ${hits.length} 件（1件でないと直さない）`);
    ngCount++; continue;
  }
  const i = hits[0];
  const second = lines[i].indexOf('|', lines[i].indexOf('|') + 1);
  const at = lines[i].indexOf(fx.from, second);
  console.log(`○ ${fx.title}  ${i + 1}行目「${fx.word}」: ${fx.from} → ${fx.to}`);
  console.log(`   ${fx.why}`);
  lines[i] = lines[i].slice(0, at) + fx.to + lines[i].slice(at + fx.from.length);
  okCount++;

  if (!APPLY) continue;
  fs.writeFileSync(md, lines.join(eol), 'utf8');

  // public/texts（抽出コピー）
  const d2 = JSON.parse(fs.readFileSync(meta.json, 'utf8'));
  const sec = (d2.sections || {})['品詞分解'] || '';
  const sl = sec.split('\n');
  const h2 = findRows(sl, 0, sl.length, fx.word, fx.from);
  if (h2.length === 1) {
    const k = h2[0];
    const s2 = sl[k].indexOf('|', sl[k].indexOf('|') + 1);
    const a2 = sl[k].indexOf(fx.from, s2);
    sl[k] = sl[k].slice(0, a2) + fx.to + sl[k].slice(a2 + fx.from.length);
    d2.sections['品詞分解'] = sl.join('\n');
    fs.writeFileSync(meta.json, JSON.stringify(d2, null, 2), 'utf8');
  } else {
    console.log(`   ！ public/texts 側で一致する行が ${h2.length} 件。手当てが要る`);
  }

  // public/texts-v3（活用形だけ差し替える）
  const oldForm = fx.from.split('・').pop().replace(/[（(].*$/, '');
  const newForm = fx.to.split('・').pop().replace(/[（(].*$/, '');
  const p3 = path.join(V3, `${meta.id}.json`);
  if (fs.existsSync(p3)) {
    const d3 = JSON.parse(fs.readFileSync(p3, 'utf8'));
    const cand = [];
    for (const s of d3.sentences || []) for (const t of s.tokens || []) {
      if (t.text === fx.word && t.grammarTag?.conjugationForm === oldForm) cand.push(t);
    }
    if (cand.length === 1) {
      cand[0].grammarTag.conjugationForm = newForm;
      fs.writeFileSync(p3, JSON.stringify(d3, null, 2), 'utf8');
      console.log(`   texts-v3 も ${oldForm} → ${newForm}`);
    } else {
      console.log(`   ！ texts-v3 側で候補が ${cand.length} 件。手当てが要る`);
    }
  }
}
console.log(`\n${okCount} 件を${APPLY ? '直した' : '直せる'}` + (ngCount ? ` / 見送り ${ngCount} 件` : ''));
