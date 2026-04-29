#!/usr/bin/env node
/**
 * Reconstruct b34f00e739.json (大鏡 時平伝・道真伝) into canonical 31-sentence layout.
 *
 * 現状:
 *  - 31 sentences exist but content is misaligned with reading annotations:
 *    * s1 contains 9 sentences worth of intro through 「小さきはあへなむ。」
 *    * 漢詩 駅長莫驚時変改 が二度 (返り点付き + plain) 重複
 *    * 一栄一落是春秋 が独立 token
 *    * 「世継「筑紫におはします所の御門かためておはします。」が二度重複
 *    * 漢詩 都府楼纔看…観音寺只聴… が二度 (返り点付き + plain) 重複
 *    * 結語「これは、文集の…」も二度重複 (返り点付き + plain)
 *    * 「（）」 空マーカー 混入
 *
 * 修復方針:
 *  1. 全 tokens を順序通り収集
 *  2. 返り点付き重複版・空マーカー・「世継「…」 重複行を削除
 *  3. 残った tokens を annotation guide に対応する 31 sentence に再分割
 *  4. 既存の grammarTag/grammarRefId/layer は保持
 *  5. modernTranslation, learningPoints はそのまま継承
 */

const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', 'b34f00e739.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', 'b34f00e739.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// 全 token を平坦化 (sentence 区切り破棄)
const allTokens = t.sentences.flatMap(s => s.tokens.map(tk => ({ ...tk })));

// 重複・不要 token を text シーケンスで特定して削除する
// シーケンスマッチ削除: 連続する text 配列を見つけて削除
function removeSequence(tokens, sequence, startSearchIdx = 0) {
  for (let i = startSearchIdx; i <= tokens.length - sequence.length; i++) {
    let match = true;
    for (let j = 0; j < sequence.length; j++) {
      if (tokens[i + j].text !== sequence[j]) { match = false; break; }
    }
    if (match) {
      tokens.splice(i, sequence.length);
      return i; // return the index where deletion happened
    }
  }
  return -1;
}

// 削除 1: 「駅長莫|レ|驚時変改」 (返り点付き重複版)
const r1 = removeSequence(allTokens, ['駅長莫', 'レ', '驚時変改']);
if (r1 < 0) console.error('Could not find 駅長莫|レ|驚時変改 to delete');

// 削除 2: 重複した「世継「筑紫におはします所の御門かためておはします。」 (1 token)
// この単一 token は s26 にあり、s25 の最後にも分節済みの版「（世継）|﹁|筑紫|に|おはします|所|の|御|門|かため|て|おはします|。」 がある
// ⇒ 単一 token 版 (重複) を削除
const r2 = removeSequence(allTokens, ['世継「筑紫におはします所の御門かためておはします。']);
if (r2 < 0) console.error('Could not find duplicate 世継「筑紫… token to delete');

// 削除 3: 漢詩 「都府楼纔看|二|瓦色|一|観音寺只聴|二|鐘声|一」 (返り点付き重複版)
const r3 = removeSequence(allTokens, ['都府楼纔看', '二', '瓦色', '一', '観音寺只聴', '二', '鐘声', '一']);
if (r3 < 0) console.error('Could not find 都府楼纔看|二|瓦色|一|観音寺只聴|二|鐘声|一 to delete');

// 削除 4: 結語の返り点付き重複版「これ|は|、|文集|の|…|『遺愛寺鐘欹|レ|枕聴|香炉峰雪撥|レ|簾看』|と|いふ|詩|に|、|まさざまに|作ら|しめ|たまへ|り|と|こそ|、|昔|の|博士|ども|申し|けれ|。|﹂|（|）」
// この長いシーケンスを削除する。後続に同内容の plain 版 (1 token) が続く
const closingSeq = ['これ', 'は', '、', '文集', 'の', '、', '白居易', 'の', '『遺愛寺鐘欹', 'レ', '枕聴', '香炉峰雪撥', 'レ', '簾看』', 'と', 'いふ', '詩', 'に', '、', 'まさざまに', '作ら', 'しめ', 'たまへ', 'り', 'と', 'こそ', '、', '昔', 'の', '博士', 'ども', '申し', 'けれ', '。', '﹂', '（', '）'];
const r4 = removeSequence(allTokens, closingSeq);
if (r4 < 0) console.error('Could not find duplicate 結語 sequence to delete');

// 削除 5: 末尾の 「」　　　　　　　　　（時平）」 (1 token) は残す (s31 の本体)。
// 一方、s22 の単独「」も実は「」+ 後続「まことに」のための区切り — そのまま保持。

// 残った tokens の連結が canonical 本文と一致するはず
const remaining = allTokens.map(tk => tk.text).join('');
console.log('Remaining length:', remaining.length);

// 期待される canonical 本文を 31 sentences で定義
const sentenceTexts = [
  // s1: 三者紹介 (年齢の対比は左大臣 28,9 まで)
  '（世継）﹁醍醐の帝の御時、この大臣、左大臣の位にて、年いと若くておはします。菅原の大臣、右大臣の位にておはします。その折、帝、御年いと若くおはします。左右の大臣に、世の政を行ふべきよし宣旨下さしめたまへりしに、その折、左大臣、御年二十八、九ばかりなり。',
  // s2: にやおはしましけむ・せしめたまふ
  '右大臣の御年、五十七、八にやおはしましけむ。ともに世の政をせしめたまひしあひだ、',
  // s3: 道真の長所
  '右大臣は、才世にすぐれめでたくおはしまし、御心おきても、ことのほかにかしこくおはします。',
  // s4: 時平の短所 + 御おぼえ
  '左大臣は、御年も若く、才もことのほかに劣りたまへるにより、右大臣の御おぼえことのほかにおはしましたるに、',
  // s5: やすからず + さるべきにやおはしけむ
  '左大臣やすからず思したるほどに、さるべきにやおはしけむ、',
  // s6: 讒言事件 (よからぬこと出できて)
  '右大臣の御ためによからぬこと出できて、昌泰四年正月二十五日、',
  // s7: 配流 + 大臣子どもあまた
  '大宰権帥になしたてまつりて、流されたまふ。この大臣、子どもあまたおはせしに、',
  // s8: 子どもたちの運命
  '女君たちは婿とり、男君たちは皆、ほどほどにつけて位どもおはせしを、それも皆かたがたに流されたまひて悲しきに、幼くおはしける男君・女君たち慕ひ泣きておはしければ、',
  // s9: 『小さきはあへなむ』+ おほやけも許させたまひしぞかし
  '『小さきはあへなむ。』と、おほやけも許させたまひしぞかし。',
  // s10: あやにく + 東風吹かば歌
  '帝の御おきて、きはめてあやにくにおはしませば、この御子どもを、同じかたにつかはさざりけり。かたがたにいと悲しく思しめして、御前の梅の花を御覧じて、東風吹かばにほひおこせよ梅の花あるじなしとて春を忘るな',
  // s11: 亭子の帝に聞こえさせたまふ
  'また、亭子の帝に聞こえさせたまふ、',
  // s12: 流れゆく歌
  '流れゆくわれは水屑となりはてぬ君しがらみとなりてとどめよ',
  // s13: なきこと + 山崎出家
  'なきことにより、かく罪せられたまふを、かしこく思し嘆きて、やがて山崎にて出家せしめたまひて、',
  // s14: 都遠く・君が住む
  '都遠くなるままに、あはれに心細く思されて、君が住む宿のこずゑを',
  // s15: かへり見しはや + 播磨
  'ゆくゆくと隠るるまでもかへり見しはやまた、播磨の国におはしまし着きて、',
  // s16: 明石の駅・駅長
  '明石の駅といふ所に御宿りせしめたまひて、駅の長のいみじく思へるけしきを御覧じて、',
  // s17: 作らしめたまふ詩、いと悲し
  '作らしめたまふ詩、いと悲し。',
  // s18: 漢詩本文 (駅長莫驚)
  '駅長莫驚時変改一栄一落是春秋',
  // s19: 筑紫到着 + 夕べ
  'かくて、筑紫におはし着きて、ものをあはれに心細く思さるる夕べ、をちかたに所々煙立つを御覧じて、',
  // s20: 夕されば歌前半
  '夕されば野にも山にも立つ煙',
  // s21: なげきより + また雲（御覧じまで）
  'なげきよりこそ燃えまさりけれまた、雲の浮きて漂ふを御覧じ',
  // s22: て、(接続助詞 + 読点) — 極短橋渡し文
  'て、',
  // s23: 山別れ歌
  '山別れ飛びゆく雲のかへりくる影見る時はなほ頼まれぬ',
  // s24: 月日こそ + 聴衆描写 (世継引用の閉じ「」を含む)
  'さりともと、世を思しめされけるなるべし。月の明かき夜、海ならずたたへる水の底までに清き心は月ぞ照らさむこれ、いとかしこくあそばしたりかし。げに、月日こそは照らしたまはめとこそはあめれ。」まことに、おどろおどろしきことはさるものにて、かくやうの歌や詩などをいとなだらかに、ゆゑゆゑしう言ひつづけまねぶに、見聞く人々、目もあやにあさましく、あはれにもまもりゐたり。',
  // s25: もののゆゑ知りたる人
  'もののゆゑ知りたる人なども、むげに近くゐ寄りて外目せず、',
  // s26: いよいよはえて
  '見聞くけしきどもを見て、いよいよはえて、ものを繰り出だすやうに言ひつづくるほどぞ、まことに希有なるや。',
  // s27: 繁樹 + 大弐居所
  '繁樹、涙をのごひつつ興じゐたり。（世継）﹁筑紫におはします所の御門かためておはします。大弐の居所は遥かなれども、楼の上の瓦などの、心にもあらず御覧じやられけるに、',
  // s28: 観音寺
  'また、いと近く観音寺といふ寺のありければ、',
  // s29: 鐘の声
  '鐘の声を聞こしめして、作らせたまへる詩ぞかし。',
  // s30: 漢詩本文
  '都府楼纔看瓦色観音寺只聴鐘声',
  // s31: 結語 (これは...申しけれ。」（時平）)
  'これは、文集の、白居易の『遺愛寺鐘欹枕聴　香炉峰雪撥簾看』といふ詩に、まさざまに作らしめたまへりとこそ、昔の博士ども申しけれ。」　　　　　　　　　（時平）',
];

// s22 は空 — 旧構造で「」一文字だった。本来 s21 から s23 への流れに「」は出てこない。
// s22 を空にして残すと alignment が壊れるので、ここでは「」を s22 に置く案
// よりむしろ、annotation で s22 を「て」一語のみの極短文と説明している。
// 実テキストでは「て」は s21 末尾の「、」直前の「御覧じ|て|、」の「て」と思われるが、
// すでに s21 内に取り込まれている。
// 一方、旧 s22 は「」 のみ。これは 「げに、月日こそは…めとこそはあめれ。」」の最後の」を指す。
// しかしその「」も新 s24 内にすでに含めた。
// よって s22 は本当に空でしか正しく扱えない。
// 解決: s22 を「」に再定義 → でも「」は新 s24 が含むので二重になる
// もう一つの方針: s22 に意味のある内容を割り当てて annotation と整合
//   実テキストにある「」の文字を s22 に分離 → s24 から「」を抜く
// → s24 を s24+s24-extra に分け、annotation s22 「」を立てる方針

// （s22 は「て、」、s24 は「」を含む長文で確定）

// 期待される canonical 本文連結
const expectedJoined = sentenceTexts.join('');
console.log('Expected joined length:', expectedJoined.length);

if (remaining !== expectedJoined) {
  // 詳細比較
  let diffPos = 0;
  while (diffPos < Math.min(remaining.length, expectedJoined.length) && remaining[diffPos] === expectedJoined[diffPos]) {
    diffPos++;
  }
  console.error('Mismatch at position', diffPos);
  console.error('  remaining:', JSON.stringify(remaining.slice(Math.max(0, diffPos-30), diffPos+50)));
  console.error('  expected :', JSON.stringify(expectedJoined.slice(Math.max(0, diffPos-30), diffPos+50)));
  process.exit(1);
}

console.log('Canonical join matches expected. Proceeding to re-split.');

// 31 sentences に再分割
const boundaries = [];
let cumPos = 0;
for (const st of sentenceTexts) {
  cumPos += st.length;
  boundaries.push(cumPos);
}

const newSentences = sentenceTexts.map((st, i) => ({
  id: `s${i + 1}`,
  originalText: st,
  modernTranslation: '',
  tokens: [],
}));

let charPos = 0;
let sentIdx = 0;
for (const tk of allTokens) {
  const tkStart = charPos;
  const tkEnd = charPos + tk.text.length;
  charPos = tkEnd;

  while (sentIdx < boundaries.length && tkStart >= boundaries[sentIdx]) sentIdx++;
  if (sentIdx >= boundaries.length) {
    console.error(`Token "${tk.text}" beyond sentences at pos ${tkStart}`);
    continue;
  }
  const sentEnd = boundaries[sentIdx];

  if (tkEnd <= sentEnd) {
    newSentences[sentIdx].tokens.push(tk);
  } else {
    const splitOffset = sentEnd - tkStart;
    const left = { ...tk, text: tk.text.slice(0, splitOffset) };
    const right = { ...tk, text: tk.text.slice(splitOffset) };
    delete left.start; delete left.end; delete left.id;
    delete right.start; delete right.end; delete right.id;
    newSentences[sentIdx].tokens.push(left);
    let curSent = sentIdx + 1;
    let curP = sentEnd;
    let rem = right;
    while (curSent < boundaries.length && curP + rem.text.length > boundaries[curSent]) {
      const o = boundaries[curSent] - curP;
      const piece = { ...rem, text: rem.text.slice(0, o) };
      delete piece.start; delete piece.end; delete piece.id;
      newSentences[curSent].tokens.push(piece);
      curP = boundaries[curSent];
      curSent++;
      rem = { ...rem, text: rem.text.slice(o) };
    }
    if (curSent < boundaries.length && rem.text.length > 0) {
      const piece = { ...rem };
      delete piece.start; delete piece.end; delete piece.id;
      newSentences[curSent].tokens.push(piece);
    }
  }
}

// 既存 sentences の modernTranslation を新 sentences に migrate (text 一致見つからずなら空)
// 旧 sentence の originalText -> modernTranslation のマップ
const oldMTMap = {};
for (const s of t.sentences) {
  if (s.modernTranslation) oldMTMap[s.originalText] = s.modernTranslation;
}
for (const s of newSentences) {
  if (oldMTMap[s.originalText]) {
    s.modernTranslation = oldMTMap[s.originalText];
  }
}

// token id, start/end を再採番
for (const s of newSentences) {
  let p = 0;
  s.tokens = s.tokens.map((tk, i) => {
    const newTk = {
      ...tk,
      id: `${s.id}-t${i + 1}`,
      start: p,
      end: p + tk.text.length,
    };
    p += tk.text.length;
    return newTk;
  });
}

// 検証
let allOk = true;
for (const s of newSentences) {
  const concat = s.tokens.map(tk => tk.text).join('');
  if (concat !== s.originalText) {
    console.error(`MISMATCH ${s.id}:`);
    console.error(`  orig:    [${s.originalText}]`);
    console.error(`  joined:  [${concat}]`);
    allOk = false;
  }
}
if (!allOk) {
  console.error('Validation failed. Not writing.');
  process.exit(1);
}

t.sentences = newSentences;
fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');
}

const totalTokens = newSentences.reduce((n, s) => n + s.tokens.length, 0);
const totalHints = newSentences.flatMap(s => s.tokens).filter(tk => tk.hint).length;
console.log(`Fixed b34f00e739: ${newSentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
