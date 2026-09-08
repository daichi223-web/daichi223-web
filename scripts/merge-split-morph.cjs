#!/usr/bin/env node
/**
 * 語の途中で切れている行を1語に統合する（M4のB群）。
 *
 *   node scripts/merge-split-morph.cjs          … 空打ち
 *   node scripts/merge-split-morph.cjs --apply  … 直す
 *
 * 「立ち｜た（完了・体）｜る（空）」のように、活用語尾だけが別の行に
 * 切り離されている箇所がある。次の語のラベルが空なのが目印。
 * 正本の表・public/texts・texts-v3 の3層で1語にまとめる。
 *
 * texts-v3 はトークンが1つ減るので id が振り直しになる。
 * 決め手の参照は scripts/fix-decider-refs.cjs で貼り直すこと。
 */
const fs = require('fs');
const path = require('path');

const VAULT = 'F:/A2A/NotebookLM/kokugo-vault/30-教材/古文';
const V2 = path.join(process.cwd(), 'public', 'texts');
const V3 = path.join(process.cwd(), 'public', 'texts-v3');
const APPLY = process.argv.includes('--apply');

const MERGES = [
  { title: '不易流行', a: 'た', b: 'る', why: '完了「たり」連体形「たる」が「た」と「る」に割れている' },
  { title: '夢よりもはかなき世の中を', a: 'なれなれし', b: 'き', why: 'シク活用連体形「なれなれしき」が語尾で割れている' },
  { title: '刑部卿敦兼の北の方', a: 'はなやかな', b: 'る', why: 'ナリ活用連体形「はなやかなる」が語尾で割れている' },
  { title: '鷲にさらわれた赤子', a: '住', b: 'む', why: 'マ四段連体形「住む」が語尾で割れている' },
];

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
const wordOf = (w) => { const m = (w || '').match(/\|([^\]]+)\]\]/); return m ? m[1].trim() : (w || '').trim(); };

const index = new Map();
for (const f of fs.readdirSync(V2).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const d = JSON.parse(fs.readFileSync(path.join(V2, f), 'utf8'));
  index.set(d.title, { id: d.id, file: d.file_name, json: path.join(V2, f) });
}

/** 連続する2行（a とラベル空の b）を探す。返り値は b の行番号 */
function findPair(lines, from, to, a, b) {
  const hits = [];
  for (let i = from; i + 1 < to; i++) {
    const t1 = lines[i].trim(); const t2 = lines[i + 1].trim();
    if (!t1.startsWith('|') || !t2.startsWith('|')) continue;
    const c1 = splitRow(t1); const c2 = splitRow(t2);
    if (c1.length < 2 || c2.length < 2) continue;
    if (wordOf(c1[0]) === a && wordOf(c2[0]) === b && c2[1] === '') hits.push(i);
  }
  return hits;
}

let done = 0, ng = 0;
for (const mg of MERGES) {
  const meta = index.get(mg.title);
  if (!meta) { console.log(`✗ ${mg.title}: 教材が無い`); ng++; continue; }
  const md = path.join(VAULT, meta.file);
  const raw = fs.readFileSync(md, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let from = lines.findIndex((l) => /^##\s*\d*\.?\s*品詞分解/.test(l.trim()));
  let to = from + 1;
  while (to < lines.length && !/^##\s/.test(lines[to])) to++;

  const hits = findPair(lines, from, to, mg.a, mg.b);
  if (hits.length !== 1) { console.log(`✗ ${mg.title}「${mg.a}」+「${mg.b}」: 一致 ${hits.length} 件`); ng++; continue; }
  const i = hits[0];
  const c1 = splitRow(lines[i].trim());
  console.log(`○ ${mg.title}  ${i + 1}行目: 「${mg.a}」＋「${mg.b}」 → 「${mg.a + mg.b}」`);
  console.log(`   ${mg.why}`);

  if (APPLY) {
    // 1列目の語だけを足して、2行目を落とす
    const merged = lines[i].replace(c1[0], c1[0] + mg.b);
    lines.splice(i, 2, merged);
    fs.writeFileSync(md, lines.join(eol), 'utf8');

    // public/texts
    const d2 = JSON.parse(fs.readFileSync(meta.json, 'utf8'));
    const sl = ((d2.sections || {})['品詞分解'] || '').split('\n');
    const h2 = findPair(sl, 0, sl.length, mg.a, mg.b);
    if (h2.length === 1) {
      const k = h2[0];
      const cc = splitRow(sl[k].trim());
      sl.splice(k, 2, sl[k].replace(cc[0], cc[0] + mg.b));
      d2.sections['品詞分解'] = sl.join('\n');
      fs.writeFileSync(meta.json, JSON.stringify(d2, null, 2), 'utf8');
    } else console.log(`   ！ public/texts 側で一致 ${h2.length} 件`);

    // texts-v3
    const p3 = path.join(V3, `${meta.id}.json`);
    const d3 = JSON.parse(fs.readFileSync(p3, 'utf8'));
    let hit = 0;
    for (const s of d3.sentences || []) {
      for (let k = 0; k + 1 < s.tokens.length; k++) {
        if (s.tokens[k].text !== mg.a || s.tokens[k + 1].text !== mg.b) continue;
        if (s.tokens[k + 1].grammarTag && s.tokens[k + 1].grammarTag.pos) continue;
        s.tokens[k].text = mg.a + mg.b;
        s.tokens.splice(k + 1, 1);
        let c = 0;
        s.tokens = s.tokens.map((tk, n) => {
          const t = { ...tk, id: `${s.id}-t${n + 1}`, start: c, end: c + tk.text.length };
          c = t.end;
          return t;
        });
        hit++;
        break;
      }
    }
    if (hit === 1) {
      const bad = (d3.sentences || []).filter((s) => (s.tokens || []).map((t) => t.text).join('') !== s.originalText);
      if (bad.length) { console.log(`   ✗ 連結が合わないので texts-v3 は書かない: ${bad.map((s) => s.id).join(',')}`); }
      else { fs.writeFileSync(p3, JSON.stringify(d3, null, 2), 'utf8'); console.log('   texts-v3 も統合'); }
    } else console.log(`   ！ texts-v3 側で一致 ${hit} 件`);
  }
  done++;
}
console.log(`\n${done} 件を${APPLY ? '統合した' : '統合できる'}` + (ng ? ` / 見送り ${ng} 件` : ''));
