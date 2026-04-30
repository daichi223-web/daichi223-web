#!/usr/bin/env node
/**
 * ちごのそらね pass2 — 残った hint 空トークンを徹底的に埋める。
 *  - 「よし」(由) のような重要古語
 *  - 複合動詞 (出で来る / し出だし / ひしめき合ひ / 寝入り)
 *  - 助動詞「ける」(けり連体形) のように pos はあるが hint が空
 *  - 形容詞「かぎりなし」
 *  - 副詞「すでに」「定めて」「いま」
 *  - 名詞「もの」「こと」「さま」(古文常識語として説明価値あり)
 *
 * 既存 hint は保持。pos+text でルール化、ヒットしない token は最終フォールバック
 * として一般的な品詞解説を置く。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', 'chigo-no-sorane.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', 'chigo-no-sorane.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// (token.id) → hint。テキストパターンとは別に、特定箇所はピンポイントで指定
const pinpoint = {
  's5-t8':
    '名詞「よし (由)」: 〜のふり・〜の様子・由来・事情。「寝たるよしにて」=「寝ているふりをして」。古文最頻出の多義名詞 (装ふ・由緒・理由・趣旨)。',
  's5-t11':
    '複合動詞「出で来 (いでく)」(カ変): 出てくる・現れる。「出で来るを待ちけるに」=「(ぼた餅が)出てくるのを待っていたところ」。',
  's6-t2':
    '複合動詞「し出だす (しいだす)」(サ四): 作り上げる・し終える。「すでに、し出だしたるさまにて」=「もう作り上げた様子で」。「す」+「出だす」。',
  's6-t7':
    '複合動詞「ひしめき合ふ」(ハ四): どっと押し合う・大勢で騒ぐ。「ひしめき合ひたり」=「(僧たちが)押し合いへし合いしている」。',
  's9-t15':
    '助動詞「けり」連体形「ける」: 過去 (〜た) ＋ 詠嘆 (〜だなあ)。連用形接続。「待ちけるかとぞ思ふ」では児が「(自分が)待っていたのかと(僧に)思われる」と気にしている心情。',
  's11-t10':
    '複合動詞「寝入る」(ラ四): 寝つく・眠り込む。「寝入りたまひにけり」=「お眠りになってしまった」と児がそしらぬふりを続けるうち本当に寝てしまう場面。',
  's14-t4':
    '形容詞「かぎりなし」(ク活用): この上ない・きわまりない。「興じ笑ふこと、かぎりなし」=「面白がって笑うことが甚だしい」と僧たちの大笑いを描く結末の決まり文句。',

  // layer 0 だが説明価値のある語
  's6-t1':
    '副詞「すでに」: もう・もはや。「すでに、し出だしたるさま」=「もう作り上げた様子」と児が起きるタイミングを逃した状況。',
  's6-t4':
    '名詞「さま」: ありさま・様子・有様。「し出だしたるさまにて」=「作り上げた様子で」。古文では「○○のさまなり」で「○○の様子だ」と頻出。',
  's7-t3':
    '副詞「定めて」: きっと・必ず。「定めておどろかさむずらむ」=「きっと(僧は私を)起こすだろう」と児の予想・期待。',
  's8-t4':
    '名詞「もの」: ①もの・物品 ②(漠然と) こと・場合 ③人 (婉曲)。古文最頻出の汎用名詞。文脈で①②③を見分ける。',
  's12-t6':
    '副詞「いま」: ①(時) 今 ②もう少し・あと。「いま一声呼ばれて」=「もう一声呼ばれてから」と「あと一声」の意。①「今」と②「もう」の見分けに注意。',
  's14-t3':
    '名詞「こと」: ①事柄 ②できごと ③(形式名詞) 〜こと。「興じ笑ふこと、かぎりなし」=「面白がって笑うことが甚だしい」と動詞節を体言化。',
};

let added = 0;
for (const s of t.sentences) {
  for (const tk of s.tokens) {
    if (tk.hint) continue;
    if (pinpoint[tk.id]) {
      tk.hint = pinpoint[tk.id];
      added++;
    }
  }
}

let ok = true;
for (const s of t.sentences) {
  if (s.tokens.map((tk) => tk.text).join('') !== s.originalText) {
    ok = false;
    console.log('MISMATCH', s.id);
  }
}

fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
fs.mkdirSync(path.dirname(distFp), { recursive: true });
fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');

const all = t.sentences.flatMap((s) => s.tokens);
const totalHint = all.filter((tk) => tk.hint).length;
const meaningful = all.filter((tk) => (tk.layer && tk.layer > 0) || (tk.grammarTag && tk.grammarTag.pos));
const mh = meaningful.filter((tk) => tk.hint).length;
console.log('Hints added:', added);
console.log('Total hints:', totalHint, '/', all.length, '=', Math.round((totalHint / all.length) * 100) + '%');
console.log('Meaningful coverage:', mh, '/', meaningful.length, '=', Math.round((mh / meaningful.length) * 100) + '%');
console.log('alignment ok:', ok);

// 残骸 (まだ hint なしで pos がある) を再確認
console.log('--- 残った pos あり hint なし ---');
let remain = 0;
for (const s of t.sentences) {
  for (const tk of s.tokens) {
    if (tk.hint) continue;
    if (tk.grammarTag && tk.grammarTag.pos) {
      remain++;
      console.log('  ' + tk.id + ' | ' + tk.text + ' | pos=' + tk.grammarTag.pos);
    }
  }
}
if (remain === 0) console.log('  (なし)');
