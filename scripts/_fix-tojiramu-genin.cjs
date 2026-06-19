// 東下り（宇津の山）「鹿の子まだらに雪の降るらむ」のらむを 現在推量→原因推量 に是正。
// 眼前の雪（降れり）の理由を疑問語「いつとてか」で問う＝原因推量。public/dist の texts-v3 と reading を直す。
const fs = require('fs');
const path = require('path');
const ID = 'bfa5b23cf2';
const ROOT = path.resolve(__dirname, '..');
const NEW_HINT = '助動詞「らむ」(原因推量): 終止形接続。眼前の事態の原因・理由を推量する。直前の地の文「雪いと白う降れり」で雪は見えており、疑問語「いつとて」＋係助詞「か」を受けて「どういうわけで(いつだと思って)降っているのか」と理由を問う。係り結びで連体形(結び)。';
let changes = 0;

for (const base of ['public', 'dist']) {
  // texts-v3: s8-t18 らむ の meaning 現在推量→原因推量 ＋ hint 差し替え
  const tv = path.join(ROOT, base, 'texts-v3', `${ID}.json`);
  if (fs.existsSync(tv)) {
    const doc = JSON.parse(fs.readFileSync(tv, 'utf8'));
    let hit = false;
    for (const s of (doc.sentences || [])) {
      if (!/時知らぬ|鹿の子まだら/.test(s.originalText || '')) continue;
      for (const t of (s.tokens || [])) {
        if (t.text === 'らむ' && t.grammarTag && t.grammarTag.meaning === '現在推量') {
          t.grammarTag.meaning = '原因推量';
          t.hint = NEW_HINT;
          hit = true; changes++;
        }
      }
    }
    if (hit) { fs.writeFileSync(tv, JSON.stringify(doc, null, 2) + '\n'); console.log(`✔ ${base}/texts-v3/${ID}.json : らむ 現在推量→原因推量`); }
    else console.log(`- ${base}/texts-v3/${ID}.json : 対象なし`);
  }
  // reading: 「現在推量・連体形」→「原因推量・連体形」
  const rd = path.join(ROOT, base, 'reading', `${ID}.json`);
  if (fs.existsSync(rd)) {
    let raw = fs.readFileSync(rd, 'utf8');
    const before = raw;
    raw = raw.replace(/「らむ」（現在推量・連体形）/g, '「らむ」（原因推量・連体形）');
    if (raw !== before) { fs.writeFileSync(rd, raw); console.log(`✔ ${base}/reading/${ID}.json : 現在推量→原因推量`); changes++; }
    else console.log(`- ${base}/reading/${ID}.json : 対象文字列なし`);
  }
}
console.log(`\n計 ${changes} 箇所を修正`);
