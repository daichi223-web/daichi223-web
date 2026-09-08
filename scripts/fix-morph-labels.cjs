#!/usr/bin/env node
/**
 * 品詞分解ラベルの表記ゆれを正本（kokugo-vault の MD）で直す。
 *
 *   node scripts/fix-morph-labels.cjs                … 正本を空打ち
 *   node scripts/fix-morph-labels.cjs --apply        … 正本を直す
 *   node scripts/fix-morph-labels.cjs --app          … アプリ側を空打ち
 *   node scripts/fix-morph-labels.cjs --app --apply  … アプリ側も直す
 *
 * アプリ側は2層ある。public/texts（正本からの抽出コピー）と
 * public/texts-v3（アプリが読む形）。正本を直しても再抽出しないと揃わないが、
 * 再抽出は全件上書きで他の未同期分まで巻き込むので、同じ規則をここで当てる。
 *
 * 直す規則（check-morph.cjs の M1 と同じ）
 *   1番目の区切り … 補助 → 補動
 *   2番目以降     … 命令 → 命 ／ 連用 → 用 ／ 〜強調 → 〜強意
 *   全区切り      … 語中の全角空白を除く
 *
 * 1番目の区切りは品詞や助動詞の意味なので、命令・連用・強調は変えない
 * （「命令・終」は〈命令〉の意味＋終止形であって活用形ではない）。
 *
 * 触るのは「## 2. 品詞分解」の表のセルだけ。行の他の部分は動かさない。
 * git は触らない（共同リポジトリなので差分を見てから人が判断する）。
 */
const fs = require('fs');
const path = require('path');

const VAULT = 'F:/A2A/NotebookLM/kokugo-vault/30-教材/古文';
const V2 = path.join(process.cwd(), 'public', 'texts');
const APPLY = process.argv.includes('--apply');
const APP = process.argv.includes('--app');

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

const fixSeg = (seg, isFirst) => {
  const m = seg.match(/^([^（(]*)([（(].*)?$/);
  const head = (m[1] || '').replace(/[\u3000]/g, '');
  const tail = m[2] || '';
  let fixed = head;
  if (isFirst) {
    if (head === '補助') fixed = '補動';
  } else {
    if (head === '命令') fixed = '命';
    else if (head === '連用') fixed = '用';
    else if (head.endsWith('強調')) fixed = head.slice(0, -2) + '強意';
  }
  return fixed + tail;
};
const fixLabel = (L) => L.split('・').map((seg, i) => fixSeg(seg, i === 0)).join('・');

if (APP) { fixApp(); process.exit(0); }

// 教材 → vault の MD のパス
const files = [];
for (const f of fs.readdirSync(V2).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const d = JSON.parse(fs.readFileSync(path.join(V2, f), 'utf8'));
  if (!d.file_name) continue;
  files.push({ title: d.title, md: path.join(VAULT, d.file_name) });
}

let touchedFiles = 0, touchedRows = 0, missing = 0;
for (const { title, md } of files) {
  if (!fs.existsSync(md)) { missing++; continue; }
  const raw = fs.readFileSync(md, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);

  // 「## 2. 品詞分解」の範囲だけを対象にする
  let from = lines.findIndex((l) => /^##\s*\d*\.?\s*品詞分解/.test(l.trim()));
  if (from < 0) continue;
  let to = from + 1;
  while (to < lines.length && !/^##\s/.test(lines[to])) to++;

  const notes = [];
  for (let i = from; i < to; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = splitRow(t);
    if (cells.length < 2) continue;
    if (cells[0] === '語' || /^:?-+:?$/.test(cells[0])) continue;
    if (/^【(歌意|句意)】/.test(cells[0])) break;
    const label = labelOf(cells[1]);
    if (!label) continue;
    const fixed = fixLabel(label);
    if (fixed === label) continue;
    // 2列目の中だけを置き換える（1列目に同じ文字列があっても触らない）
    const secondCellStart = line.indexOf('|', line.indexOf('|') + 1);
    const at = line.indexOf(label, secondCellStart);
    if (at < 0) { notes.push(`   ✗ ${i + 1}行目: 「${label}」を2列目に見つけられない`); continue; }
    notes.push(`   ${i + 1}行目「${cells[0]}」: ${label} → ${fixed}`);
    lines[i] = line.slice(0, at) + fixed + line.slice(at + label.length);
    touchedRows++;
  }
  if (notes.length === 0) continue;
  touchedFiles++;
  console.log(`\n${title}`);
  console.log('  ' + md.split(String.fromCharCode(92)).join('/'));
  for (const n of notes) console.log(n);
  if (APPLY) {
    fs.writeFileSync(md, lines.join(eol), 'utf8');
    console.log('  → 書き込んだ');
  }
}
console.log(`\n${touchedFiles} 本 / ${touchedRows} 行を${APPLY ? '直した' : '直せる'}` + (missing ? `（MD が見つからない教材 ${missing} 本）` : ''));

/** アプリ側の2層に同じ正規化を当てる */
function fixApp() {
  const V3 = path.join(process.cwd(), 'public', 'texts-v3');
  // 1) public/texts の「品詞分解」セクション（正本からの抽出コピー）
  let n1 = 0, f1 = 0;
  for (const f of fs.readdirSync(V2).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const fp = path.join(V2, f);
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const md = (d.sections || {})['品詞分解'];
    if (!md) continue;
    const lines = md.split('\n');
    let hit = 0;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t.startsWith('|')) continue;
      const cells = splitRow(t);
      if (cells.length < 2) continue;
      if (cells[0] === '語' || /^:?-+:?$/.test(cells[0])) continue;
      if (/^【(歌意|句意)】/.test(cells[0])) break;
      const label = labelOf(cells[1]);
      if (!label) continue;
      const fixed = fixLabel(label);
      if (fixed === label) continue;
      const second = lines[i].indexOf('|', lines[i].indexOf('|') + 1);
      const at = lines[i].indexOf(label, second);
      if (at < 0) continue;
      lines[i] = lines[i].slice(0, at) + fixed + lines[i].slice(at + label.length);
      hit++;
    }
    if (hit === 0) continue;
    f1++; n1 += hit;
    console.log(`  public/texts/${f}  ${hit} 行`);
    if (APPLY) {
      d.sections['品詞分解'] = lines.join('\n');
      fs.writeFileSync(fp, JSON.stringify(d, null, 2), 'utf8');
    }
  }
  console.log(`public/texts: ${f1} 本 / ${n1} 行`);

  // 2) texts-v3 の grammarTag（分解済みなので項目ごとに当てる）
  let n2 = 0, f2 = 0;
  for (const f of fs.readdirSync(V3).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const fp = path.join(V3, f);
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    let hit = 0;
    for (const s of d.sentences || []) for (const t of s.tokens || []) {
      const g = t.grammarTag;
      if (!g) continue;
      // pos は変換時に「補動」→「補助動詞」に直されている。取りこぼしの「補助」だけ揃える
      if (g.pos === '補助') { g.pos = '補助動詞'; hit++; }
      if (typeof g.meaning === 'string' && g.meaning.endsWith('強調')) {
        g.meaning = g.meaning.slice(0, -2) + '強意'; hit++;
      }
      for (const k of ['conjugationForm', 'conjugationType']) {
        if (typeof g[k] !== 'string') continue;
        let v = g[k].replace(/[\u3000]/g, '');
        if (v === '連用') v = '用';
        if (v === '命令') v = '命';
        if (v !== g[k]) { g[k] = v; hit++; }
      }
    }
    if (hit === 0) continue;
    f2++; n2 += hit;
    console.log(`  public/texts-v3/${f}  ${hit} 件`);
    if (APPLY) fs.writeFileSync(fp, JSON.stringify(d, null, 2), 'utf8');
  }
  console.log(`public/texts-v3: ${f2} 本 / ${n2} 件`);
  console.log(APPLY ? '→ 書き込んだ' : '（書き込みなし）');
}
