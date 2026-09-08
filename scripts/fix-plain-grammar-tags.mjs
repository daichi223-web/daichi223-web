#!/usr/bin/env node
/**
 * 品詞欄に活用の種類や助動詞の意味が入ってしまっているトークンを、
 * 正本のセルから作り直す。
 *
 *   node scripts/fix-plain-grammar-tags.mjs          … 空打ち
 *   node scripts/fix-plain-grammar-tags.mjs --apply  … 直す
 *
 * 事情
 *   正本には wikilink を張らない素のテキストのセルがある。変換器がそれを
 *   「最初の区切り＝品詞名」として扱っていたため、pos="ヤ下二"、pos="命令" の
 *   ように活用の種類や助動詞の意味が品詞欄に入った。変換器は直したが、
 *   出来上がっている texts-v3 は直らないのでここで作り直す。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseLabel } from './morph-label.mjs';

const APPLY = process.argv.includes('--apply');
const V3 = join(process.cwd(), 'public', 'texts-v3');
const V2 = join(process.cwd(), 'public', 'texts');

/** 実在する品詞名。これ以外が pos に入っていたら作り直す */
const REAL_POS = new Set([
  '動詞', '形容詞', '形容動詞', '名詞', '代名詞', '副詞', '連体詞', '接続詞',
  '感動詞', '助動詞', '助詞', '格助詞', '接続助詞', '係助詞', '副助詞', '終助詞',
  '間投助詞', '準体助詞', '補助動詞', '接頭語', '接尾語', '連語', '枕詞', '記号',
  '数副詞', '',
]);

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

function rowsOf(md) {
  const out = [];
  for (const line of (md || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const c = splitRow(t);
    if (c.length < 2) continue;
    if (c[0] === '語' || /^:?-+:?$/.test(c[0])) continue;
    if (/^【(歌意|句意)】/.test(c[0])) break;
    out.push({ word: wordOf(c[0]), label: labelOf(c[1]), used: false });
  }
  return out;
}

let files = 0, fixed = 0, skipped = 0;
for (const f of readdirSync(V3).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const fp = join(V3, f);
  const doc = JSON.parse(readFileSync(fp, 'utf8'));
  const bad = [];
  for (const s of doc.sentences || []) for (const t of s.tokens || []) {
    const pos = t.grammarTag?.pos;
    if (pos !== undefined && !REAL_POS.has(pos)) bad.push(t);
  }
  if (bad.length === 0) continue;
  const v2 = join(V2, f);
  if (!existsSync(v2)) { console.log(`${doc.title}: 正本側の JSON が無い`); continue; }
  const rows = rowsOf((JSON.parse(readFileSync(v2, 'utf8')).sections || {})['品詞分解']);

  const notes = [];
  let n = 0;
  for (const t of bad) {
    // 句読点や括弧だけのトークンは、分割のときに次の語のタグを引き継いでいる
    // （「。」が 連体 を持つ等）。品詞は付けない。
    if (/^[\s　。、，．・「」﹁﹂『』（）()\[\]]+$/.test(t.text)) {
      notes.push(`   → ${t.id}「${t.text}」 ${JSON.stringify(t.grammarTag)} → 記号なので品詞を外す`);
      if (APPLY) t.grammarTag = { pos: '' };
      n++; fixed++;
      continue;
    }
    const row = rows.find((r) => r.word === t.text && !r.used);
    // 正本に当たる行が無いときは、いま入っている壊れた値をラベルとして読み直す
    const parsed = row ? parseLabel(row.label) : parseLabel(t.grammarTag.pos);
    if (!parsed.pos) {
      notes.push(`   ✗ 「${t.text}」の${row ? `ラベル「${row.label}」` : `品詞「${t.grammarTag.pos}」`}を読み解けない`);
      skipped++; continue;
    }
    if (row) row.used = true;
    notes.push(`   → ${t.id}「${t.text}」 ${JSON.stringify(t.grammarTag)} → ${JSON.stringify({ ...t.grammarTag, ...parsed })}`);
    if (APPLY) t.grammarTag = { ...t.grammarTag, ...parsed };
    n++; fixed++;
  }
  if (notes.length === 0) continue;
  files++;
  console.log(`\n${doc.title}（${doc.id}）  ${bad.length} 件`);
  for (const x of notes.slice(0, 4)) console.log(x);
  if (notes.length > 4) console.log(`   …ほか ${notes.length - 4} 件`);
  if (APPLY && n > 0) { writeFileSync(fp, JSON.stringify(doc, null, 2), 'utf8'); console.log('   → 書き込んだ'); }
}
console.log(`\n${files} 本 / ${APPLY ? '直した' : '直せる'} ${fixed} 件` + (skipped ? ` / 読み解けない ${skipped} 件` : ''));
