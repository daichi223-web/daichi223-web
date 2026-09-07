#!/usr/bin/env node
/**
 * 隣り合う文で本文が重複しているのを直す（分割の失敗の後始末）。
 *
 *   node scripts/fix-duplicate-body.cjs            … 全教材を検査（書き込みなし）
 *   node scripts/fix-duplicate-body.cjs --apply    … 直す
 *   node scripts/fix-duplicate-body.cjs <id> ...   … 教材を指定
 *
 * 直し方
 *   B が A の末尾と同じ  → A から末尾の B を取り除く（A は自分の部分だけ残す）
 *   A が B の先頭と同じ  → B から先頭の A を取り除く（B は自分の部分だけ残す）
 * どちらも「重複している方を消して、各文が自分の内容だけを持つ」ようにする。
 *
 * トークンは、残った本文の長さに合わせて前（または後ろ）から詰め直す。
 * 途中で切れるトークンは分割し、grammarTag などは残す方に引き継ぐ。
 * 訳（modernTranslation）は触らない。
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const V3 = path.join(ROOT, 'public', 'texts-v3');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const only = args.filter((a) => !a.startsWith('-'));

const bodyKey = (t) => (t || '').replace(/[\s　「」﹁﹂『』（）()]+/g, '');

/** 実テキスト上で、正規化後の位置に対応する切り出しを探す */
function findSuffixCut(a, b) {
  // a の末尾が b と同じか（正規化して比較）。返り値は a を切るべき実位置。
  const ka = bodyKey(a);
  const kb = bodyKey(b);
  if (kb.length < 12 || ka.length <= kb.length) return -1;
  const head = kb.slice(0, Math.floor(kb.length * 0.8));
  if (!head || !ka.includes(head)) return -1;
  const at = ka.lastIndexOf(head);
  if (at <= 0) return -1;
  // 正規化位置 at → 実位置
  let seen = 0;
  for (let i = 0; i < a.length; i++) {
    if (!/[\s　「」﹁﹂『』（）()]/.test(a[i])) {
      if (seen === at) return i;
      seen++;
    }
  }
  return -1;
}

function findPrefixCut(a, b) {
  // b の先頭が a と同じか。返り値は b を切るべき実位置。
  const ka = bodyKey(a);
  const kb = bodyKey(b);
  if (ka.length < 12 || kb.length <= ka.length) return -1;
  const head = ka.slice(0, Math.floor(ka.length * 0.8));
  if (!head || !kb.startsWith(head)) return -1;
  // a 全体が b の先頭にあるとみなし、a の長さぶん進める
  let seen = 0;
  for (let i = 0; i < b.length; i++) {
    if (!/[\s　「」﹁﹂『』（）()]/.test(b[i])) {
      seen++;
      if (seen === ka.length) return i + 1;
    }
  }
  return -1;
}

/** トークン列を、テキストの [from, to) に対応するぶんだけ取り出す */
function sliceTokens(tokens, from, to) {
  const out = [];
  let pos = 0;
  for (const tk of tokens) {
    const text = tk.text ?? '';
    const s = pos;
    const e = pos + text.length;
    pos = e;
    if (e <= from || s >= to) continue;
    const cutFrom = Math.max(from, s) - s;
    const cutTo = Math.min(to, e) - s;
    const piece = text.slice(cutFrom, cutTo);
    if (!piece) continue;
    out.push({ ...tk, text: piece });
  }
  return out;
}

function renumber(sentence) {
  let c = 0;
  sentence.tokens = (sentence.tokens || []).map((tk, i) => {
    const t = { ...tk, id: `${sentence.id}-t${i + 1}`, start: c, end: c + (tk.text || '').length };
    c = t.end;
    return t;
  });
}

const files = fs
  .readdirSync(V3)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .filter((f) => only.length === 0 || only.includes(f.slice(0, -5)));

let totalFound = 0;
let totalFixed = 0;
for (const f of files) {
  const p = path.join(V3, f);
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ss = doc.sentences || [];
  const notes = [];
  for (let i = 0; i + 1 < ss.length; i++) {
    const a = ss[i];
    const b = ss[i + 1];
    const suffixCut = findSuffixCut(a.originalText, b.originalText);
    const prefixCut = suffixCut >= 0 ? -1 : findPrefixCut(a.originalText, b.originalText);
    if (suffixCut < 0 && prefixCut < 0) continue;
    totalFound++;
    if (suffixCut >= 0) {
      const before = a.originalText;
      const kept = before.slice(0, suffixCut).replace(/[\s　]+$/, '');
      notes.push(`${a.id}: 末尾の重複を削除（${before.length}→${kept.length}字）`);
      if (APPLY) {
        a.tokens = sliceTokens(a.tokens || [], 0, kept.length);
        a.originalText = kept;
        renumber(a);
      }
    } else {
      const before = b.originalText;
      const kept = before.slice(prefixCut).replace(/^[\s　]+/, '');
      const drop = before.length - kept.length;
      notes.push(`${b.id}: 先頭の重複を削除（${before.length}→${kept.length}字）`);
      if (APPLY) {
        b.tokens = sliceTokens(b.tokens || [], drop, before.length);
        b.originalText = kept;
        renumber(b);
      }
    }
    totalFixed++;
  }
  if (notes.length > 0) {
    console.log(`${doc.id ?? f}  ${doc.title ?? ''}`);
    for (const n of notes) console.log(`   ${n}`);
    if (APPLY) {
      // 念のため: 直した文で連結が一致するか確かめてから書く
      const bad = ss.filter(
        (s) => (s.tokens || []).map((t) => t.text).join('') !== s.originalText,
      );
      if (bad.length > 0) {
        console.log(`   ✗ 連結が合わないので書き込まない: ${bad.map((s) => s.id).join(',')}`);
        continue;
      }
      fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf8');
      console.log('   → 書き込んだ');
    }
  }
}
console.log(`\n重複 ${totalFound} 箇所 / ${APPLY ? '直した' : '直せる'} ${totalFixed} 箇所`);
