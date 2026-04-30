#!/usr/bin/env node
/**
 * 芥川 (3d0d7bf6ee / 伊勢物語 第六段) token.hint 補強。
 * 動詞は既に全件 hint 済。残るのは:
 *  - 格助詞 (17件): の / に / を / と などの一般用法
 *  - 接続助詞 (9件): て / を / に
 *  - 代名詞 (3件): 何 など
 *  - pos 空の token (主に「、」+ 単語 のトークナイザ artefact、説明価値ある複合のみ)
 *
 * pinpoint で複合語・古文常識語を埋め、pattern で助詞群を網羅。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', '3d0d7bf6ee.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '3d0d7bf6ee.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// 芥川固有の重要古語 (ピンポイント):
const pinpoint = {
  's5-t28': '名詞「あばら家・あばらや」: 荒れ果てた家・廃屋。屋根や壁が破れて隙間だらけの粗末な家。芥川の「あばらなる蔵」=「荒れ果てた蔵」と通じる、芥川物語のキーワード。',
  's5-t43': '名詞「戸口」: 家の入り口・戸のあるところ。「戸口にゐて」=「(男が)戸口にいて」と男が外で見張る場面。',
  's6-t15': '副詞句「ひと口に」: 一口で・あっさりと。「鬼ひと口に食ひてけり」=「鬼が(女を)一口で食べてしまった」と鬼に呑まれる衝撃の瞬間。',
  's10-t1': '名詞「足ずり」: 地団駄を踏むこと・足摺り。悲嘆や悔しさで足を踏みならす動作。「足ずりして泣けどもかひなし」=「地団駄踏んで泣いても無駄だ」と男の絶望。',
  's11-t1': '名詞「白玉」: 真珠 または 露の比喩。「白玉か何ぞ」=「あれは真珠でしょうか何でしょうか」と女が露を見て無邪気に尋ねる、結末の有名歌の冒頭。',
  's11-t10': '名詞「時 (とき)」: 〜のとき・場合。「と問ひし時」=「と尋ねたとき」と歌中で過去の場面を回想する用法。',
  's11-t19': '出典記載: 「(第六段)」は伊勢物語の段落番号。本文の一部ではなく編集記号。',
  's3-t11': '名詞「草」: 芥川の堤の野生植物。「草の上に置きたりける露を」=「草の上に置いていた露を」と歌に詠まれる露の場所。',
};

function buildByPattern(tk) {
  if (tk.hint) return null;
  const g = tk.grammarTag || {};
  const text = tk.text;
  const pos = g.pos || '';
  const meaning = g.meaning || '';

  // ===== 格助詞 =====
  if (pos === '格助詞') {
    if (text === 'の' && meaning === '体修') return '格助詞「の」(連体修飾): 「AのB」(所有・属性)。古文では主格 (〜が) の用法もあり、文脈で判別。';
    if (text === 'の' && meaning === '主格') return '格助詞「の」(主格): 「〜が」。連体修飾節中の主語で頻出。「鬼の食らひてけり」=「鬼が食べてしまった」。';
    if (text === 'を' && meaning === '対象') return '格助詞「を」(対象): 動作の目的を示す (〜を)。';
    if (text === 'に' && meaning === '場所') return '格助詞「に」(場所): 「〜に」で存在の場や帰着点。';
    if (text === 'に' && meaning === '対象') return '格助詞「に」(対象): 動作の対象や帰着点。';
    if (text === 'と') return '格助詞「と」: 引用 (〜と思ふ・〜と言ふ) や並列 (〜と〜)。';
    if (text === 'より') return '格助詞「より」: 起点・経由・比較・手段。';
    return '格助詞「' + text + '」' + (meaning ? '(' + meaning + ')' : '') + ': 名詞と他語の関係を示す。';
  }

  // ===== 接続助詞 =====
  if (pos === '接続助詞') {
    if (text === 'て') return '接続助詞「て」: 単純接続 (〜て)。連用形接続。';
    if (text === 'ば') return '接続助詞「ば」: 未然形＋ば=順接仮定、已然形＋ば=順接確定。識別必須。';
    if (text === 'ど' || text === 'ども') return '接続助詞「ど・ども」: 逆接確定 (〜けれども)。已然形接続。';
    if (text === 'に') return '接続助詞「に」: 連体形に接続して逆接・順接・対比を示す。';
    if (text === 'を') return '接続助詞「を」: 連体形に接続して逆接・順接・対比を示す。';
    return '接続助詞「' + text + '」: 文と文をつなぐ。';
  }

  // ===== 代名詞 =====
  if (pos === '代名詞' || pos === '代名') {
    if (text === '何' || text === 'なに') return '代名詞「何 (なに)」: 何・どんなもの。「白玉か何ぞ」=「真珠でしょうかそれとも何でしょうか」と疑問を表現。';
    if (text === 'これ') return '代名詞「これ」: ①これ (近称) ②私 (一人称・謙譲)。';
    if (text === 'かれ' || text.includes('かれ')) return '代名詞「かれ」: あれ・あの人 (遠称)。「『かれは何ぞ』となむ男に問ひける」=「『あれは何でしょうか』と男に尋ねた」。';
    return '代名詞「' + text + '」: 人・物・場所を指し示す。';
  }

  return null;
}

let added = 0;
for (const s of t.sentences) {
  for (const tk of s.tokens) {
    if (tk.hint) continue;
    let h = pinpoint[tk.id];
    if (!h) h = buildByPattern(tk);
    if (h) { tk.hint = h; added++; }
  }
}

let ok = true;
for (const s of t.sentences) {
  if (s.tokens.map(tk => tk.text).join('') !== s.originalText) ok = false;
}
fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
fs.mkdirSync(path.dirname(distFp), { recursive: true });
fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');

const all = t.sentences.flatMap(s => s.tokens);
const total = all.filter(tk => tk.hint).length;
const meaningful = all.filter(tk => (tk.layer && tk.layer > 0) || (tk.grammarTag && tk.grammarTag.pos));
const mh = meaningful.filter(tk => tk.hint).length;
console.log('Hints added:', added);
console.log('Total:', total + '/' + all.length, '(' + Math.round(total/all.length*100) + '%)');
console.log('Meaningful:', mh + '/' + meaningful.length, '(' + Math.round(mh/meaningful.length*100) + '%)');
console.log('alignment ok:', ok);
console.log('--- 残った pos あり hint なし ---');
for (const s of t.sentences) for (const tk of s.tokens) {
  if (!tk.hint && tk.grammarTag && tk.grammarTag.pos) {
    console.log(' ', tk.id, '|', tk.text, '|', tk.grammarTag.pos);
  }
}
