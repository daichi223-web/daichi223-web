#!/usr/bin/env node
/**
 * 逐語訳（public/chikugo/<教材ID>.json）を検査する（2026-10-25〜）。
 *   node scripts/check-chikugo.mjs [<教材ID> ...]
 * - 各文の原文の区切りをつなぐと、texts-v3 の originalText と一致する
 * - texts-v3 に無い文の id が無い・空の訳が無い
 * - （ ）の開き閉じがそろっている
 * - 本文の名詞の漢字が訳の（ ）の中にだけある（本文の語は（ ）の外の訳に入れる）
 * - 注意（終了コードには入れない）：区切りに推量・断定・完了の助動詞が無いのに「だろう」「のだ」「てしまう」がある
 * NG があれば終了コード1
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIR = join(ROOT, 'public', 'chikugo');
const only = process.argv.slice(2);
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json') && (!only.length || only.includes(f.slice(0, -5)))) : [];
let bad = 0, sents = 0, segs = 0, warns = 0;
const ng = (m) => { bad++; console.log('NG ' + m); };
const warn = (m) => { warns++; console.log('注意 ' + m); };
for (const f of files) {
  const id = f.slice(0, -5);
  const ck = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const v3p = join(ROOT, 'public', 'texts-v3', f);
  if (!existsSync(v3p)) { ng(`${id}: texts-v3 が無い`); continue; }
  const doc = JSON.parse(readFileSync(v3p, 'utf8'));
  const byId = new Map(doc.sentences.map((s) => [s.id, s]));
  for (const [sid, pairs] of Object.entries(ck.sentences || {})) {
    const s = byId.get(sid);
    if (!s) { ng(`${id} ${sid}: texts-v3 に無い文`); continue; }
    sents++;
    const joined = pairs.map((p) => p[0]).join('');
    if (joined !== s.originalText) ng(`${id} ${sid}: 原文の区切りが本文と合わない\n   区切り: ${joined}\n   本文　: ${s.originalText}`);
    // 区切りごとに、その範囲に入る語（トークン）を出す
    let pos = 0;
    const toks = [];
    for (const tk of s.tokens) { toks.push({ tk, s: pos, e: pos + tk.text.length }); pos += tk.text.length; }
    let at = 0;
    for (const [o, t] of pairs) {
      segs++;
      if (!o || !t) ng(`${id} ${sid}: 空の区切り「${o}」「${t}」`);
      const open = (t.match(/（/g) || []).length, close = (t.match(/）/g) || []).length;
      if (open !== close) ng(`${id} ${sid}: 訳の（ ）がそろわない「${t}」`);
      // 本文の語は（ ）の外の訳に入れる（2026-10-25 ユーザー指示。特に名詞）。
      // 名詞（品詞が空・名詞・代名詞）の漢字が、訳の（ ）の中にだけ出て外に無ければ誤り
      const outside = t.replace(/（[^（）]*）/g, '');
      const inside = (t.match(/（[^（）]*）/g) || []).join('');
      for (const { tk, s: ts, e: te } of toks) {
        if (ts < at || te > at + o.length) continue;
        const p = tk.grammarTag?.pos || '';
        if (!(p === '' || p === '名詞' || p === '代名詞')) continue;
        for (const ch of tk.text.match(/[一-鿿]/g) || []) {
          if (inside.includes(ch) && !outside.includes(ch)) ng(`${id} ${sid}: 本文の名詞「${tk.text}」の「${ch}」が訳の（ ）の中にだけある「${o}」→「${t}」`);
        }
      }
      // 補いすぎの注意（NG にはしない）：区切りに推量・断定・完了の助動詞が無いのに、訳の（ ）の外に「だろう」「のだ」「てしまう」がある
      //   [[kobun-hango-chokuyaku]]（本文に無い推量・断定・完了を補わない）
      const auxes = toks.filter(({ s: ts, e: te, tk }) => ts >= at && te <= at + o.length && tk.grammarTag?.pos === '助動詞').map(({ tk }) => tk.grammarTag?.meaning || '');
      const has = (re) => auxes.some((m) => re.test(m));
      if (/(だろう|でしょう|であろう)/.test(outside) && !has(/推量|意志|推定|婉曲|仮定|当然|適当|可能|反実仮想/) && !/[むけらべまじ]/.test(o.slice(-3))) warn(`${id} ${sid}: 推量の助動詞が無いのに「だろう」類「${o}」→「${t}」`);
      if (/(のだ(?!ろう)|のです|のである|のであった)/.test(o.includes("もの") ? outside.replace(/もの(だ|です|である)/g, "") : outside) && !has(/断定/)) warn(`${id} ${sid}: 断定の助動詞が無いのに「のだ」類「${o}」→「${t}」`);
      if (/てしま[うっいわえ]/.test(outside) && !has(/完了|強意/)) warn(`${id} ${sid}: 完了の助動詞が無いのに「てしまう」「${o}」→「${t}」`);
      at += o.length;
    }
  }
  const missing = doc.sentences.filter((s) => !(ck.sentences || {})[s.id]).map((s) => s.id);
  if (missing.length) console.log(`   ${id}（${doc.title}）: 逐語訳の無い文 ${missing.length}（${missing.slice(0, 8).join(' ')}${missing.length > 8 ? ' …' : ''}）`);
}
console.log(`検査: ${files.length} 本 / ${sents} 文 / ${segs} 区切り / NG ${bad} / 注意 ${warns}`);
process.exit(bad ? 1 : 0);
