// 車争ひ s8「悔しう何に来つらむ」の つ を 強意→完了、らむ を 現在推量→原因推量 に是正（2026-10-28）。
// 疑問語「何に」と組み、すでに来てしまったことの理由を推す＝原因推量。つ・ぬ＋原因推量らむは完了（[[kobun-tsu-nu-kakujutsu]] 2(a)）。
// public/dist の texts-v3（meaning・hint）と analysis（決め手）を直す。reading・guides は旧ラベルを含まない。
const fs = require('fs');
const path = require('path');
const ID = '364673ceb1';
const ROOT = path.resolve(__dirname, '..');
const HINT_TSU = '助動詞「つ」(完了): 連用形接続。〜た・〜てしまった。下の「らむ」は疑問語「何に」と組む原因推量で、すでに来てしまったことの理由を推し量るので、確述(強意)ではなく完了。「何に来つらむ」=いったい何のために来てしまったのだろう';
const HINT_RAMU = '助動詞「らむ」(原因推量): 終止形接続。眼前の事態の原因・理由を推量する。疑問語「何に」を受けて、すでに来ている自分の行動の理由を「何のために来てしまったのだろう」と問う。御息所の心内語の文末。';
const DECIDER = {
  meaning: '完了',
  type: '後接',
  summary: '連用形『来』＋つ＝〈完了〉。下の『らむ』は疑問語『何に』と組む原因推量で、すでに来てしまったことの理由を推し量るので、つは確述(強意)ではなく完了。『悔しう何に来つらむ』＝『悔しい、いったい何のために来てしまったのだろう』。',
  cues: [
    { text: 'らむ', type: '後接', note: '原因推量『らむ』＝すでに実現したことの理由を推す。つ・ぬ＋原因推量らむは完了。' },
    { text: '何に', type: '呼応', note: '疑問語『何に』＋らむ＝原因推量。' },
  ],
};
let changes = 0;

for (const base of ['public', 'dist']) {
  const tv = path.join(ROOT, base, 'texts-v3', `${ID}.json`);
  if (fs.existsSync(tv)) {
    const doc = JSON.parse(fs.readFileSync(tv, 'utf8'));
    for (const s of doc.sentences || []) {
      if (s.id !== 's8') continue;
      for (const t of s.tokens || []) {
        if (t.id === 's8-t25' && t.text === 'つ' && t.grammarTag.meaning === '強意') { t.grammarTag.meaning = '完了'; t.hint = HINT_TSU; changes++; }
        if (t.id === 's8-t26' && t.text === 'らむ' && t.grammarTag.meaning === '現在推量') { t.grammarTag.meaning = '原因推量'; t.hint = HINT_RAMU; changes++; }
      }
    }
    fs.writeFileSync(tv, JSON.stringify(doc, null, 2) + '\n');
    console.log(`✔ ${base}/texts-v3/${ID}.json`);
  }
  const an = path.join(ROOT, base, 'analysis', `${ID}.json`);
  if (fs.existsSync(an)) {
    const doc = JSON.parse(fs.readFileSync(an, 'utf8'));
    const t = (doc.tokenAnalyses || []).find((x) => x.tokenId === 's8-t25');
    if (t && t.decider && t.decider.meaning === '強意') { t.decider = DECIDER; changes++; }
    fs.writeFileSync(an, JSON.stringify(doc, null, 2) + '\n');
    console.log(`✔ ${base}/analysis/${ID}.json`);
  }
}
console.log(`\n計 ${changes} 箇所を修正`);
