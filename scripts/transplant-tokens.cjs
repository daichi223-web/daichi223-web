#!/usr/bin/env node
/**
 * 重複削除で消えた品詞分解を、正しい本文の側へ移植する。
 *
 *   node scripts/transplant-tokens.cjs          … 検査だけ（書き込みなし）
 *   node scripts/transplant-tokens.cjs --apply  … 移植する
 *
 * 事情
 *   ある文が「自分の本文＋次以降の文の複製」になっていた。品詞分解は
 *   その連結した文の側だけに付いていて、正しい本文の側は1トークンのまま。
 *   重複を消すと本文は正しくなるが、品詞分解が道連れになる。
 *
 * やること
 *   HEAD の版から「消えたぶんのトークン列」を取り出し、いまの正しい本文へ
 *   最長共通部分列で対応づけて配り直す。
 *   ・対応した字は元のトークン（grammarTag・hint・grammarRefId ごと）を引き継ぐ
 *   ・複製側で脱字していた字は、印の無いトークンとして挿入する（語は作らない）
 *   ・受け取る文は「いま1トークン以下＝分解が無い文」に限る（既存の分解は壊さない）
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const V3 = path.join(process.cwd(), 'public', 'texts-v3');

const changed = execSync('git diff --name-only -- public/texts-v3', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

const head = (rel) => JSON.parse(execSync(`git show HEAD:${rel}`, { encoding: 'utf8', maxBuffer: 1 << 28 }));

/** 最長共通部分列。b の各字が a のどの位置に対応するかを返す（無ければ -1） */
function alignChars(a, b) {
  const n = a.length, m = b.length;
  // 行を使い回して O(n*m) の表を作る
  const prev = new Uint32Array(m + 1);
  const table = [];
  for (let i = 0; i < n; i++) {
    const cur = new Uint32Array(m + 1);
    for (let j = 0; j < m; j++) {
      cur[j + 1] = a[i] === b[j] ? prev[j] + 1 : Math.max(cur[j], prev[j + 1]);
    }
    table.push(cur);
    prev.set(cur);
  }
  // 復元
  const map = new Int32Array(m).fill(-1);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1] && (table[i - 1][j - 1] ?? 0) + 1 === table[i - 1][j]) {
      map[j - 1] = i - 1; i--; j--;
    } else if ((i > 1 ? table[i - 2][j] : 0) >= (table[i - 1][j - 1] ?? 0)) i--;
    else j--;
  }
  return map;
}

/** トークン列 tokens（連結＝src）を、受け取り本文 dst に配り直す */
function transplant(tokens, dst) {
  const src = tokens.map((t) => t.text).join('');
  const map = alignChars(src, dst);
  // src の位置 → トークン番号
  const owner = new Int32Array(src.length);
  let p = 0;
  tokens.forEach((t, k) => { for (let x = 0; x < t.text.length; x++) owner[p++] = k; });

  const out = [];
  let curKey = null, buf = '';
  const flush = () => {
    if (!buf) return;
    const base = curKey === null ? null : tokens[curKey];
    out.push(base
      ? { text: buf, layer: base.layer, grammarTag: base.grammarTag, grammarRefId: base.grammarRefId, hint: base.hint }
      : { text: buf, layer: 0 });
    buf = '';
  };
  for (let j = 0; j < dst.length; j++) {
    const key = map[j] >= 0 ? owner[map[j]] : null;
    if (key !== curKey) { flush(); curKey = key; }
    buf += dst[j];
  }
  flush();
  // 対応できた字の割合（低いと移植先が違う可能性）。
  // 和歌・句の行は「句＋全角空白＋作者名」の形で余白が入るので、空白は数えない。
  let seen = 0, hit = 0;
  for (let j = 0; j < dst.length; j++) {
    if (/[\s　]/.test(dst[j])) continue;
    seen++;
    if (map[j] >= 0) hit++;
  }
  return { tokens: out.filter((t) => t.text.length > 0), cover: seen === 0 ? 0 : hit / seen };
}

const renumber = (st) => {
  let c = 0;
  st.tokens = st.tokens.map((tk, i) => {
    const t = { ...tk, id: `${st.id}-t${i + 1}`, start: c, end: c + tk.text.length };
    for (const k of Object.keys(t)) if (t[k] === undefined) delete t[k];
    c = t.end;
    return t;
  });
};

let files = 0, sentences = 0, moved = 0, inserted = 0;
for (const rel of changed) {
  const now = JSON.parse(fs.readFileSync(rel, 'utf8'));
  const old = head(rel);
  if (old.sentences.length !== now.sentences.length) { console.log(`${now.id} 文数が違うので飛ばす`); continue; }

  const notes = [];
  for (let i = 0; i < old.sentences.length; i++) {
    const o = old.sentences[i], n = now.sentences[i];
    if (o.originalText === n.originalText) continue;
    // 消えたぶん（末尾側 or 先頭側）のトークンを取り出す
    const cutTail = o.originalText.startsWith(n.originalText.slice(0, 8));
    const keep = n.originalText.length;
    const oTok = o.tokens || [];
    let donor = [];
    if (cutTail) {
      let p = 0; for (const t of oTok) { const s = p; p += t.text.length; if (s >= keep) donor.push(t); }
    } else {
      let p = 0; const drop = o.originalText.length - keep;
      for (const t of oTok) { const s = p; p += t.text.length; if (p <= drop) donor.push(t); }
    }
    if (donor.length <= 1) continue;

    // 受け取る文＝重複していた相手側で、いま分解が無い文
    //   末尾を削った文 → 続きの文へ ／ 先頭を削った文 → 前の文へ
    const donorText = donor.map((t) => t.text).join('');
    const recips = [];
    let acc = 0;
    if (cutTail) {
      for (let j = i + 1; j < now.sentences.length && acc < donorText.length * 0.95; j++) {
        const r = now.sentences[j];
        if ((r.tokens || []).length > 1) break;    // 既に分解がある文は触らない
        recips.push(r); acc += r.originalText.length;
      }
    } else {
      for (let j = i - 1; j >= 0 && acc < donorText.length * 0.95; j--) {
        const r = now.sentences[j];
        if ((r.tokens || []).length > 1) break;
        recips.unshift(r); acc += r.originalText.length;
      }
    }
    if (recips.length === 0) { notes.push(`  ${o.id} 受け取れる文が無い（消えたトークン ${donor.length}）`); continue; }

    const dst = recips.map((r) => r.originalText).join('');
    const { tokens: fresh, cover } = transplant(donor, dst);
    if (cover < 0.85) { notes.push(`  ${o.id}→${recips.map((r) => r.id).join(',')} 一致 ${(cover * 100).toFixed(0)}% で低いので見送り`); continue; }

    // 文の境界で切り分ける
    let p = 0, k = 0;
    for (const r of recips) {
      const end = p + r.originalText.length;
      const mine = [];
      while (k < fresh.length) {
        const t = fresh[k];
        const s = p + mine.reduce((a, x) => a + x.text.length, 0);
        if (s >= end) break;
        const room = end - s;
        if (t.text.length <= room) { mine.push(t); k++; }
        else { mine.push({ ...t, text: t.text.slice(0, room) }); fresh[k] = { ...t, text: t.text.slice(room) }; break; }
      }
      r.tokens = mine;
      renumber(r);
      p = end;
      sentences++;
      moved += mine.filter((t) => t.grammarTag).length;
      inserted += mine.filter((t) => !t.grammarTag).length;
    }
    notes.push(`  ${o.id} の消えた ${donor.length} トークン → ${cutTail ? '' : '（前へ）'}${recips.map((r) => `${r.id}(${r.tokens.length})`).join(' ')}　一致 ${(cover * 100).toFixed(0)}%`);
  }

  if (notes.length) {
    files++;
    console.log(`\n${now.id}  ${now.title}`);
    for (const n of notes) console.log(n);
    if (APPLY) {
      const bad = now.sentences.filter((s) => (s.tokens || []).map((t) => t.text).join('') !== s.originalText);
      if (bad.length) { console.log(`  ✗ 連結が合わないので書かない: ${bad.map((s) => s.id).join(',')}`); continue; }
      fs.writeFileSync(rel, JSON.stringify(now, null, 2), 'utf8');
      console.log('  → 書き込んだ');
    }
  }
}
console.log(`\n${files} 本 / ${sentences} 文へ移植${APPLY ? 'した' : 'できる'}。品詞分解つき ${moved} トークン、無印で補った ${inserted} トークン`);
