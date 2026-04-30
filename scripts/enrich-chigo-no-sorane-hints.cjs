#!/usr/bin/env node
/**
 * ちごのそらね (chigo-no-sorane / 宇治拾遺物語 巻第一第十二) の
 * token.hint を補強する。動詞 6 件と、ついでに助動詞・形容詞・副詞・
 * 感動詞・代名詞・連体詞・格助詞・接続助詞・係助詞の空 hint も埋める。
 *
 * 既存 hint は保持。alignment は触らない。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', 'chigo-no-sorane.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', 'chigo-no-sorane.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// (sentenceId, tokenId) ベースでピンポイント指定
const hints = {
  // ===== 動詞 (ユーザー指摘の 6 件) =====
  's1-t11': '動詞「あり」(ラ変): 存在する・〜がある。ラ行変格活用「ら/り/り/る/れ/れ」。古文最頻出の存在動詞。「比叡の山に児ありけり」=「比叡山に稚児がいた」。',
  's5-t3': '動詞「寄る」(ラ四) 連用形「寄り」: 近づく・身を寄せる・もたれかかる。「片方に寄りて」=「(部屋の)片隅に身を寄せて」。',
  's7-t9': '動詞「待つ」(タ四) 連用形「待ち」: 待つ・期待する。タ行四段活用。下の「ゐる」と複合して「待ちゐる」=「待ち続けている」(継続)。',
  's7-t10': '動詞「ゐる」(ワ上一): 座る・じっとしている・(その状態で) ある。ワ行上一段「ゐ・ゐ・ゐる・ゐる・ゐれ・ゐよ」。識別頻出の特殊上一段。「待ちゐたる」=「待っている」と継続を表す。',
  's9-t14': '動詞「待つ」(タ四) 連用形「待ち」: 待つ。「待ちけるかとぞ思ふ」=「(自分は)待っていたのかと思われる」と児が(悟られないため)気にしている心情。',
  's10-t3': '動詞「呼ぶ」(バ四) 未然形「呼ば」: 呼ぶ・呼びかける。下に助動詞「る」(受身) が接続して「呼ばれて」=「呼ばれて」と受身。「いま一声呼ばれていらへむ」=「もう一声呼ばれてから返事しよう」と児の心の中の決意。',

  // ===== 助動詞 (空 7 件のうち主要なもの) =====
  // 既存 hint を確認して未指定のものだけ埋める
  // まずは pos マッチで広く打ちつつ、上書きしないため out 側で if (!tk.hint) で守る
};

// pos+text パターンによる広域埋め (hints テーブルと併用)
function buildByPattern(tk) {
  if (tk.hint) return null;
  const g = tk.grammarTag || {};
  const text = tk.text;
  const pos = g.pos || '';
  const meaning = g.meaning || '';
  const form = g.conjugationForm || '';

  // ===== 助動詞 =====
  if (pos === '助動詞') {
    if (text === 'けり') return '助動詞「けり」: 過去 (〜た) ＋ 詠嘆 (〜だなあ)。連用形接続。説話冒頭「ありけり」では伝聞過去 (誰かから聞いた昔話の合図)。';
    if (text === 'たる') return '助動詞「たり」連体形「たる」: 完了・存続 (〜た / 〜ている)。連用形接続。「寝たるよし」「待ちゐたる」など現状の様子を描く。';
    if (text === 'ぬ') {
      if (meaning === '打消') return '助動詞「ず」連体形「ぬ」: 打消 (〜ない)。未然形接続。同形の完了「ぬ」(連用形接続) と区別。';
      return '助動詞「ぬ」終止形 or 連体形: 完了「ぬ」(連用形接続、〜た/〜てしまった) または 打消「ず」連体形「ぬ」(未然形接続)。文脈で識別。';
    }
    if (text === 'ね') {
      if (meaning === '打消') return '助動詞「ず」已然形「ね」: 打消 (〜ない)。「〜ねば」=「〜ないので」。';
      return '助動詞「ぬ」命令形「ね」または「ず」已然形「ね」。文脈で識別。';
    }
    if (text === 'ず' || text === 'ざる' || text === 'ざれ' || text === 'ぬる') return '打消の助動詞「ず」: 〜ない。未然形接続。';
    if (text === 'む' || text === 'ん') return '助動詞「む」: 推量 (〜だろう)・意志 (〜しよう)・適当・婉曲・仮定など多義。一人称主語ならまず意志。「いらへむ」=「返事しよう」と児の意志。';
    if (text === 'むず' || text === 'んず' || text === 'むずる' || text === 'むずらむ') return '助動詞「むず」: 「む」と同義 (推量・意志)。「おどろかさむずらむ」=「(僧が私を)起こすつもりだろう」。';
    if (text === 'らむ') return '助動詞「らむ」: 現在推量 (今ごろ〜ているだろう)・現在の伝聞・婉曲。終止形接続 (ラ変は連体形)。';
    if (text === 'り') return '助動詞「り」: 完了・存続 (〜た / 〜ている)。サ未四已 (サ変未然・四段已然) 接続の特殊な助動詞。';
    if (text === 'る' || text === 'られ' || text === 'られる') return '助動詞「る/らる」: 受身・尊敬・自発・可能 (4 用法)。「呼ばれて」は受身 (僧から呼ばれる)。';
    if (text === 'たり' || text === 'たれ') return '助動詞「たり」: 完了 (〜た)・存続 (〜ている)。連用形接続。';
    return null;
  }

  // ===== 形容詞 =====
  if (pos === '形容詞') {
    if (text === 'うれし' || text === 'うれしく') return '重要古文単語「うれし」: 嬉しい。シク活用形容詞。現代語と同じ意味だが古文では頻出。';
    if (text === 'なし' || text === 'なき' || text === 'なく') return '形容詞「なし」(ク活用): 無い・存在しない。「〜にてもなし」=「〜でもない」。';
    return null;
  }

  // ===== 副詞 =====
  if (pos === '副詞') {
    if (text === 'いと') return '副詞「いと」: 非常に・たいそう。古文最頻出の程度副詞。打消を伴うと「あまり〜ない」(部分否定)。';
    if (text === 'たびたび') return '副詞「たびたび」: 何度も・しばしば。「たびたび呼ばれて」=「何度も呼ばれて」。';
    if (text === 'はや' || text === 'はやう') return '副詞「はや」: もう・既に・早く。';
    if (text === 'なほ') return '副詞「なほ」: やはり・依然として・それでもなお。';
    if (text === 'ただ') return '副詞「ただ」: ①ただ〜だけ ②わずかに ③本当に。';
    if (text === 'もし') return '副詞「もし」: もしも・万一。多くは仮定 (未然形＋ば) と呼応。「もし呼ばば」=「もし呼んだら」。';
    if (text === 'もぞ' || text === 'もこそ') return '係助詞連語「もぞ/もこそ」: 〜したら困るな・〜したらどうしよう、と懸念や危惧を示す。';
    return null;
  }

  // ===== 感動詞 =====
  if (pos === '感動詞') {
    if (text === 'いざ') return '感動詞「いざ」: さあ・さて (誘いかけ)。「いざ、かいもちひせむ」=「さあ、ぼた餅でも作ろう」と僧の誘いかけ。';
    if (text === 'や' || text === 'やや') return '感動詞「や/やや」: おい・もしもし (呼びかけ)。「やや」は強めの呼びかけ。';
    if (text === 'え' || text === 'えい') return '感動詞「え/えい」: ええ・はい (応答)。';
    if (text === 'はい') return '感動詞「はい」: はい (応答)。';
    if (text === 'あな') return '感動詞「あな」: ああ (詠嘆)。形容詞語幹に付いて感嘆。';
    return '感動詞「' + text + '」: 呼びかけ・応答・詠嘆を表す。';
  }

  // ===== 代名詞 =====
  if (pos === '代名') {
    if (text === 'これ') return '代名詞「これ」: ①これ (近称) ②私 (一人称・謙譲)。「これも今は昔」=「これも今となっては昔のこと」と説話の冒頭定型。';
    if (text === 'それ') return '代名詞「それ」: それ (中称)。';
    if (text === 'こ' || text === 'この') return '代名詞「こ」/連体詞「この」: 近称「この〜」。「この児」=「この稚児」。';
    return '代名詞「' + text + '」: 人・物・場所を指し示す。';
  }

  // ===== 連体詞 =====
  if (pos === '連体詞') {
    if (text === 'この') return '連体詞「この」: 「この〜」と物事を近く指す。「この児」=「この稚児」。';
    if (text === 'その') return '連体詞「その」: 「その〜」と物事を中称的に指す。';
    if (text === 'かの') return '連体詞「かの」: 「あの〜」と物事を遠称で指す。';
    return '連体詞「' + text + '」: 体言を修飾する。';
  }

  // ===== 格助詞 =====
  if (pos === '格助詞') {
    if (text === 'の') {
      if (meaning === '主格') return '格助詞「の」(主格): 「〜が」。連体修飾節中の主語を示す古文頻出用法。';
      if (meaning === '体修' || meaning === '連体修飾') return '格助詞「の」(連体修飾): 「AのB」=「AのB」(所有・属性)。';
      return '格助詞「の」: 連体修飾 (〜の) や主格 (〜が) など多義。文脈で判別。';
    }
    if (text === 'に') {
      if (meaning === '場所') return '格助詞「に」(場所): 「〜に (いる)」=存在の場を示す。';
      if (meaning === '対象') return '格助詞「に」(対象): 動作の対象・帰着点を示す。';
      if (meaning === '時間') return '格助詞「に」(時間): 「〜に」で時を示す。';
      return '格助詞「に」: 場所・時間・対象・原因など多義。文脈で判別。';
    }
    if (text === 'と') return '格助詞「と」: 引用 (〜と思ふ)・並列 (〜と〜と)・相手など。「〜とぞ思ふ」など心内発話の引用が頻出。';
    if (text === 'を') return '格助詞「を」(対象): 動作の目的を示す。';
    if (text === 'より') return '格助詞「より」: 起点・経由・比較・手段。';
    if (text === 'にて') return '格助詞「にて」: 場所・手段・状態。「〜で」。';
    return '格助詞「' + text + '」' + (meaning ? '(' + meaning + ')' : '') + ': 名詞と他語の関係を示す。';
  }

  // ===== 接続助詞 =====
  if (pos === '接続助詞') {
    if (text === 'て') return '接続助詞「て」: 単純接続 (〜て)。連用形接続。前後の動作を順に並べる。';
    if (text === 'ば') return '接続助詞「ば」: 未然形＋ば=順接仮定 (もし〜ならば)、已然形＋ば=順接確定 (〜ので)。識別必須。';
    if (text === 'ど' || text === 'ども') return '接続助詞「ど/ども」: 逆接確定 (〜けれども)。已然形接続。';
    if (text === 'に') return '接続助詞「に」: 連体形に接続して逆接・順接・対比を示す。';
    if (text === 'を') return '接続助詞「を」: 連体形に接続して逆接・順接・対比を示す。';
    if (text === 'とて') return '接続助詞「とて」: 「〜と思って・〜という理由で・〜のために」。発話・思考・目的の引用。';
    return '接続助詞「' + text + '」: 文と文をつなぐ。';
  }

  // ===== 係助詞 =====
  if (pos === '係助詞') {
    if (text === 'は') return '係助詞「は」: 主題提示 (〜は)。古文では対比・強意の用法もある。';
    if (text === 'も') return '係助詞「も」: 強意・並列・類似 (〜も)。';
    if (text === 'ぞ') return '係助詞「ぞ」: 強意。文末を連体形で結ぶ係結。';
    if (text === 'なむ') return '係助詞「なむ」: 強意。文末を連体形で結ぶ係結。終助詞「なむ」(願望) や完了+推量「なむ」と識別必須。';
    if (text === 'こそ') return '係助詞「こそ」: 強意。文末を已然形で結ぶ係結。';
    if (text === 'や' || text === 'やは') return '係助詞「や/やは」: 疑問・反語。文末を連体形で結ぶ係結。';
    if (text === 'か' || text === 'かは') return '係助詞「か/かは」: 疑問・反語。文末を連体形で結ぶ係結。';
    return '係助詞「' + text + '」: 強意・係結を作る。';
  }

  return null;
}

let added = 0;
for (const s of t.sentences) {
  for (const tk of s.tokens) {
    if (tk.hint) continue;
    // token.id は既に "s1-t11" 形式 (sentence prefix 付き)
    let h = hints[tk.id];
    if (!h) h = buildByPattern(tk);
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

// 残った 動詞 で hint なしを再確認
console.log('--- 動詞で hint がないもの (残) ---');
for (const s of t.sentences) {
  for (const tk of s.tokens) {
    if (!tk.hint && tk.grammarTag && tk.grammarTag.pos === '動詞') {
      console.log(s.id + '-' + tk.id + ' | ' + tk.text + ' | base=' + (tk.grammarTag.baseForm || ''));
    }
  }
}
