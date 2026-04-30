#!/usr/bin/env node
/**
 * 母子の別離 (0a93657296 / 源氏物語 薄雲巻) token.hint 第2パス。
 * pass1 (192件追加) で 40% に到達。残り助詞・接続助詞・係助詞・代名詞・動詞・副詞を
 * ルールベースで補強し、目標 50% 以上に。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', '0a93657296.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '0a93657296.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

function buildHint(tk) {
  if (tk.hint) return null;
  const g = tk.grammarTag || {};
  const text = tk.text;
  const pos = g.pos || '';
  const base = g.baseForm || '';
  const meaning = g.meaning || '';
  const form = g.conjugationForm || '';

  // ===== 薄雲巻特有語 =====
  if (text === '武隈' || text.includes('武隈')) {
    return '名詞「武隈 (たけくま)」: 陸奥の歌枕、武隈の松。明石の君と姫君の別離歌「武隈の松はふた木を都人いかがと問はばみきとこたへむ」で「みき(三木/見き)」の掛詞となる名所';
  }
  if (text === '佩刀' || text === '御佩刀') {
    return '名詞「御佩刀 (みはかし)」: 帯剣・刀。母が幼い姫君に守り刀として持たせる別離の品。';
  }
  if (text === '天児' || text === 'あまがつ') {
    return '名詞「天児 (あまがつ)」: 幼児の身代わり人形。災いを移すお守りとして枕辺に置く。母が娘に持たせる慈愛の品';
  }
  if (text === '宿世') {
    return '重要語「宿世 (すくせ)」: 前世からの因縁・運命。仏教思想に基づく古文の中心概念。母娘の別離を運命と諦観する核語';
  }
  if (text === 'かたみ') {
    return '名詞「形見 (かたみ)」: 思い出のよすが・別れの記念品。明石の君が娘との別離を「永遠の形見」と覚悟する語';
  }
  if (text === '心の闇' || text === '闇') {
    return '名詞「心の闇」: 子を思う親の盲目的な愛情。「人の親の心は闇にあらねども子を思ふ道に惑ひぬるかな」(後撰集・藤原兼輔) からの慣用語。母の動揺の核';
  }

  // ===== 重要語 =====
  if (text === 'あはれに' || text === 'あはれ' || text === 'あはれなる') {
    return '重要語「あはれなり」: しみじみと感動深い・しんみり心打たれる。古文の美意識の中心語。母娘の別離の哀感を端的に表す';
  }
  if (text === 'いみじう' || text === 'いみじき' || text === 'いみじ') {
    return '重要語「いみじ」: 程度が甚だしい (良いにも悪いにも)・たいそう。文脈で良し悪しを識別。ここは別離の悲しみが甚だしい';
  }
  if (text === 'うつくし' || text === 'うつくしき' || text === 'うつくしう') {
    return '重要古今異義語「うつくし」: かわいらしい・愛らしい (現代語「美しい」とは違う)。幼児の愛らしさを表現する核語';
  }
  if (text === 'らうたく' || text === 'らうたし' || text === 'らうたき') {
    return '重要語「らうたし」: いとおしい・かわいい・守ってやりたい。「うつくし」と類義だが「庇護したい」感情がより強い';
  }
  if (text === 'ゆかし' || text === 'ゆかしう' || text === 'ゆかしき') {
    return '重要古今異義語「ゆかし」: 〜したい (見たい・聞きたい・知りたいなど)。シク活用の願望形容詞';
  }
  if (text === 'いとほし' || text === 'いとほしき') {
    return '重要古今異義語「いとほし」: 気の毒だ・かわいそうだ (現代語「愛しい」とは違う)。慈悲・憐憫の核語';
  }
  if (text === 'はかなく' || text === 'はかなし' || text === 'はかなき') {
    return '重要語「はかなし」: ①頼りない・あっけない ②取るに足らない ③無常だ。仏教的無常観を背景にした古文中心語';
  }
  if (text === 'あぢきな' || text === 'あぢきなく' || text === 'あぢきなし') {
    return '重要語「あぢきなし」: つまらない・どうしようもない・道理に合わない。明石の君の運命への嘆きを示す';
  }
  if (text === 'こよなう' || text === 'こよなく' || text === 'こよなし') {
    return '重要語「こよなし」: この上ない・格段に。連用形「こよなう」(ウ音便) で副詞的に「格別に」';
  }

  // ===== 副詞 =====
  if (text === 'いと' && pos === '副詞') return '副詞「いと」: 非常に・たいそう。古文最頻出の程度副詞。打消を伴うと「あまり〜ない」(部分否定)';
  if (text === 'いとど') return '重要副詞「いとど」: いっそう・ますます。「いと」の強調形。状態の累加・進行';
  if (text === 'いつか') return '副詞「いつか」: ①いつ〜だろうか ②いつのまにか。文脈で識別';
  if (text === 'いかに') return '副詞「いかに」: どのように・どうして。疑問・反語・感嘆を作る';
  if (text === 'なほ') return '副詞「なほ」: やはり・依然として・それでもなお';
  if (text === 'ことに') return '副詞「ことに」: 特別に・とりわけ・格別に';
  if (text === 'かう') return '指示副詞「かう」: このように・こう。「かく」のウ音便';
  if (text === 'かく') return '指示副詞「かく」: このように・こう';
  if (text === 'さ') return '指示副詞「さ」: そのように・そう';
  if (text === 'みづから') return '副詞「みづから」: 自分で・自身で。再帰的な動作主強調';
  if (text === 'うち返し') return '副詞「うち返し」: 繰り返し・なんども';
  if (text === 'ゆらゆらと') return '副詞「ゆらゆらと」: ゆらゆら揺れる・つやつや美しく流れる。幼い姫君の御髪を形容';
  if (text === '少し' && pos === '副詞') return '副詞「少し」: わずかに・ちょっと';
  if (text === 'え' && pos === '副詞') return '重要副詞「え」: 下に打消を伴って「〜できない」(不可能)。「え〜ず／え〜じ」呼応で頻出';
  if (text === 'のち') return '名詞「後 (のち)」: あと・後日。「のちのほど」=その後の時間';

  // ===== 感動詞 =====
  if (text === '何か' && pos === '感動詞') return '感動詞「何か」: いやそうではない (反語的拒絶)・どうして〜か';
  if (text === 'あな') return '感動詞「あな」: ああ (詠嘆)。形容詞語幹に付いて「あな〜や」で感嘆';

  // ===== 動詞 =====
  if (pos === '動詞') {
    if (base === 'いふ' || base === '言ふ') return '動詞「言ふ」(ハ四): 言う';
    if (base === '思ふ') return '動詞「思ふ」(ハ四): 思う・考える・心に抱く';
    if (base === '見る') return '動詞「見る」(マ上一): 見る・面倒を見る';
    if (base === 'なる') return '動詞「なる」(ラ四): なる・成立する';
    if (text === '泣き') return '動詞「泣く」(カ四) 連用形「泣き」: 泣く';
    if (text === '待ち') return '動詞「待つ」(タ四) 連用形: 待つ';
    if (text === 'まさり') return '動詞「まさる」(ラ四) 連用形: 程度がより上回る・優れる';
    if (text === 'さまざまに') return '形容動詞「さまざまなり」連用形: さまざまに・いろいろに';
    if (text === '残ら') return '動詞「残る」(ラ四) 未然形: 残る・後に残される';
    if (text === '深み') return '名詞・形容詞語幹「深み」: 「深く積もる雪」の様子';
    return '動詞「' + (base || text) + '」: ' + (form ? form + '形。' : '') + '動作・状態を表す。';
  }

  // ===== 形容詞 =====
  if (pos === '形容詞' || pos === 'ク') {
    if (text === '白き') return '形容詞「白し」(ク) 連体形: 白い';
    if (base === 'なし') return '形容詞「なし」(ク): 無い';
    return '形容詞「' + (base || text) + '」: ' + (form ? form + '形。' : '') + (meaning || '状態を表す') + '。';
  }

  // ===== 助詞 =====
  if (pos === '格助詞') {
    if (text === 'の' && meaning === '体修') return '格助詞「の」(連体修飾): 「AのB」(所有・属性)';
    if (text === 'の' && meaning === '主格') return '格助詞「の」(主格): 「〜が」。古文では主格用法が頻出。連体修飾節の主語に多い';
    if (text === 'と' && meaning === '引用') return '格助詞「と」(引用): 「〜と思ふ・〜と言ふ」など発話・思考内容を承ける';
    if (text === 'を' && meaning === '対象') return '格助詞「を」(対象): 動作の目的を示す';
    if (text === 'に' && meaning === '対象') return '格助詞「に」(対象): 動作の対象・帰着点';
    if (text === 'に' && meaning === '場所') return '格助詞「に」(場所): 「〜に」で場所・存在の場';
    if (text === 'に' && meaning === '資格') return '格助詞「に」(資格): 「〜として・〜の資格で」';
    if (text === 'より' && meaning === '比較') return '格助詞「より」(比較): 「〜より」(基準)';
    if (text === 'が' && meaning === '体修') return '格助詞「が」(連体修飾): 「〜の」用法。古文では「が」が連体修飾を作る場合あり';
    return '格助詞「' + text + '」' + (meaning ? '(' + meaning + ')' : '') + ': 名詞と他語の関係を示す';
  }

  if (pos === '係助詞') {
    if (text === 'は' && meaning === '提示') return '係助詞「は」: 主題提示 (〜は)。対比・強意の用法もある';
    if (text === 'も' && meaning === '強意') return '係助詞「も」: 強意 (〜も)';
    if (text === 'も' && meaning === '類似') return '係助詞「も」: 類似 (〜も同様に)';
    return '係助詞「' + text + '」: 強意・係結を作る';
  }

  if (pos === '接続助詞') {
    if (text === 'て') return '接続助詞「て」: 単純接続 (〜て)。連用形接続';
    if (text === 'ば') return '接続助詞「ば」: 未然形＋ば=順接仮定、已然形＋ば=順接確定。識別必須';
    if (text === 'ど' || text === 'ども') return '接続助詞「ど・ども」: 逆接確定 (〜けれども)。已然形接続';
    if (text === 'に') return '接続助詞「に」: 連体形に接続して逆接・順接・対比を示す';
    return '接続助詞「' + text + '」: 文と文をつなぐ';
  }

  if (pos === '副助詞') {
    if (text === 'など') return '副助詞「など」: 例示 (〜など・〜たりなど)';
    if (text === 'ばかり') return '副助詞「ばかり」: 程度・限定 (〜くらい・〜だけ)';
    if (text === 'だに') return '副助詞「だに」: ①最小限 (せめて〜だけでも) ②類推 (〜さえ)';
    return '副助詞「' + text + '」: 副次的な意味を添える';
  }

  if (pos === '代名詞') {
    if (text === 'こ') return '代名詞「こ」: 近称「この」。「この〜」の語幹';
    if (text === 'わ') return '代名詞「わ」: 一人称「私・わが」。「わが」(私の) として頻出';
    return '代名詞「' + text + '」: 人・物・場所を指し示す';
  }

  if (pos === '副詞') {
    return '副詞「' + (base || text) + '」: ' + (meaning || '動作・状態を修飾') + '。';
  }

  if (pos === '感動詞') {
    return '感動詞「' + text + '」: 感動・呼びかけを表す';
  }

  return null;
}

let added = 0;
for (const s of t.sentences) {
  for (const tk of s.tokens) {
    const h = buildHint(tk);
    if (h) {
      tk.hint = h;
      added++;
    }
  }
}

let ok = true;
for (const s of t.sentences) {
  if (s.tokens.map(tk => tk.text).join('') !== s.originalText) {
    ok = false;
    console.log('MISMATCH', s.id);
  }
}

fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
fs.mkdirSync(path.dirname(distFp), { recursive: true });
fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');

const all = t.sentences.flatMap(s => s.tokens);
const totalHint = all.filter(tk => tk.hint).length;
const meaningful = all.filter(tk => (tk.layer && tk.layer > 0) || (tk.grammarTag && tk.grammarTag.pos));
const mh = meaningful.filter(tk => tk.hint).length;
console.log('Hints added:', added);
console.log('Total hints:', totalHint, '/', all.length, '=', Math.round(totalHint / all.length * 100) + '%');
console.log('Meaningful coverage:', mh, '/', meaningful.length, '=', Math.round(mh / meaningful.length * 100) + '%');
console.log('alignment ok:', ok);
