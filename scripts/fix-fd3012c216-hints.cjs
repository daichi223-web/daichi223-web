#!/usr/bin/env node
/**
 * 若紫の君 fd3012c216 — token.hint 拡充。
 * パターンマッチで以下のカテゴリに hint を一括付与:
 *  1. 助動詞 (なり/けり/たり/たる/たれ/つ/つる/ぬ/ぬる/む/べし/らむ/めり/ず/ざり/り/に + 受身・自発・完了・推量・断定・婉曲)
 *  2. 係助詞・副助詞 (ぞ/なむ/や/か/こそ/だに/さへ/のみ/しも/ばかり/など/もこそ)
 *  3. 敬語 (たまふ/たてまつる/きこゆ/まうす/おはす/さぶらふ/はべり/ものす/のたまふ)
 *  4. 重要動詞・変格動詞・常用動詞 (見ゆ/おぼゆ/まもる/ものす/まかる/ねびゆく etc)
 *  5. 重要古今異義語 (うつくし/らうたげ/あはれ/をかし/いみじ/すずろ/ゆかし/はかなし/うしろめたし/ののしる/ねびゆく/めやすし/心憂し/口惜し/今めかし etc)
 *
 * 既存 hint がある token はスキップ。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', 'fd3012c216.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', 'fd3012c216.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── ヒント辞書 ──
// pattern: function(tk) -> string|null
// 順に評価し、最初にヒットしたものを採用
const rules = [];

function rule(test, hint) {
  rules.push({ test, hint });
}

// 助動詞
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && (tk.grammarTag?.baseForm === 'なる' || tk.text === 'なり' || tk.text === 'なる' || tk.text === 'なれ' || tk.text === 'な' || tk.text === 'に') && tk.grammarTag?.meaning === '断定',
  '助動詞「なり」(断定): 体言・連体形に接続。「〜である・〜だ」。連用形「に」(～にあり)、終止形「なり」、連体形「なる」、已然形「なれ」。形容動詞「なり」と要識別。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '詠嘆' && (tk.text === 'けり' || tk.text === 'ける' || tk.text === 'けれ'),
  '助動詞「けり」(詠嘆): 「〜だなあ」「〜なのだったよ」。地の文末・心内語で気づきの感慨を表す。「なりけり」で「〜だったのだ」と発見の詠嘆を作る定型。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '過去' && (tk.text === 'けり' || tk.text === 'ける' || tk.text === 'けれ'),
  '助動詞「けり」(過去): 連用形接続。「〜た」(伝聞過去)。地の文の物語過去で多用。終止「けり」連体「ける」已然「けれ」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '過去' && (tk.text === 'し' || tk.text === 'しか'),
  '助動詞「き」(過去): 連用形接続。直接体験の過去「〜た」。連体「し」已然「しか」。「けり」の伝聞過去と対比される。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '存続' && (tk.text === 'たる' || tk.text === 'たり' || tk.text === 'たれ' || tk.text === 'たら'),
  '助動詞「たり」(存続): 連用形接続。「〜ている・〜てある」。完了「たり」と同形だが、文脈で「状態の継続」と「動作の完了」を読み分ける。連体「たる」已然「たれ」未然「たら」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '完了' && (tk.text === 'たる' || tk.text === 'たり' || tk.text === 'たれ' || tk.text === 'たら'),
  '助動詞「たり」(完了): 連用形接続。「〜た・〜てしまった」。同形の存続「たり」と文脈識別。心情・知覚動詞には完了が多い。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '存続' && (tk.text === 'り' || tk.text === 'る' || tk.text === 'れ'),
  '助動詞「り」(存続): サ変未然・四段已然に接続(さみしいり)。「〜ている」。「立てり」=「立っている」、「たまへり」=「お〜になっている」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '完了' && (tk.text === 'つ' || tk.text === 'つる' || tk.text === 'つれ'),
  '助動詞「つ」(完了): 連用形接続。意図的・他動的動作の完了「〜てしまった」。連体「つる」已然「つれ」。「ぬ」(自然な変化の完了)と対比。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '完了' && (tk.text === 'ぬ' || tk.text === 'ぬる' || tk.text === 'ぬれ' || tk.text === 'な' || tk.text === 'に'),
  '助動詞「ぬ」(完了): 連用形接続。自発・自然な変化の完了「〜てしまった」。連体「ぬる」已然「ぬれ」未然「な」連用「に」。打消「ず」連体「ぬ」と要識別。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '推量' && (tk.text === 'む' || tk.text === 'ん'),
  '助動詞「む」(推量): 未然形接続。基本義は「〜だろう」(推量)。主語が一人称なら意志「〜よう」、二人称なら勧誘「〜しなさい」、連体形で婉曲「〜ような」、仮定「〜なら」と多義。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '意志' && (tk.text === 'む' || tk.text === 'ん'),
  '助動詞「む」(意志): 未然形接続+主語一人称で「〜よう」。「見ばや」「見む」など願望表現と隣接して源氏の決意を示す。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '婉曲' && (tk.text === 'む' || tk.text === 'ん'),
  '助動詞「む」(婉曲): 連体形+体言で「〜ような」。「ねびゆかむさま」=「成長していくであろう様子」。直接断定を避けやわらげる用法。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '推量' && (tk.text === 'べし' || tk.text === 'べき' || tk.text === 'べく' || tk.text === 'べけれ' || tk.text === 'べう'),
  '助動詞「べし」(推量): 終止形(ラ変は連体形)接続。推量「〜にちがいない」が中心義で、当然「〜はずだ」、可能「〜できる」、義務「〜べきだ」、適当「〜のがよい」、命令と多義。「べう」は「べく」のウ音便。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '当然' && (tk.text === 'べし' || tk.text === 'べき' || tk.text === 'べく' || tk.text === 'べう'),
  '助動詞「べし」(当然・可能): ここでは「〜はずだ・〜できる」。「似るべうもあらず」=「似ているはずもない・比べものにならない」と程度の隔絶を表す慣用句。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === 'らむ' && (tk.text === 'らむ' || tk.text === 'らん'),
  '助動詞「らむ」(現在推量): 終止形(ラ変は連体形)接続。「(今頃)〜しているだろう」と眼前にない現在の事態を推量。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '推定' && (tk.text === 'めり' || tk.text === 'める' || tk.text === 'めれ'),
  '助動詞「めり」(視覚推定): 終止形(ラ変は連体形)接続。「〜のように見える・〜らしい」。垣間見の場面に頻出し、源氏の視点を示す。連体「める」已然「めれ」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '婉曲' && (tk.text === 'める'),
  '助動詞「めり」(婉曲): 連体形「める」で「〜のような」と婉曲断定。「人言ふめる」=「人が言うようだ」と他人の発言を控えめに引く。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '打消' && (tk.text === 'ず' || tk.text === 'ぬ' || tk.text === 'ね' || tk.text === 'ざり' || tk.text === 'ざる' || tk.text === 'ざれ' || tk.text === 'ざら'),
  '助動詞「ず」(打消): 未然形接続。「〜ない」。連用「ず」、終止「ず」、連体「ぬ」、已然「ね」、補助活用「ざら/ざり/ざる/ざれ」。完了「ぬ」連体形と要識別 (「ぬ」は連用接続)。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '受身' && (tk.text === 'る' || tk.text === 'るる' || tk.text === 'るれ' || tk.text === 'れ' || tk.text === 'られ' || tk.text === 'らるる'),
  '助動詞「る/らる」(受身): 「〜される」。四段・ラ変・ナ変未然に「る」、それ以外に「らる」。受身/自発/可能/尊敬の四義は文脈で判別。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '自発' && (tk.text === 'る' || tk.text === 'るる' || tk.text === 'るれ' || tk.text === 'れ'),
  '助動詞「る」(自発): 「自然と〜される・つい〜してしまう」。心情・知覚動詞 (思ふ・案ず・嘆く・しのぶ・まもる) に付くと自発が多い。「まもらるる」=「自然と見入ってしまう」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && (tk.grammarTag?.meaning === '不可能' || tk.grammarTag?.meaning === '打消推量') && (tk.text === 'まじき' || tk.text === 'まじ' || tk.text === 'まじく'),
  '助動詞「まじ」(打消推量): 終止形(ラ変連体)接続で「べし」の打消。「〜ないだろう・〜できない・〜してはならない」と多義。「さるまじき人」=「そうあるはずもない人・縁のないはずの人」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '助動詞' && tk.grammarTag?.meaning === '比況',
  '助動詞「ごとし/やうなり」(比況): 「〜のようだ」。直前の語(連体形+「が」「の」)と並べて比喩・例示を作る。',
);

// 係助詞・副助詞・終助詞
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'ぞ',
  '係助詞「ぞ」: 強意。結びは連体形 (係り結び)。訳出は不要。「童べぞ遊ぶ」「涙ぞ落つる」のように主題＋強調を作る。',
);
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'なむ',
  '係助詞「なむ」: 強意。結びは連体形。「〜こそ〜だ」のニュアンスで主題を立てる。終助詞「なむ」(他者願望、未然接続)と要識別。',
);
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'や' && tk.grammarTag?.meaning === '疑問',
  '係助詞「や」(疑問): 結びは連体形。「〜か」と疑問を作る。文末の「にやあらむ」は「〜であろうか」と推量と結合した定型。',
);
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'や' && tk.grammarTag?.meaning === '反語',
  '係助詞「や」(反語): 結びは連体形。「〜だろうか、いや〜ない」と裏返しの主張。文脈で疑問か反語かを判定。',
);
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'か',
  '係助詞「か」(疑問・反語): 結びは連体形。「〜か・〜だろうか」。「いづ方へかまかりぬる」のように疑問詞と呼応する。',
);
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'こそ',
  '係助詞「こそ」: 強意。結びは已然形 (係り結び)。「〜こそ〜だ」。文末已然+ど(「こそ〜已然形、…」)で逆接の余情を作ることもある。',
);
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'は',
  '係助詞「は」: 主題提示・対比。「他と違って〜は」のニュアンス。「人々は帰したまひて」のように他のグループとの対比を作る。',
);
rule(
  (tk) => tk.grammarTag?.pos === '係助詞' && tk.text === 'も',
  '係助詞「も」: 並立・類似・強調。「〜も同じく」「〜さえも」。否定文では「〜も…ない」と全否定を作る (「似るべうもあらず」)。',
);
rule(
  (tk) => tk.grammarTag?.pos === '副助詞' && tk.text === 'だに',
  '副助詞「だに」: 「〜さえ」。「軽い事項さえそうなのだから、まして重い事項は」と類推 (累加) を導く。「立ち出づるだに」=「外出することさえ」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '副助詞' && tk.text === 'のみ',
  '副助詞「のみ」: 限定「〜だけ」。動作の専一を強調する。「ありきをのみして」=「うろつくことばかりして」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '副助詞' && tk.text === 'さへ',
  '副助詞「さへ」: 添加「〜までも」。既にある事に加えてさらに別の事が加わる累加。「だに」(類推)と用法が違う。',
);
rule(
  (tk) => tk.grammarTag?.pos === '副助詞' && tk.text === 'しも',
  '副助詞「しも」: 強意「特に〜・ちょうど〜」。語の指示性を強める。「西面にしも」=「ほかでもなく西面に」。「今日しも」=「ほかでもなく今日」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '副助詞' && tk.text === 'ばかり',
  '副助詞「ばかり」: 程度・限定「〜くらい・〜だけ」。「四十余ばかり」「十ばかり」のように年齢・数量に頻出。',
);
rule(
  (tk) => tk.grammarTag?.pos === '副助詞' && (tk.text === 'など' || tk.text === 'なんど'),
  '副助詞「など」: 例示・婉曲「〜など・〜のような」。直接的指示を避け列挙する。「山吹などの」=「山吹襲などの」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '終助詞' && tk.text === 'かな',
  '終助詞「かな」: 詠嘆「〜だなあ」。連体形+「かな」が標準。心内描写で頻出 (「あはれなる人を見つるかな」)。',
);
rule(
  (tk) => tk.grammarTag?.pos === '終助詞' && tk.text === 'ばや',
  '終助詞「ばや」: 自己願望「〜したい」。未然形接続。「明け暮れの慰めにも見ばや」=「朝晩の慰めに見たい」と源氏の願望を示す。',
);
rule(
  (tk) => tk.grammarTag?.pos === '終助詞' && tk.text === 'なむ',
  '終助詞「なむ」: 他者への願望「〜してほしい」。未然形接続。係助詞「なむ」(連用接続+連体結び・強意)と要識別。',
);
rule(
  (tk) => (tk.grammarTag?.pos === '間投助詞' || tk.grammarTag?.pos === '終助詞') && tk.text === 'や',
  '間投助詞「や」: 詠嘆・呼びかけ「〜よ・〜なあ」。「あな幼や」「をかしの御髪や」のように感動の余韻を添える。',
);
rule(
  (tk) => tk.grammarTag?.pos === '終助詞' && tk.text === 'よ',
  '終助詞「よ」: 詠嘆・呼びかけ。「ほどよ」「見るよ」のように動作・状態を強調して締める。',
);
rule(
  (tk) => tk.grammarTag?.pos === '接続助詞' && tk.text === 'ば',
  '接続助詞「ば」: 未然形+ば=順接仮定「もし〜なら」、已然形+ば=順接確定「〜ので・〜と」。形で意味が変わるので接続形を確認。',
);
rule(
  (tk) => tk.grammarTag?.pos === '接続助詞' && tk.text === 'ど',
  '接続助詞「ど」(逆接確定): 已然形接続「〜けれども」。「やせたれど」=「やせているけれども」。「ども」とほぼ同義。',
);
rule(
  (tk) => tk.grammarTag?.pos === '接続助詞' && tk.text === 'ものを',
  '接続助詞・終助詞「ものを」: 逆接「〜のに」。文末では詠嘆的逆接の余情「〜なのになあ」。「籠めたりつるものを」=「閉じ込めておいたのに」と若紫の口惜しさを表す。',
);
rule(
  (tk) => tk.grammarTag?.pos === '接続助詞' && tk.text === 'で',
  '接続助詞「で」(打消接続): 未然形接続「〜ないで」。「ず+て」の融合形。「思したらで」=「お思いにならないで」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '接続助詞' && tk.text === 'つつ',
  '接続助詞「つつ」: 連用形接続。動作の反復・継続「〜しながら・〜しては」。「かきなでつつ」=「撫でながら」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '接続助詞' && tk.text === 'を',
  '接続助詞「を」: 連体形接続「〜のに・〜が・〜ところ」。逆接・順接・単純接続の三通りで文脈判断。格助詞「を」と要識別。',
);

// 補助動詞・敬語
rule(
  (tk) => tk.grammarTag?.baseForm === 'たまふ' && tk.grammarTag?.honorific === '尊敬',
  '尊敬の補助動詞「たまふ」(四段): 「〜なさる・お〜になる」。地の文では尊敬の対象を特定する目印 (源氏・尼君・僧都など)。下二段「たまふ」(謙譲) と要識別。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'たてまつる',
  '謙譲の補助動詞「たてまつる」: 「お〜申し上げる」。本動詞では「差し上げる」(献上の謙譲)。「持仏すゑたてまつりて」=「持仏を据え申し上げて」と尼君から仏への謙譲。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'きこゆ' || (tk.text === 'きこゆる' && tk.grammarTag?.pos?.includes('補')) || tk.text === 'きこえ',
  '謙譲の補助動詞「きこゆ」: 「お〜申し上げる」。「心を尽くしきこゆる人」=「心を尽くし申し上げる人」(藤壺への敬意)。本動詞では「申し上げる」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'はべり' || tk.text === 'はべる' || tk.text === 'はべら' || tk.text === 'はべり',
  '丁寧の補助動詞「はべり」: 「〜です・〜ます・〜ございます」。本動詞では「あり」「居り」の丁寧語。会話文で話し相手への配慮を示す。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'おはす' || tk.grammarTag?.baseForm === 'おはします',
  '尊敬動詞「おはす/おはします」: 「あり/居り/行く/来」の尊敬語「いらっしゃる」。「おはします」はさらに高い最高敬語で、尼君など主要人物に用いる。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'のたまふ',
  '尊敬動詞「のたまふ」: 「言ふ」の尊敬語「おっしゃる」。直接話法+「のたまへば」の組み合わせで頻出。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'ものす',
  '婉曲動詞「ものす」(サ変): 「あり/行く/来/言ふ」など具体動詞の代用「〜なさる」。直接表現を避け敬意を含むことが多い。「ものしたまふ」=「(ご様子で)いらっしゃる」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'まうづ' || tk.text === 'まうで',
  '謙譲動詞「まうづ」(下二): 「行く・来」の謙譲語「参上する・伺う」。「御とぶらひにもまうでざりける」=「お見舞いにも参上しなかった」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'まかる',
  '謙譲動詞「まかる」(四段): 貴所からの「退出する・行く」の謙譲。「いづ方へかまかりぬる」では雀を擬人化して「どこへ行ってしまったのか」と問う。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'おぼす' || tk.text === '思す' || tk.text === '思し',
  '尊敬動詞「おぼす」: 「思ふ」の尊敬語「お思いになる」。源氏・貴人の心理動作に専用。',
);

// 重要古今異義語・形容詞
rule(
  (tk) => tk.grammarTag?.baseForm === 'うつくし' || (tk.grammarTag?.pos === '形容詞' && (tk.text === 'うつくし' || tk.text === 'うつくしき' || tk.text === 'うつくしう' || tk.text === 'うつくしから' || tk.text === 'うつくしかり')),
  '重要語「うつくし」(シク活用): 古文では「かわいい・愛らしい」(幼い者・小さい物への愛情)。現代語の「美しい(beautiful)」とは違う。「いみじううつくし」=「とてもかわいらしい」。',
);
rule(
  (tk) => tk.text === 'うつくしげなる' || tk.text === 'うつくしげに',
  '重要語「うつくしげなり」: 「かわいらしい様子だ・愛らしげだ」。形容詞「うつくし」+接尾語「げ」+「なり」の複合。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'らうたし' || tk.text === 'らうたげに' || tk.text === 'らうたげなり',
  '重要語「らうたし/らうたげなり」: 「いとおしい・かわいくていじらしい」。庇護したくなる対象への愛情を表す。「うつくし」より保護欲を含む含蓄が強い。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'あはれ' || (tk.text.startsWith('あはれ') && (tk.grammarTag?.pos === '動詞' || tk.grammarTag?.pos === '形容詞' || tk.grammarTag?.pos === '形容動詞' || tk.grammarTag?.pos === '名詞')),
  '重要語「あはれ」: しみじみとした感動の総称。「もののあはれ」の中心語。哀感だけでなく深い感動・愛情・しみじみとした共感を広く含む。「あはれに見たまふ」=「しみじみとご覧になる」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'をかし' || tk.text === 'をかし' || tk.text === 'をかしう' || tk.text === 'をかしき' || tk.text === 'をかしの',
  '重要語「をかし」(シク活用): 「趣がある・興味深い・かわいらしい」。明るく知的な美的評価で、しみじみ感じる「あはれ」と対比される。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'いみじ' || tk.text === 'いみじ' || tk.text === 'いみじき' || tk.text === 'いみじう' || tk.text === 'いみじく',
  '重要語「いみじ」(シク活用): 「程度がはなはだしい」。良い意味なら「すばらしい」、悪い意味なら「ひどい・恐ろしい」と両義。文脈で正負を判断。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'ゆかし' || tk.text === 'ゆかし' || tk.text === 'ゆかしき',
  '重要語「ゆかし」(シク活用): 「見たい・知りたい・聞きたい」。憧憬・好奇心を表す。「ねびゆかむさまゆかし」=「成長していく姿を見たい」と源氏の関心を示す。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'すずろなり' || tk.text === 'すずろに' || tk.text === 'すずろなる',
  '重要語「すずろなり/そぞろなり」: 「わけもなく・なんとなく・思いがけず」。「すずろに悲し」=「わけもなく悲しい」と感情の自然発生を表す。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'はかなし' || tk.text === 'はかなく' || tk.text === 'はかなう' || tk.text === 'はかなき',
  '重要語「はかなし」(ク活用): 「頼りない・ちょっとした・幼稚だ」。物事の脆さや幼さを評価する語で、現代語の「儚い」より広い。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'うしろめたし' || tk.text === 'うしろめたけれ' || tk.text === 'うしろめたく',
  '重要語「うしろめたし」(ク活用): 「気がかりだ・心配だ」。後の事が見届けられない不安を表す。現代語「後ろめたい(罪悪感)」とは違う。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'ねびゆく' || tk.text === 'ねびゆか' || tk.text === 'ねびゆく',
  '重要語「ねびゆく」(カ四): 「成長していく・年を重ねていく」。少女が大人びていく経過に用いる。「ねびゆかむさま」=「成長後の姿」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'めやすし' || tk.text === 'めやすき' || tk.text === 'めやすく',
  '重要語「めやすし」(ク活用): 「見苦しくない・感じが良い・好ましい」。「目安し」=「目に安らかに映る」が語源。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'ののしる' || tk.text === 'ののしり' || tk.text === 'ののしる',
  '重要語「ののしる」(ラ四): 「大評判である・大騒ぎする」。現代語の「悪口を言う」とは違う。「ののしりたまふ光源氏」=「世間で大評判の光源氏」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'いはけなし' || tk.text === 'いはけなく' || tk.text === 'いはけなき',
  '重要語「いはけなし」(ク活用): 「幼い・あどけない・無邪気だ」。「童げ」と同系で、まだ大人びていない子供の様子を表す。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'あて' || tk.text === 'あてに' || tk.text === 'あてなる',
  '重要語「あてなり」(ナリ活用): 「上品だ・高貴だ」。容貌・人柄の評価語。現代語「当て」とは無関係。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === '今めかし' || tk.text === '今めかしき' || tk.text === '今めかしく',
  '重要語「今めかし」(シク活用): 「当世風だ・現代的だ・あか抜けて見える」。古めかし(古風だ)の対義語。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'なやまし' || tk.text === 'なやましげに' || tk.text === 'なやましげなる',
  '重要語「なやまし」: 「病気で苦しい・気分が悪い」。現代語「悩ましい(セクシー)」とは違う。「なやましげに」=「苦しそうに」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === '心づきなし' || tk.text === '心づきなけれ' || tk.text === '心づきなく',
  '重要語「心づきなし」(ク活用): 「気に食わない・不愉快だ・好ましくない」。「心」+「つく」(心が向かう)+「無し」で「心が惹かれない」が原義。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === '口惜し' || tk.text === '口惜し' || tk.text === '口惜しき' || tk.text === '口惜しう',
  '重要語「口惜し」(シク活用): 「残念だ・くやしい・期待はずれだ」。現代語の「悔しい」より広い失望感も含む。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === '心憂し' || tk.text === '心憂く' || tk.text === '心憂し',
  '重要語「心憂し」(ク活用): 「情けない・つらい・嫌だ」。心が痛む不快感を表す。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'きよげ' || tk.text === 'きよげなる' || tk.text === 'きよげに',
  '重要語「きよげなり」(ナリ活用): 「こざっぱりして感じが良い・小ぎれいだ」。「きよら」(高貴な美しさ) より一段控えめな美的評価。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'まもる' || tk.text === 'まもら' || tk.text === 'まもり' || tk.text === 'うちまもり' || tk.text === 'うちまもる',
  '重要語「まもる」(ラ四): 「じっと見つめる・凝視する」。現代語「守る(防御)」とは違う。「まもらるる」=「自然と見入ってしまう」と自発の助動詞「る」と結合。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'おぼゆ' || tk.text === 'おぼえ' || tk.text === 'おぼゆる',
  '重要語「おぼゆ」(ヤ下二): 「自然と思われる・似る・記憶される」。「思ふ」の自発化。「少しおぼえたるところ」=「(尼君に)少し似ているところ」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'おくる' || tk.text === 'おくれ' || tk.text === 'おくらす',
  '重要語「おくる(後る)」(ラ下二): 「先立たれる・取り残される」。生死の文脈で「死別する」の意。「殿におくれたまひし」=「父君に先立たれなさった」。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'いふかひなし' || tk.text === '言ふかひなう' || tk.text === '言ふかひなき',
  '重要語「言ふかひなし」(ク活用): 「言っても仕方ない・どうしようもない・取り柄がない」。「あきれた」のニュアンスで嘆きを表す。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'ただ人' || tk.text === 'ただ人',
  '重要語「ただ人」: 「普通の人・身分の高くない一般人」。本作「ただ人と見えず」=「普通の人には見えない→身分の高い人」と尼君の貴さを示唆する反語的表現。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === '生ひ先' || tk.text === '生ひ先',
  '重要語「生ひ先」: 「将来・成人後の姿・行く末」。容貌の評価で「生ひ先見えて」=「将来の美しさが予見されて」と源氏の「面影の恋」の伏線に。',
);
rule(
  (tk) => tk.grammarTag?.baseForm === 'ありか' || tk.text === 'ありか',
  '重要語「ありか」: 「居場所・住み処」。「生ひ立たむありかも知らぬ若草」=「成長するであろう住処も分からない若草」と尼君が孫の行く末を案じる。',
);

// 動詞型 (重要なもののみ)
rule(
  (tk) => (tk.grammarTag?.conjugationType === 'カ変' || tk.grammarTag?.baseForm === '来' || tk.grammarTag?.baseForm === 'く' || tk.grammarTag?.baseForm === 'いでく') && tk.grammarTag?.pos?.includes('動'),
  'カ変動詞: 「来」一語のみ (派生に「出で来」)。未然「こ」連用「き」終止「く」連体「くる」已然「くれ」命令「こ・こよ」。',
);
rule(
  (tk) => tk.grammarTag?.conjugationType === 'サ変' && tk.grammarTag?.pos?.includes('動'),
  'サ変動詞「す」/「おはす」: 未然「せ」連用「し」終止「す」連体「する」已然「すれ」命令「せよ」。「ものす」「念ず」など複合語も多い。',
);
rule(
  (tk) => tk.grammarTag?.conjugationType === 'ナ変' && tk.grammarTag?.pos?.includes('動'),
  'ナ変動詞「死ぬ・往ぬ」: 未然「な」連用「に」終止「ぬ」連体「ぬる」已然「ぬれ」命令「ね」。完了「ぬ」と区別が必要。',
);
rule(
  (tk) => tk.grammarTag?.conjugationType === 'ラ変' && tk.grammarTag?.pos?.includes('動'),
  'ラ変動詞「あり/居(を)り/侍り/いまそかり」: 未然「ら」連用「り」終止「り」(他動詞「ウ」段でなく) 連体「る」已然「れ」命令「れ」。連体形が終止形扱いの接続を持つ点に注意。',
);

// 副詞・接続詞
rule(
  (tk) => tk.text === 'いと' && tk.grammarTag?.pos === '副詞',
  '副詞「いと」: 「たいそう・とても・非常に」。打消を伴うと「あまり〜ない・たいして〜ない」と程度の打消に転じる。',
);
rule(
  (tk) => tk.text === 'いみじく' || tk.text === 'いみじう',
  '副詞用法「いみじく/いみじう」: 形容詞「いみじ」連用形で「ひどく・たいそう・はなはだしく」と程度の修飾に立つ。',
);
rule(
  (tk) => tk.text === 'やうやう' && tk.grammarTag?.pos === '副詞',
  '副詞「やうやう」: 「だんだん・しだいに・ようやく」。枕草子「春はあけぼの」冒頭「やうやう白くなりゆく」と同義。',
);
rule(
  (tk) => tk.text === 'なかなか' && tk.grammarTag?.pos === '副詞',
  '副詞「なかなか」: 「かえって・むしろ」(逆説)。「なかなか長きよりも〜今めかし」=「かえって長いのよりも〜当世風だ」と中間的評価を反転する。',
);
rule(
  (tk) => tk.text === 'いかで' && tk.grammarTag?.pos === '副詞',
  '副詞「いかで」: 「どうして・どうやって・なんとかして」。疑問・反語・希望の三義。「いかで世におはせむ」=「どうやって生きていけよう (反語)」。',
);
rule(
  (tk) => tk.text === 'さすがに',
  '副詞「さすがに」: 「そうはいってもやはり・とはいえ」。逆説的な譲歩を示す。「幼心地にもさすがに」=「幼い心にもさすがに」と幼さなりの感受性を肯定。',
);
rule(
  (tk) => tk.text === 'げに',
  '重要語「げに」(副詞): 「本当に・なるほど・実に」。同意・納得の応答。',
);
rule(
  (tk) => tk.text === 'たまさかに',
  '副詞「たまさかに」: 「たまに・偶然に・思いがけなく」。「たまさかに立ち出づるだに」=「偶然外出することさえ」。',
);
rule(
  (tk) => tk.text === 'かく',
  '副詞「かく」: 「このように・こう」。直前の話題を受けて指示する。「かかる」「かかれば」など複合多数。',
);

// 格助詞 (重要なもののみ — 多すぎるので主要なもの)
rule(
  (tk) => tk.grammarTag?.pos === '格助詞' && tk.text === 'の' && tk.grammarTag?.meaning === '主格',
  '格助詞「の」(主格): 連体修飾節の主語を示す「〜が」。「源氏の中将の、…ものしたまひける」=「源氏の中将が、いらっしゃった」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '格助詞' && tk.text === 'の' && tk.grammarTag?.meaning === '同格',
  '格助詞「の」(同格): 「〜で・〜であって」。前後の体言を同一物として並べる。「夕暮れのいたう霞みたる」=「夕暮れで、たいそう霞んでいるところ」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '格助詞' && tk.text === 'が' && tk.grammarTag?.meaning === '主格',
  '格助詞「が」(主格): 連体修飾節内・会話文での主語を示す「〜が」。「犬君が逃がしつる」=「犬君が逃がしてしまった」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '格助詞' && tk.text === 'と' && tk.grammarTag?.meaning === '引用',
  '格助詞「と」(引用): 「〜と(言う・思う)」。直接話法・心内語の終わりに付き、続く動詞「言ふ・思ふ・聞く」につながる。',
);
rule(
  (tk) => tk.grammarTag?.pos === '格助詞' && tk.text === 'とて',
  '格助詞「とて」(引用+原因): 「〜と言って・〜と思って」。発話・思考を示し次の動作を導く。「『〜』とて〜」が源氏物語の典型的な会話導入。',
);
rule(
  (tk) => tk.grammarTag?.pos === '格助詞' && tk.text === 'を' && tk.grammarTag?.meaning === '対象',
  '格助詞「を」(対象): 動作の直接対象を示す「〜を」。接続助詞「を」(連体形接続・順接/逆接) と区別する。',
);
rule(
  (tk) => tk.grammarTag?.pos === '格助詞' && tk.text === 'より' && tk.grammarTag?.meaning === '比較',
  '格助詞「より」(比較): 「〜より」(比較の起点)。「長きよりも今めかし」=「長いのよりも当世風だ」。',
);

// generic 動詞: 重要動詞のみピンポイント
rule(
  (tk) => tk.grammarTag?.pos === '動詞' && tk.grammarTag?.baseForm === 'なる' && tk.grammarTag?.conjugationType === 'ラ四',
  '動詞「なる」(ラ四): 「(状態に)なる」。「やうやうなりつる」=「だんだん馴れてきた」、「かばかりになれば」=「これくらい(の年齢)になると」。',
);
rule(
  (tk) => tk.grammarTag?.pos === '動詞' && tk.grammarTag?.baseForm === '見ゆ' || tk.text === '見え' || tk.text === '見ゆ' || tk.text === '見ゆる',
  '重要語「見ゆ」(ヤ下二): 「見える・(自然と)目に映る」。受身的な「見られる」、「(ある人物として)見える=思われる」、「(人前に)姿を現す」も含む多義語。',
);

// ── 適用 ──
let applied = 0;
const tokens = t.sentences.flatMap((s) => s.tokens);
for (const tk of tokens) {
  if (tk.hint) continue;
  for (const r of rules) {
    if (r.test(tk)) {
      tk.hint = r.hint;
      applied++;
      break;
    }
  }
}

// 検証
let allOk = true;
for (const s of t.sentences) {
  const concat = s.tokens.map((tk) => tk.text).join('');
  if (concat !== s.originalText) {
    console.error(`MISMATCH ${s.id}: orig=[${s.originalText}] joined=[${concat}]`);
    allOk = false;
  }
}
if (!allOk) {
  console.error('Validation failed.');
  process.exit(1);
}

// カバレッジ
const allTokens = t.sentences.flatMap((s) => s.tokens);
const meaningful = allTokens.filter((tk) => tk.layer > 0 || tk.grammarTag?.pos);
const withHint = meaningful.filter((tk) => tk.hint).length;
const totalHint = allTokens.filter((tk) => tk.hint).length;

fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');
}

console.log(`Applied ${applied} new hints`);
console.log(`Total hints: ${totalHint} (meaningful coverage: ${withHint}/${meaningful.length} = ${Math.round((withHint / meaningful.length) * 100)}%)`);
