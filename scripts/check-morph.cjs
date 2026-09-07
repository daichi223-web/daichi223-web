#!/usr/bin/env node
/**
 * 品詞分解のラベルを、他の教材と突き合わせて検算する（read-only・報告だけ）。
 *
 *   node scripts/check-morph.cjs           … 全教材
 *   node scripts/check-morph.cjs <id> ...  … 教材を指定
 *   node scripts/check-morph.cjs --json
 *
 * 見るもの
 *   M1 表記ゆれ      同じラベルの少数派の書き方（係助・強調 → 係助・強意 など）
 *   M2 他と食い違う  他の教材では必ず同じセルになる語なのに、ここだけ違う
 *   M3 孤立ラベル    どの教材にも1回しか出ないラベル（誤記の疑い）
 *   M4 接続の矛盾    次の語から決まる活用形と、書かれている活用形が合わない
 *
 * 機械の推定と食い違うだけの行は出さない（推定はまだ8割程度なので、
 * それを出すと本当の誤りが埋もれる）。「他の教材が揃って別の答えを出す」
 * ものだけを拾う。
 *
 * 直す先は正本（kokugo-vault の MD）なので、このスクリプトは何も書き換えない。
 */
const fs = require('fs');
const path = require('path');
const { allowedForms, formOf } = require(path.join(__dirname, 'morph-rules.cjs'));

const IN = path.join(process.cwd(), 'public', 'texts');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.filter((a) => !a.startsWith('-'));

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
  const lines = (md || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith('|')) continue;
    const c = splitRow(t);
    if (c.length < 2) continue;
    if (c[0] === '語' || /^:?-+:?$/.test(c[0])) continue;
    if (/^【(歌意|句意)】/.test(c[0])) break;
    out.push({ line: i + 1, word: wordOf(c[0]), cell: c[1], label: labelOf(c[1]) });
  }
  return out;
}

const docs = [];
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const d = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  const rows = rowsOf((d.sections || {})['品詞分解']);
  if (rows.length < 20) continue;
  docs.push({ id: d.id, title: d.title, file: d.file_name || '', rows });
}

// ---- 全体の統計 ----------------------------------------------------------
const labelCount = new Map();
const wordCells = new Map(); // 語 → Map(セル → Map(教材id → 件数))
for (const d of docs) {
  for (const r of d.rows) {
    if (r.label) labelCount.set(r.label, (labelCount.get(r.label) || 0) + 1);
    if (!wordCells.has(r.word)) wordCells.set(r.word, new Map());
    const byCell = wordCells.get(r.word);
    if (!byCell.has(r.cell)) byCell.set(r.cell, new Map());
    byCell.get(r.cell).set(d.id, (byCell.get(r.cell).get(d.id) || 0) + 1);
  }
}

// 表記ゆれ: 正規化して同じになる組の、少数派
const norm = (s) => s.replace(/[\s\u3000]/g, '').replace(/補助/g, '補動')
  .replace(/命令/g, '命').replace(/強調/g, '強意').replace(/連用/g, '用')
  .replace(/[（(]/g, '(').replace(/[）)]/g, ')');
const canonical = new Map(); // ラベル → 多数派のラベル
{
  const groups = new Map();
  for (const [L, n] of labelCount) {
    const k = norm(L);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([L, n]);
  }
  // 正しい形の選び方: 語中に全角空白が入っていないものを優先し、その中で多いもの。
  // （空白入りのほうが多い組があるが、それは揃って混入しているだけで正しくない）
  const dirty = (L) => /[\u3000]/.test(L);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (dirty(a[0]) - dirty(b[0])) || (b[1] - a[1]));
    for (const [L] of g.slice(1)) canonical.set(L, g[0][0]);
  }
}

/** 編集距離（2までしか要らないので打ち切る） */
function editDist(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** よく使うラベルのうち、1〜2字しか違わないもの */
const commonLabels = [];
function nearestCommon(label) {
  let best = null;
  for (const [L, n] of commonLabels) {
    if (L === label) continue;
    const d = editDist(label, L, 2);
    if (d <= 2 && (!best || d < best.dist || (d === best.dist && n > best.n))) best = { label: L, n, dist: d };
  }
  return best;
}

// M4 用: 「次の語 × 実際の活用形」の違反が全体で何回起きているかを先に数える。
// 何度も起きるものは規則の取りこぼし（例: 形容動詞連用形＋サ変「せ」）なので出さない。
const violation = new Map();
for (const d of docs) {
  for (let i = 0; i < d.rows.length; i++) {
    const form = formOf(d.rows[i].label);
    if (!form) continue;
    const next = i + 1 < d.rows.length ? d.rows[i + 1].word : null;
    const allowed = allowedForms(next);
    if (allowed && !allowed.has(form)) {
      const k = next + '	' + form;
      violation.set(k, (violation.get(k) || 0) + 1);
    }
  }
}
const VIOLATION_MAX = 2; // これを超えて出る違反は規則の側の問題とみなす

const findings = [];
const add = (d, code, r, detail) => findings.push({ id: d.id, title: d.title, code, line: r.line, word: r.word, detail });

for (const [L, n] of labelCount) if (n >= 10) commonLabels.push([L, n]);
commonLabels.sort((a, b) => b[1] - a[1]);

const targets = only.length ? docs.filter((d) => only.includes(d.id)) : docs;
for (const d of targets) {
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    // M4 接続の矛盾（活用形を持つ行だけ。規則は「絞り込み」用に広めなので、
    // それでも外れるものは書き間違いか、次の語が別語の可能性が高い）
    const form = formOf(r.label);
    if (form) {
      const next = i + 1 < d.rows.length ? d.rows[i + 1].word : null;
      const allowed = allowedForms(next);
      if (allowed && !allowed.has(form) && (violation.get(next + '	' + form) || 0) <= VIOLATION_MAX) {
        add(d, 'M4-接続の矛盾', r, `次が「${next}」なら活用形は ${[...allowed].join('/')} のはずだが「${r.label}」`);
      }
    }
    if (!r.label) continue;
    if (canonical.has(r.label)) {
      add(d, 'M1-表記ゆれ', r, `「${r.label}」→「${canonical.get(r.label)}」が多数派`);
      continue;
    }
    // M2: 他の教材では必ず1つのセルになる語なのに、ここだけ違う
    const byCell = wordCells.get(r.word);
    if (byCell) {
      const others = new Map();
      for (const [cell, byDoc] of byCell) {
        let n = 0;
        for (const [docId, c] of byDoc) if (docId !== d.id) n += c;
        if (n > 0) others.set(cell, n);
      }
      const total = [...others.values()].reduce((a, b) => a + b, 0);
      if (others.size === 1 && total >= 10 && !others.has(r.cell)) {
        add(d, 'M2-他と食い違う', r, `他 ${total} 例はすべて「${labelOf([...others.keys()][0]) || '（空）'}」だが、ここは「${r.label}」`);
        continue;
      }
    }
    // M3: 1回しか出ないラベルのうち、よく使うラベルと1〜2字しか違わないもの＝誤記の疑い。
    // 「カ上二・未」のように稀でも妥当なラベルは山ほどあるので、それは出さない。
    if (labelCount.get(r.label) === 1) {
      const near = nearestCommon(r.label);
      if (near) add(d, 'M3-誤記の疑い', r, `「${r.label}」はこの1件だけ。よく使う「${near.label}」（${near.n}件）と${near.dist}字違い`);
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ checked: targets.length, findings }, null, 2));
  process.exit(0);
}
console.log(`検算: ${targets.length} 本 / 行 ${targets.reduce((a, d) => a + d.rows.length, 0)} 件 / 指摘 ${findings.length} 件\n`);
const byCode = {};
for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
console.log('種類別:');
for (const [k, v] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
const byDoc = {};
for (const f of findings) byDoc[f.title] = (byDoc[f.title] || 0) + 1;
console.log('\n指摘の多い教材 上位10本:');
for (const [k, v] of Object.entries(byDoc).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\n例（各種類の先頭5件）:');
for (const code of Object.keys(byCode)) {
  for (const f of findings.filter((x) => x.code === code).slice(0, 5)) {
    console.log(`  [${f.code}] ${f.title} 表${f.line}行目「${f.word}」: ${f.detail}`);
  }
}
