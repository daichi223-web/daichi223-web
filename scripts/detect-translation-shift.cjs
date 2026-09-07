#!/usr/bin/env node
/**
 * 訳が教材全体でずれていないかを探す（read-only・書き込みなし）。
 *
 *   node scripts/detect-translation-shift.cjs
 *
 * 本文の文の切り出しに失敗して1文が複数文を飲み込むと、それ以降の訳が
 * まるごと後ろへずれる。1文ずれを見る T10 では拾えないので、
 * 「訳を k 文ずらすと一致が跳ね上がるか」で探す。
 *
 * 注意: 文が少ない教材・漢字語が少ない教材では偶然の一致で誤検出する
 * （後鳥羽院5文・継母との別れ10文が実例）。出たものは必ず中身を見ること。
 * 直すのは scripts/reassign-translations.cjs（正本から訳を割り当て直す）。
 */
const fs = require('fs');

const kanji = (t) => { const m = (t || '').match(/[一-鿿]{2,}/g); return m ? [...new Set(m)] : []; };
const ov = (ws, tr) => (ws.length === 0 || !tr) ? null : ws.filter((w) => tr.includes(w)).length / ws.length;

const rows = [];
for (const f of fs.readdirSync('public/texts-v3').filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  const d = JSON.parse(fs.readFileSync('public/texts-v3/' + f, 'utf8'));
  const ss = d.sentences || [];
  if (ss.length < 5) continue;
  const score = (k) => {
    let sum = 0, n = 0;
    for (let i = 0; i < ss.length; i++) {
      const j = i + k;
      if (j < 0 || j >= ss.length) continue;
      const v = ov(kanji(ss[i].originalText), ss[j].modernTranslation || '');
      if (v === null) continue;
      sum += v; n++;
    }
    return n === 0 ? 0 : sum / n;
  };
  const own = score(0);
  let best = 0, bestK = 0;
  for (let k = -8; k <= 8; k++) { if (k === 0) continue; const v = score(k); if (v > best) { best = v; bestK = k; } }
  if (best - own > 0.15) rows.push({ id: d.id, title: d.title, n: ss.length, own, best, bestK });
}
rows.sort((a, b) => (b.best - b.own) - (a.best - a.own));
console.log('訳が全体でずれていそうな教材: ' + rows.length + '本');
for (const r of rows) {
  console.log(`  ${r.own.toFixed(2)} → ${r.best.toFixed(2)}（${r.bestK > 0 ? '+' : ''}${r.bestK}文ずらすと）  ${r.n}文  ${r.title}（${r.id}）`);
}
