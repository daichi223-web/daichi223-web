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

const isSpace = (ch) => /[\s\u3000]/.test(ch);

/** b の各字が a のどこに対応するかを最長共通部分列で求める（無ければ -1） */
function alignChars(a, b) {
  const rows = [new Uint32Array(b.length + 1)];
  for (let i = 0; i < a.length; i++) {
    const prev = rows[i];
    const cur = new Uint32Array(b.length + 1);
    for (let j = 0; j < b.length; j++) {
      cur[j + 1] = a[i] === b[j] ? prev[j] + 1 : Math.max(cur[j], prev[j + 1]);
    }
    rows.push(cur);
  }
  const map = new Int32Array(b.length).fill(-1);
  let i = a.length, j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1] && rows[i][j] === rows[i - 1][j - 1] + 1) { map[j - 1] = i - 1; i--; j--; }
    else if (rows[i - 1][j] >= rows[i][j - 1]) i--;
    else j--;
  }
  return map;
}

/** b が a のどれだけ入っているか（空白は数えない） */
function coverage(map, b) {
  let seen = 0, hit = 0;
  for (let j = 0; j < b.length; j++) {
    if (isSpace(b[j])) continue;
    seen++;
    if (map[j] >= 0) hit++;
  }
  return seen === 0 ? 0 : hit / seen;
}

/** 一致位置を「間が空いたら別の塊」として分け、いちばん大きい塊を返す */
function densestBlock(hits) {
  const blocks = [];
  let cur = [];
  for (const h of hits) {
    if (cur.length && h - cur[cur.length - 1] > 8) { blocks.push(cur); cur = []; }
    cur.push(h);
  }
  if (cur.length) blocks.push(cur);
  return blocks.sort((x, y) => y.length - x.length)[0] || [];
}

/**
 * a の末尾が、続く文々の複製か。返り値は a を切るべき位置。
 * 複製側は脱字していることがある（能登殿「鞘をはづし」→「鞘を」）ので完全一致では見ない。
 * 1文とは限らず、続く3文ぶんをまとめて抱えていることもある（能登殿 s23）。
 * 「消す部分が、続く文々に本当にある」ことを確かめてから切る。
 */
function findSuffixCut(a, nexts) {
  const b = nexts[0];
  if (!a || !b || b.length < 12 || a.length <= b.length) return -1;
  const map = alignChars(a, b);
  if (coverage(map, b) < 0.85) return -1;
  // b の頭の「」や句読点が a の別の場所と偶然合うことがあるので、いちばん大きい塊の先頭を起点にする
  const block = densestBlock([...map].filter((x) => x >= 0));
  const first = block[0];
  if (first === undefined || first <= 0) return -1;

  const tail = a.slice(first);
  // 続く文を必要なだけ足して、消す部分がそこに収まるか見る
  let acc = '';
  for (const t of nexts) {
    acc += t;
    if (coverage(alignChars(acc, tail), tail) >= 0.85) return first;
    if (acc.length > tail.length * 1.5) break;
  }
  return -1;
}

/** b の先頭が、前の文々の複製か。返り値は b を切るべき位置。 */
function findPrefixCut(prevs, b) {
  const a = prevs[prevs.length - 1];
  if (!a || !b || a.length < 12 || b.length <= a.length) return -1;
  const map = alignChars(b, a);
  if (coverage(map, a) < 0.85) return -1;
  const block = densestBlock([...map].filter((x) => x >= 0));
  if (block[0] > 2) return -1;
  const cut = block[block.length - 1] + 1;
  if (cut >= b.length) return -1;
  const head = b.slice(0, cut);
  let acc = '';
  for (let k = prevs.length - 1; k >= 0; k--) {
    acc = prevs[k] + acc;
    if (coverage(alignChars(acc, head), head) >= 0.85) return cut;
    if (acc.length > head.length * 1.5) break;
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
    const nexts = ss.slice(i + 1, i + 6).map((x) => x.originalText);
    const prevs = ss.slice(Math.max(0, i - 4), i + 1).map((x) => x.originalText);
    const suffixCut = findSuffixCut(a.originalText, nexts);
    const prefixCut = suffixCut >= 0 ? -1 : findPrefixCut(prevs, b.originalText);
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
