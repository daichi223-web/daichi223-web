// 東下り（宇津の山）の歌の文末「けり」を 過去→詠嘆 に是正。public/dist の texts-v3 と reading を直す。
const fs = require('fs');
const path = require('path');
const ID = 'bfa5b23cf2';
const ROOT = path.resolve(__dirname, '..');
const NEW_HINT = '助動詞「けり」(詠嘆): 和歌の結句「〜なりけり」は気づき・詠嘆「〜だったのだなあ」。地の文の伝聞過去とは区別する。';
let changes = 0;

for (const base of ['public', 'dist']) {
  // --- texts-v3: token s6-t18 の meaning 過去→詠嘆 ---
  const tv = path.join(ROOT, base, 'texts-v3', `${ID}.json`);
  if (fs.existsSync(tv)) {
    const doc = JSON.parse(fs.readFileSync(tv, 'utf8'));
    let hit = false;
    for (const s of (doc.sentences || [])) {
      for (const t of (s.tokens || [])) {
        if (t.text === 'けり' && t.grammarTag && t.grammarTag.meaning === '過去'
            && /逢はぬなりけり|うつつにも夢にも/.test(s.originalText || '')) {
          t.grammarTag.meaning = '詠嘆';
          t.hint = NEW_HINT;
          hit = true; changes++;
        }
      }
    }
    if (hit) { fs.writeFileSync(tv, JSON.stringify(doc, null, 2) + '\n'); console.log(`✔ ${base}/texts-v3/${ID}.json : 歌の文末けり 過去→詠嘆`); }
    else console.log(`- ${base}/texts-v3/${ID}.json : 対象なし`);
  }
  // --- reading: 説明文の「断定「なり」＋過去「けり」」→「…＋詠嘆「けり」」 ---
  const rd = path.join(ROOT, base, 'reading', `${ID}.json`);
  if (fs.existsSync(rd)) {
    let raw = fs.readFileSync(rd, 'utf8');
    const before = raw;
    raw = raw.replace(/断定「なり」＋過去「けり」/g, '断定「なり」＋詠嘆「けり」');
    if (raw !== before) { fs.writeFileSync(rd, raw); console.log(`✔ ${base}/reading/${ID}.json : 説明文 過去→詠嘆`); changes++; }
    else console.log(`- ${base}/reading/${ID}.json : 対象文字列なし`);
  }
}
console.log(`\n計 ${changes} 箇所を修正`);
