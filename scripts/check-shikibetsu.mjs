// 識別レイヤーの対象を全教材で数える（読み取り専用）。
//   node scripts/check-shikibetsu.mjs            … 正体別の件数と、表記は合うのに正体を決められず外した件数
//   node scripts/check-shikibetsu.mjs <textId>   … その教材の対象を1件ずつ（本文の確かめ用）
// 判定は src/lib/kobun/shikibetsu.ts（Node 24 の型除去でそのまま読む）。
import fs from 'node:fs';
import path from 'node:path';
import { findShikibetsu, GROUPS } from '../src/lib/kobun/shikibetsu.ts';

const dir = path.join(import.meta.dirname, '..', 'public', 'texts-v3');
const only = process.argv[2];
const WATCH = new Set(['に', 'なり', 'なる', 'なれ', 'なむ', 'らむ', 'らめ', 'ぬ', 'ね', 'る', 'れ', 'し']);

const count = {};
const missed = {};
let texts = 0;
let total = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const id = f.replace(/\.json$/, '');
  if (only && id !== only) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (!d || !Array.isArray(d.sentences)) continue;
  texts++;
  for (const s of d.sentences) {
    const found = findShikibetsu(s.tokens);
    const covered = new Set(found.flatMap((t) => t.parts.map((p) => p.tokenId)));
    for (const t of found) {
      total++;
      const label = GROUPS[t.group].choices.find((c) => c.id === t.answer)?.label ?? t.answer;
      const k = `${GROUPS[t.group].title}｜${label}`;
      count[k] = (count[k] ?? 0) + 1;
      if (only) console.log(`${s.id}\t${t.form}\t${label}\t${t.clue}\t${s.originalText.slice(0, 40)}`);
    }
    for (const tk of s.tokens) {
      if (!WATCH.has(tk.text) || covered.has(tk.id)) continue;
      const g = tk.grammarTag ?? {};
      const k = `${tk.text}｜${g.pos ?? ''}/${g.conjugationType ?? ''}/${g.conjugationForm ?? ''}/${g.meaning ?? ''}`;
      missed[k] = (missed[k] ?? 0) + 1;
    }
  }
}

console.log(`教材 ${texts} 本・識別の対象 ${total} 件`);
for (const [k, v] of Object.entries(count).sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);
const m = Object.entries(missed).sort((a, b) => b[1] - a[1]);
console.log(`\n表記は対象だが正体を決められず外したもの ${m.reduce((a, [, v]) => a + v, 0)} 件`);
for (const [k, v] of m) console.log(`  ${String(v).padStart(5)}  ${k}`);
