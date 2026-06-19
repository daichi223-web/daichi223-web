// 東下り らむ＝原因推量の是正に伴い、残った「説明文」を修正。texts-v3 学習ポイント/降るhint・guides。public/dist。
const fs = require('fs');
const path = require('path');
const ID = 'bfa5b23cf2';
const ROOT = path.resolve(__dirname, '..');

// A) 学習ポイント item9（texts-v3 byLayer ＆ guides に同文）
const A_OLD = '疑問「いつとてか」: 「いつとてか…降るらむ」の「か」は疑問の係助詞、結びは連体形「らむ」。「いつと思って降るのだろうか」の反語的感嘆。';
const A_NEW = '疑問「いつとてか」＋原因推量「らむ」: 「か」は疑問の係助詞、結びは連体形「らむ」（係り結び）。直前「雪いと白う降れり」で雪は眼前にあり、その理由を「いつとて」で問う原因推量＝「いつと思って（どういうわけで）降っているのだろうか」。目に見えない事態の現在推量とは区別する。';
// B) 「降る」hint の現在推量
const B_OLD = '連体形「降る」+「らむ」で「降るのだろう」の現在推量。';
const B_NEW = '連体形「降る」+「らむ」で、眼前の雪の理由を問う原因推量「(いつと思って)降っているのだろうか」。';

let changes = 0;
for (const base of ['public', 'dist']) {
  for (const layer of ['texts-v3', 'guides']) {
    const fp = path.join(ROOT, base, layer, `${ID}.json`);
    if (!fs.existsSync(fp)) continue;
    let raw = fs.readFileSync(fp, 'utf8');
    const before = raw;
    raw = raw.split(A_OLD).join(A_NEW);
    raw = raw.split(B_OLD).join(B_NEW);
    if (raw !== before) { fs.writeFileSync(fp, raw); console.log(`✔ ${base}/${layer}/${ID}.json 修正`); changes++; }
    else console.log(`- ${base}/${layer}/${ID}.json 対象なし`);
  }
}
console.log(`\n計 ${changes} ファイル修正`);
