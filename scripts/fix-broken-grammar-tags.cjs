#!/usr/bin/env node
/**
 * 壊れた品詞タグを直す（正本のセルから作り直す）。
 *
 *   node scripts/fix-broken-grammar-tags.cjs          … 検査だけ
 *   node scripts/fix-broken-grammar-tags.cjs --apply  … 直す
 *
 * 事情
 *   正本の表には「[[link\|サ四・未]]（尊敬）」のように、閉じ括弧の後ろへ注記を
 *   続ける書き方がある。変換器がこれを想定しておらず、pos に
 *   「[[20-文法/古文文法/動詞の活用|サ四」がそのまま残った（活用形も敬語も落ちた）。
 *   変換器は直したが、既に出来ている texts-v3 は直らないので、
 *   正本の表の行と突き合わせて該当トークンだけ作り直す。
 */
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const V3 = path.join(process.cwd(), 'public', 'texts-v3');
const V2 = path.join(process.cwd(), 'public', 'texts');

// このスクリプトが扱えるリンク先（現状の壊れは全部これ）
const LINK = { '動詞の活用': { id: 'doushi-katsuyo', layer: 1 } };

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

function rowsOf(md) {
  const out = [];
  for (const line of (md || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const c = splitRow(t);
    if (c.length < 2) continue;
    if (c[0] === '語' || /^:?-+:?$/.test(c[0])) continue;
    if (/^【(歌意|句意)】/.test(c[0])) break;
    out.push({ word: wordOf(c[0]), cell: c[1] });
  }
  return out;
}

const inferPos = (ct) => {
  if (!ct) return '';
  if (/^(ク|シク)/.test(ct)) return '形容詞';
  if (/^(ナリ|タリ)/.test(ct)) return '形容動詞';
  return '動詞';
};

/** セル「[[link\|サ四・未]]（尊敬）」→ grammarTag */
function parseCell(cell) {
  const m = cell.match(/^\[\[([^\]|]+)\|([^\]]+)\]\](.*)$/);
  if (!m) return null;
  // 正本の表では | が バックスラッシュ でエスケープされているので、末尾のそれを落とす
  const seg = m[1].replace(new RegExp(String.fromCharCode(92, 92) + '$'), '').split('/').pop();
  const link = LINK[seg];
  if (!link) return null;
  const display = (m[2] + m[3]).trim();
  const parts = display.split('・');
  const hasAux = parts[0] === '補動' || parts[0] === '補助';
  const i = hasAux ? 1 : 0;
  const conjugationType = (parts[i] ?? '').replace(/[（(].*$/, '');
  const conjugationForm = (parts[i + 1] ?? '').replace(/[（(].*$/, '');
  const honorific = /[（(][^）)]*尊[^）)]*[）)]/.test(display) ? '尊敬'
    : /[（(][^）)]*謙[^）)]*[）)]/.test(display) ? '謙譲' : undefined;
  const tag = { pos: hasAux ? '補助動詞' : inferPos(conjugationType), conjugationType, conjugationForm };
  if (honorific) tag.honorific = honorific;
  return { tag, grammarRefId: link.id, layer: link.layer, display };
}

let broken = 0, fixed = 0;
for (const f of fs.readdirSync(V3).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const fp = path.join(V3, f);
  const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const bad = [];
  for (const s of doc.sentences || []) for (const t of s.tokens || []) {
    const g = t.grammarTag || {};
    if ([g.pos, g.meaning, g.conjugationForm].some((x) => x && (x.includes('[[') || x.includes(']]')))) bad.push(t);
  }
  if (bad.length === 0) continue;
  broken += bad.length;
  const v2p = path.join(V2, f);
  if (!fs.existsSync(v2p)) { console.log(`${doc.title}: 正本側の JSON が無いので飛ばす`); continue; }
  const rows = rowsOf((JSON.parse(fs.readFileSync(v2p, 'utf8')).sections || {})['品詞分解']);
  console.log(`\n${doc.title}（${doc.id}）  壊れたタグ ${bad.length} 件`);
  let n = 0;
  for (const t of bad) {
    // 語が一致する行を探す（同じ語が複数あるときは、まだ使っていない行から）
    const cand = rows.filter((r) => r.word === t.text && !r._used);
    if (cand.length === 0) { console.log(`   ✗ 「${t.text}」に当たる行が正本に無い`); continue; }
    const row = cand[0];
    const parsed = parseCell(row.cell);
    if (!parsed) { console.log(`   ✗ 「${t.text}」のセルを読めない: ${row.cell}`); continue; }
    row._used = true;
    console.log(`   → ${t.id}「${t.text}」 ${JSON.stringify(t.grammarTag)} → ${JSON.stringify(parsed.tag)} ／ ${parsed.grammarRefId}・層${parsed.layer}`);
    if (APPLY) {
      // baseForm など、壊れていない項目は残す
      t.grammarTag = { ...t.grammarTag, ...parsed.tag };
      t.grammarRefId = parsed.grammarRefId;
      t.layer = parsed.layer;
    }
    n++; fixed++;
  }
  if (APPLY && n > 0) {
    fs.writeFileSync(fp, JSON.stringify(doc, null, 2), 'utf8');
    console.log('   → 書き込んだ');
  }
}
console.log(`\n壊れたタグ ${broken} 件 / ${APPLY ? '直した' : '直せる'} ${fixed} 件`);
