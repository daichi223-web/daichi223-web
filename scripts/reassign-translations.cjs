#!/usr/bin/env node
/**
 * 正本（kokugo-vault の MD）から現代語訳を取り直し、いまの文の切れ目に割り当て直す。
 *
 *   node scripts/reassign-translations.cjs <id> [<id>...]         … 検査だけ
 *   node scripts/reassign-translations.cjs <id> --apply           … 書き込む
 *
 * 事情
 *   古い変換では本文の文の切り出しに失敗し（s1 が段落まるごとを飲み込む等）、
 *   そのぶん訳が後ろへずれて別の文に付いてしまった教材がある。
 *   文を切り直すと reading の注釈（文id 参照）や決め手が外れるので、
 *   **文はそのままに、訳だけを正本から割り当て直す**。
 *
 * やり方
 *   正本の「## 1. 本文」と「## 3. 現代語訳」を段落→句点で切り、1対1に対応づける。
 *   いまの文を、正本の本文の断片を先頭から積んで再現し、その断片に対応する訳を
 *   つないで訳とする。再現できない教材は触らない（安全側）。
 */
const fs = require('fs');
const path = require('path');

const VAULT = 'F:/A2A/NotebookLM/kokugo-vault/30-教材/古文';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ids = args.filter((a) => !a.startsWith('-'));

const norm = (t) => (t || '').replace(/[\s\u3000「」﹁﹂『』（）()]/g, '');

function findMd(title) {
  const stack = [VAULT];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === `${title}.md`) return p;
    }
  }
  return null;
}

function section(lines, head) {
  const i = lines.findIndex((l) => l.trim() === head);
  if (i < 0) return '';
  let j = i + 1;
  while (j < lines.length && !/^## /.test(lines[j])) j++;
  return lines.slice(i + 1, j).join('\n').trim();
}

const paras = (t) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
const byPeriod = (t) => {
  if (!t.includes('。')) return [t];
  const out = [];
  let b = '';
  for (const c of t) {
    b += c;
    if (c === '。') { if (b.trim()) out.push(b.trim()); b = ''; }
  }
  if (b.trim()) out.push(b.trim());
  return out;
};

/** 正本を「本文の断片 → 訳」の並びに開く */
function loadCanonical(mdPath, title) {
  const lines = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let bp = paras(section(lines, '## 1. 本文'));
  // 本文の頭に題名だけの段落が置かれていることがある（訳の側には無い）
  while (bp.length && norm(bp[0]) === norm(title)) bp = bp.slice(1);
  const tp = paras(section(lines, '## 3. 現代語訳'));
  const pieces = [];
  if (bp.length === tp.length) {
    // 段落数が合うとき: 段落ごとに、先頭から1対1で対応づける。
    // 本文が多いぶん（末尾の「」や出典表記）は訳なし、
    // 訳が多いぶんは最後の文にまとめて付ける（取りこぼしを作らない）。
    bp.forEach((p, i) => {
      const b = byPeriod(p);
      const t = byPeriod(tp[i]);
      b.forEach((piece, k) => {
        let trans = t[k] ?? '';
        if (k === b.length - 1 && t.length > b.length) trans = t.slice(k).join('');
        pieces.push({ text: piece, trans });
      });
    });
    return pieces;
  }
  // 段落数が合わないとき（和歌2行に訳が1段落、など）は全体で1対1にする。
  // 出典表記だけの断片（「（巻第八）」「」」など）は訳を持たないので対応から外す。
  const b = bp.flatMap(byPeriod);
  const t = tp.flatMap(byPeriod);
  const isCitation = (x) => /^[\s\u3000]*(?:[（(][^）)]{0,20}[）)]|[」﹂『』]+)[\s\u3000]*$/.test(x);
  const real = b.map((text, i) => ({ text, i })).filter((x) => !isCitation(x.text));
  // 文の数まで違う場合は当てにならないので、訳を付けずに返して呼び出し側で止める。
  if (real.length !== t.length) return b.map((text) => ({ text, trans: null }));
  const out = b.map((text) => ({ text, trans: '' }));
  real.forEach((x, k) => { out[x.i].trans = t[k]; });
  return out;
}

let changedFiles = 0;
for (const id of ids) {
  const fp = path.join('public', 'texts-v3', `${id}.json`);
  if (!fs.existsSync(fp)) { console.log(`${id}: texts-v3 に無い`); continue; }
  const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const md = findMd(doc.title);
  if (!md) { console.log(`${id}: 正本 MD が見つからない（${doc.title}）`); continue; }

  const pieces = loadCanonical(md, doc.title);
  console.log(`\n■ ${doc.title}（${id}）  正本 ${pieces.length}文 → いま ${doc.sentences.length}文`);
  if (pieces.some((p) => p.trans === null)) {
    console.log('   ✗ 正本の本文と訳で文の数が合わない（段落の対応も付かない）ので触らない');
    continue;
  }

  // いまの文を、正本の断片を先頭から積んで再現する
  let cur = 0;
  const plan = [];
  let ok = true;
  for (const s of doc.sentences) {
    const want = norm(s.originalText);
    let acc = '';
    const used = [];
    while (cur < pieces.length && norm(acc).length < want.length) {
      acc += pieces[cur].text;
      used.push(cur);
      cur++;
    }
    if (norm(acc) !== want) {
      // 末尾の出典表記など、正本に無い文は飛ばす
      if (used.length === 0) { plan.push({ s, used: [], trans: s.modernTranslation || '' }); continue; }
      console.log(`   ✗ ${s.id} が正本と合わない`);
      console.log(`      いま: ${s.originalText.slice(0, 50)}`);
      console.log(`      正本: ${acc.slice(0, 50)}`);
      ok = false;
      break;
    }
    plan.push({ s, used, trans: used.map((i) => pieces[i].trans).filter(Boolean).join('') });
  }
  if (!ok) { console.log('   → 再現できないので触らない'); continue; }

  let diff = 0;
  for (const p of plan) {
    const before = p.s.modernTranslation || '';
    if (before === p.trans) continue;
    diff++;
    console.log(`   ${p.s.id}（正本 ${p.used.length}文ぶん）`);
    console.log(`      前: ${before.slice(0, 60) || '（なし）'}`);
    console.log(`      後: ${p.trans.slice(0, 60) || '（なし）'}`);
  }
  console.log(`   訳が変わる文: ${diff} / ${doc.sentences.length}`);
  if (APPLY && diff > 0) {
    for (const p of plan) p.s.modernTranslation = p.trans;
    fs.writeFileSync(fp, JSON.stringify(doc, null, 2), 'utf8');
    console.log('   → 書き込んだ');
    changedFiles++;
  }
}
console.log(`\n${APPLY ? `${changedFiles} 本に書き込んだ` : '書き込みなし'}`);
