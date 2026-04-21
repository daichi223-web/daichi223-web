#!/usr/bin/env node
/**
 * add-vocab-batch2.js
 *
 * Adds 39 new vocabulary words (22 adverbs + 17 polysemy words) to kobun_q.jsonl.txt.
 * Starting from group=331, word_idx=332, meaning_idx=635
 * (continuing from current max: group=330, word_idx=331, meaning_idx=634)
 */

const fs = require('fs');
const path = require('path');

// --- Configuration ---
const PUBLIC_FILE = path.join(__dirname, '..', 'public', 'kobun_q.jsonl.txt');
const DATA_FILE = path.join(__dirname, '..', 'data', 'kobun_q.jsonl.txt');

let currentGroup = 330;
let currentWordIdx = 331;
let currentMeaningIdx = 634;

function nextGroup() {
  currentGroup++;
  currentWordIdx++;
  return { group: currentGroup, word_idx: currentWordIdx };
}

function nextMeaning() {
  currentMeaningIdx++;
  return currentMeaningIdx;
}

function entry(lemma, group, sub, word_idx, meaning_idx, sense, examples) {
  return JSON.stringify({
    qid: `${group}-${sub}`,
    lemma,
    group,
    sub,
    word_idx,
    meaning_idx,
    sense: `〔 ${sense} 〕`,
    examples: examples || []
  });
}

const lines = [];

// ============================================================
// ADVERBS (22 words)
// ============================================================

// 1. あいなく
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("あいなく", group, 1, word_idx, nextMeaning(), "わけもなく", [{ jp: "上達部・上人なども、あいなく目をそばめつつ、いとまばゆき人の御おぼえなり。（源氏物語）", translation: "（訳）公卿も殿上人も、〔 わけもなく 〕目をそらして、大変まぶしいほどのご寵愛ぶりだ。" }]));
  lines.push(entry("あいなく", group, 2, word_idx, nextMeaning(), "つまらなく", [{ jp: "あいなく思ふ。", translation: "（訳）〔 つまらなく 〕思う。" }]));
  lines.push(entry("あいなく", group, 3, word_idx, nextMeaning(), "ふさわしくなく", [{ jp: "あいなき口出し。", translation: "（訳）〔 ふさわしくない 〕口出し。" }]));
}

// 2. あながち
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("あながち", group, 1, word_idx, nextMeaning(), "強引に", [{ jp: "あながちに御前去らずもてなさせたまひしほどに。（源氏物語）", translation: "（訳）〔 強引に 〕お側を離れないようにお世話させなさったうちに。" }]));
  lines.push(entry("あながち", group, 2, word_idx, nextMeaning(), "ひたすらに", [{ jp: "あながちに願ふ。", translation: "（訳）〔 ひたすらに 〕願う。" }]));
  lines.push(entry("あながち", group, 3, word_idx, nextMeaning(), "むやみに", [{ jp: "人のあながちに欲心あるはつたなきことなり。（今昔物語集）", translation: "（訳）人が〔 むやみに 〕欲深い心を持つのはつたないことだ。" }]));
}

// 3. あまり
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("あまり", group, 1, word_idx, nextMeaning(), "度を超えて", [{ jp: "さるまじき人のもとに、あまりかしこまりたるも、げにわろきことなり。（枕草子）", translation: "（訳）そうでない人の所に、〔 度を超えて 〕かしこまるのも、本当に良くないことだ。" }]));
  lines.push(entry("あまり", group, 2, word_idx, nextMeaning(), "～しすぎて", [{ jp: "酔ひて興に入るあまり。（徒然草）", translation: "（訳）酔って興に乗り〔 すぎるあまり 〕。" }]));
}

// 4. いかが
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("いかが", group, 1, word_idx, nextMeaning(), "どのように", [{ jp: "いかがしけむ、女を得てけり。（大和物語）", translation: "（訳）〔 どのように 〕したのか、女を手に入れてしまった。" }]));
  lines.push(entry("いかが", group, 2, word_idx, nextMeaning(), "どうして～か、いや～ない", [{ jp: "見るかひあるはことわり、いかが思はざらむとおぼゆ。（枕草子）", translation: "（訳）見がいがあるのは当然だ、〔 どうして 〕思わないだろう〔 か 〕（いや、必ず思う）。" }]));
}

// 5. いかで
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("いかで", group, 1, word_idx, nextMeaning(), "どうやって", [{ jp: "これが本はいかでかつくべからむと思ひわづらひぬ。（枕草子）", translation: "（訳）この上の句は〔 どうやって 〕つけたらよいだろうかと思い悩んだ。" }]));
  lines.push(entry("いかで", group, 2, word_idx, nextMeaning(), "どうして～か", [{ jp: "いかでかまからむ、暗うて。（源氏物語）", translation: "（訳）〔 どうして 〕参上できましょう〔 か 〕（暗くて無理です）。" }]));
  lines.push(entry("いかで", group, 3, word_idx, nextMeaning(), "なんとかして", [{ jp: "人の娘のかしづく、いかでこの男にもの言はむと思ひけり。（伊勢物語）", translation: "（訳）大事に育てられた娘が、〔 なんとかして 〕この男に話しかけたいと思った。" }]));
}

// 6. いささか
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("いささか", group, 1, word_idx, nextMeaning(), "少し", [{ jp: "昔の人はいささかの事をも、いみじく自讃したるなり。（徒然草）", translation: "（訳）昔の人は〔 少し 〕のことでも、大変自慢したものだ。" }]));
  lines.push(entry("いささか", group, 2, word_idx, nextMeaning(), "少しも～ない", [{ jp: "いささか心も得ざりけると見るがにくければ。（枕草子）", translation: "（訳）〔 少しも 〕理解でき〔 なかった 〕と見えるのが不快なので。" }]));
}

// 7. いたく
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("いたく", group, 1, word_idx, nextMeaning(), "たいそう", [{ jp: "いといたく若びたる人にて。（源氏物語）", translation: "（訳）とても〔 たいそう 〕若々しい人で。" }]));
  lines.push(entry("いたく", group, 2, word_idx, nextMeaning(), "それほど～ない", [{ jp: "わがため面目あるやうに言はれぬるそらごとは、人いたくあらがはず。（徒然草）", translation: "（訳）自分の面目が立つように言われた嘘は、人は〔 それほど 〕反論し〔 ない 〕。" }]));
}

// 8. いとも
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("いとも", group, 1, word_idx, nextMeaning(), "きわめて", [{ jp: "おのが師などのわろきことを言ひ表すは、いともかしこくはあれど。（玉勝間）", translation: "（訳）自分の師の誤りを指摘するのは、〔 きわめて 〕賢明ではあるけれど。" }]));
}

// 9. え
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("え", group, 1, word_idx, nextMeaning(), "～できない", [{ jp: "もの聞きに、夜より寒がりわななきをりける下衆男、いともの憂げに歩み来るを、見る者どもはえ問ひにだに問はず。（枕草子）", translation: "（訳）見ている者たちは尋ねることさえ〔 できない 〕。" }]));
}

// 10. おほかた
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("おほかた", group, 1, word_idx, nextMeaning(), "だいたい", [{ jp: "おほかたはまことしくあひしらひて。（徒然草）", translation: "（訳）〔 だいたい 〕は誠実に応対して。" }]));
  lines.push(entry("おほかた", group, 2, word_idx, nextMeaning(), "まったく～ない", [{ jp: "しばしかなでて後、抜かむとするに、おほかた抜かれず。（徒然草）", translation: "（訳）しばらく撫でた後、抜こうとするが、〔 まったく 〕抜け〔 ない 〕。" }]));
  lines.push(entry("おほかた", group, 3, word_idx, nextMeaning(), "一通りの", [{ jp: "おほかたのやむごとなき御思ひにて、この君をば、私物に思ほしかしづきたまふ。（源氏物語）", translation: "（訳）〔 一通りの 〕高貴なお気持ちで、この君を大切にお育てになる。" }]));
}

// 11. こころなし
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("こころなし", group, 1, word_idx, nextMeaning(), "思いやりがない", [{ jp: "こころなき人。", translation: "（訳）〔 思いやりがない 〕人。" }]));
  lines.push(entry("こころなし", group, 2, word_idx, nextMeaning(), "情趣を解さない", [{ jp: "こころなき身にもあはれは知られけり鴫立つ沢の秋の夕暮れ。（西行）", translation: "（訳）〔 情趣を解さない 〕身にも感動は感じられることだ、鴫の飛び立つ沢の秋の夕暮れよ。" }]));
  lines.push(entry("こころなし", group, 3, word_idx, nextMeaning(), "なんとなく", []));
}

// 12. ことさら
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("ことさら", group, 1, word_idx, nextMeaning(), "わざと", [{ jp: "ことさらにやつれたるけはひしるく見ゆる車二つあり。（源氏物語）", translation: "（訳）〔 わざと 〕質素にしている様子がはっきり見える車が二台ある。" }]));
  lines.push(entry("ことさら", group, 2, word_idx, nextMeaning(), "格別に", [{ jp: "ことさらに喜びたまひけり。（去来抄）", translation: "（訳）〔 格別に 〕お喜びになった。" }]));
}

// 13. さらに
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("さらに", group, 1, word_idx, nextMeaning(), "まったく～ない", [{ jp: "眉さらに抜きたまはず。（堤中納言物語）", translation: "（訳）眉を〔 まったく 〕抜きなさら〔 ない 〕。" }]));
  lines.push(entry("さらに", group, 2, word_idx, nextMeaning(), "ますます", [{ jp: "さらに寄り来ず。", translation: "（訳）〔 ますます 〕寄って来ない。" }]));
  lines.push(entry("さらに", group, 3, word_idx, nextMeaning(), "あらためて", []));
}

// 14. ずいぶん
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("ずいぶん", group, 1, word_idx, nextMeaning(), "身分相応に", [{ jp: "ずいぶんに用意す。", translation: "（訳）〔 身分相応に 〕用意する。" }]));
  lines.push(entry("ずいぶん", group, 2, word_idx, nextMeaning(), "できるだけ", [{ jp: "ずいぶんに心を尽くす。", translation: "（訳）〔 できるだけ 〕心を尽くす。" }]));
}

// 15. そこばく
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("そこばく", group, 1, word_idx, nextMeaning(), "たくさん", [{ jp: "そこばくの人。", translation: "（訳）〔 たくさん 〕の人。" }]));
  lines.push(entry("そこばく", group, 2, word_idx, nextMeaning(), "それほど", [{ jp: "そこばく思ふ。", translation: "（訳）〔 それほど 〕思う。" }]));
}

// 16. ただ
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("ただ", group, 1, word_idx, nextMeaning(), "ちょうど", [{ jp: "ただ一人笛吹きて、行きもやらず練り歩く人あり。（宇治拾遺物語）", translation: "（訳）〔 ちょうど 〕一人で笛を吹いて、進みもせずゆっくり歩く人がいる。" }]));
  lines.push(entry("ただ", group, 2, word_idx, nextMeaning(), "ひたすら", [{ jp: "ただ泣きに泣く。", translation: "（訳）〔 ひたすら 〕泣きに泣く。" }]));
  lines.push(entry("ただ", group, 3, word_idx, nextMeaning(), "普通の", [{ jp: "ただ人にはあらざりけり。", translation: "（訳）〔 普通の 〕人ではなかったのだなあ。" }]));
}

// 17. つひに
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("つひに", group, 1, word_idx, nextMeaning(), "とうとう", [{ jp: "つひにゆく道とはかねて聞きしかど昨日今日とは思はざりしを。（伊勢物語）", translation: "（訳）〔 とうとう 〕行く（死出の）道とは前から聞いていたが、それが昨日今日だとは思わなかった。" }]));
  lines.push(entry("つひに", group, 2, word_idx, nextMeaning(), "結局", []));
}

// 18. つゆ
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("つゆ", group, 1, word_idx, nextMeaning(), "少しも～ない", [{ jp: "かやうにあまたたび、とざまかうざまにするに、つゆばかりも騒ぎたる気色なし。（宇治拾遺物語）", translation: "（訳）こうして何度もあちこちしても、〔 少しも 〕騒いだ様子が〔 ない 〕。" }]));
}

// 19. ひたすら
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("ひたすら", group, 1, word_idx, nextMeaning(), "もっぱら", [{ jp: "はてには、笠うち着、足引き包み、よろしき姿したる者、ひたすらに家ごとに乞ひありく。（方丈記）", translation: "（訳）果てには笠をかぶり足を包み、相当な身なりの者が〔 もっぱら 〕家々に物乞いして歩く。" }]));
  lines.push(entry("ひたすら", group, 2, word_idx, nextMeaning(), "まったく", [{ jp: "遠き家は煙にむせび、近きあたりはひたすら炎を、地に吹きつけたり。（方丈記）", translation: "（訳）遠い家は煙にむせび、近いあたりは〔 まったく 〕炎を地に吹きつけた。" }]));
}

// 20. まさに
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("まさに", group, 1, word_idx, nextMeaning(), "当然～すべきだ", [{ jp: "当に住すべき山は吉野の山。（徒然草）", translation: "（訳）〔 当然 〕住む〔 べき 〕山は吉野の山だ。" }]));
  lines.push(entry("まさに", group, 2, word_idx, nextMeaning(), "ちょうど", []));
}

// 21. よに
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("よに", group, 1, word_idx, nextMeaning(), "非常に", [{ jp: "と言ひければ、この猟師、「よに尊きことにこそ候ふなれ」。（宇治拾遺物語）", translation: "（訳）と言ったところ、この猟師は「〔 非常に 〕尊いことでございます」。" }]));
  lines.push(entry("よに", group, 2, word_idx, nextMeaning(), "決して～ない", [{ jp: "わが妻はいたく恋ひらし飲む水に影さへ見えてよに忘られず。（万葉集）", translation: "（訳）私の妻はひどく恋しがっているらしい、飲む水に影まで映って〔 決して 〕忘れられ〔 ない 〕。" }]));
}

// 22. わりなく
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("わりなく", group, 1, word_idx, nextMeaning(), "道理に合わない", [{ jp: "様あしくも及びかからず、わりなく見んとする人もなし。（徒然草）", translation: "（訳）見苦しくのしかかることもなく、〔 道理に合わない 〕ほどに見ようとする人もいない。" }]));
  lines.push(entry("わりなく", group, 2, word_idx, nextMeaning(), "どうしようもなく", [{ jp: "と聞こえ急がせば、わりなく思ほしながら、まかでさせたまふ。（源氏物語）", translation: "（訳）と申し上げ急がせるので、〔 どうしようもなく 〕お思いになりながら退出させなさる。" }]));
  lines.push(entry("わりなく", group, 3, word_idx, nextMeaning(), "むやみに", [{ jp: "おぼえいとやむごとなく、上衆めかしけれど、わりなくまつはさせたまふあまりに。（源氏物語）", translation: "（訳）評判はとても高貴で貴族らしいけれど、〔 むやみに 〕おつきまとわせなさるあまりに。" }]));
}

// ============================================================
// POLYSEMY WORDS (17 words)
// ============================================================

// 23. あり
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("あり", group, 1, word_idx, nextMeaning(), "いる", [{ jp: "人のあるに。（枕草子）", translation: "（訳）人が〔 いる 〕のに。" }]));
  lines.push(entry("あり", group, 2, word_idx, nextMeaning(), "ある", [{ jp: "物のあるかぎり。（徒然草）", translation: "（訳）物が〔 ある 〕かぎり。" }]));
  lines.push(entry("あり", group, 3, word_idx, nextMeaning(), "暮らす", [{ jp: "世にあり。（源氏物語）", translation: "（訳）俗世で〔 暮らす 〕。" }]));
}

// 24. いづ
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("いづ", group, 1, word_idx, nextMeaning(), "出る", [{ jp: "門より出でて。（竹取物語）", translation: "（訳）門から〔 出て 〕。" }]));
  lines.push(entry("いづ", group, 2, word_idx, nextMeaning(), "現れる", [{ jp: "月の出でたるに。（枕草子）", translation: "（訳）月が〔 現れた 〕ので。" }]));
  lines.push(entry("いづ", group, 3, word_idx, nextMeaning(), "出発する", [{ jp: "旅に出づ。（土佐日記）", translation: "（訳）旅に〔 出発する 〕。" }]));
  lines.push(entry("いづ", group, 4, word_idx, nextMeaning(), "生まれる", [{ jp: "この世に出でて。（源氏物語）", translation: "（訳）この世に〔 生まれて 〕。" }]));
}

// 25. いふ
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("いふ", group, 1, word_idx, nextMeaning(), "言う", [{ jp: "と人のいひければ。（竹取物語）", translation: "（訳）と人が〔 言った 〕ので。" }]));
  lines.push(entry("いふ", group, 2, word_idx, nextMeaning(), "名づける", [{ jp: "なよ竹のかぐや姫といふ。（竹取物語）", translation: "（訳）なよ竹のかぐや姫と〔 名づける 〕。" }]));
  lines.push(entry("いふ", group, 3, word_idx, nextMeaning(), "歌を詠む", [{ jp: "いひける歌。（古今和歌集）", translation: "（訳）〔 詠んだ 〕歌。" }]));
  lines.push(entry("いふ", group, 4, word_idx, nextMeaning(), "評判である", [{ jp: "世にいふ。（枕草子）", translation: "（訳）世間で〔 評判である 〕。" }]));
}

// 26. うつる
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("うつる", group, 1, word_idx, nextMeaning(), "移動する", [{ jp: "都うつり。（方丈記）", translation: "（訳）都が〔 移動する 〕。" }]));
  lines.push(entry("うつる", group, 2, word_idx, nextMeaning(), "色・香が移る", [{ jp: "花の色はうつりにけりないたづらにわが身世にふるながめせしまに。（古今和歌集）", translation: "（訳）花の色は〔 褪せて 〕しまったなあ、むなしく物思いをしているうちに。" }]));
  lines.push(entry("うつる", group, 3, word_idx, nextMeaning(), "時が移る", [{ jp: "時うつりて。（徒然草）", translation: "（訳）時が〔 移って 〕。" }]));
  lines.push(entry("うつる", group, 4, word_idx, nextMeaning(), "心が変わる", [{ jp: "心のうつるに。（源氏物語）", translation: "（訳）心が〔 変わる 〕ので。" }]));
}

// 27. かたし
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("かたし", group, 1, word_idx, nextMeaning(), "難しい", [{ jp: "うち出でむことかたくやありけむ。（伊勢物語）", translation: "（訳）口に出すことが〔 難しかった 〕のだろうか。" }]));
  lines.push(entry("かたし", group, 2, word_idx, nextMeaning(), "めったにない", [{ jp: "かたき人。（源氏物語）", translation: "（訳）〔 めったにいない 〕人。" }]));
  lines.push(entry("かたし", group, 3, word_idx, nextMeaning(), "堅い", [{ jp: "かたき心。（源氏物語）", translation: "（訳）〔 堅い 〕心。" }]));
  lines.push(entry("かたし", group, 4, word_idx, nextMeaning(), "誠実だ", [{ jp: "かたき人。（源氏物語）", translation: "（訳）〔 誠実な 〕人。" }]));
}

// 28. かぬ
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("かぬ", group, 1, word_idx, nextMeaning(), "～しかねる", [{ jp: "思ひかねつつ。（古今和歌集）", translation: "（訳）思い〔 かねて 〕（堪えきれず）。" }]));
  lines.push(entry("かぬ", group, 2, word_idx, nextMeaning(), "兼ねる", [{ jp: "二つをかぬ。（大鏡）", translation: "（訳）二つを〔 兼ねる 〕。" }]));
  lines.push(entry("かぬ", group, 3, word_idx, nextMeaning(), "あらかじめ", [{ jp: "つひにゆく道とはかねて聞きしかど。（伊勢物語）", translation: "（訳）最後に行く道とは〔 あらかじめ 〕聞いていたが。" }]));
}

// 29. くだる
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("くだる", group, 1, word_idx, nextMeaning(), "都から地方へ行く", [{ jp: "東にくだる。（伊勢物語）", translation: "（訳）東国へ〔 下向する 〕。" }]));
  lines.push(entry("くだる", group, 2, word_idx, nextMeaning(), "下がる", [{ jp: "山をくだる。（徒然草）", translation: "（訳）山を〔 下る 〕。" }]));
  lines.push(entry("くだる", group, 3, word_idx, nextMeaning(), "命令が下される", [{ jp: "宣旨くだる。（源氏物語）", translation: "（訳）宣旨が〔 下される 〕。" }]));
}

// 30. こす
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("こす", group, 1, word_idx, nextMeaning(), "越える", [{ jp: "逢坂の関をこす。（百人一首）", translation: "（訳）逢坂の関を〔 越える 〕。" }]));
  lines.push(entry("こす", group, 2, word_idx, nextMeaning(), "時を越す", [{ jp: "年をこす。（徒然草）", translation: "（訳）年を〔 越す 〕。" }]));
  lines.push(entry("こす", group, 3, word_idx, nextMeaning(), "まさる", [{ jp: "人にこす。（大鏡）", translation: "（訳）人に〔 まさる 〕。" }]));
}

// 31. たつ
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("たつ", group, 1, word_idx, nextMeaning(), "立つ", [{ jp: "座よりたつ。（源氏物語）", translation: "（訳）座から〔 立つ 〕。" }]));
  lines.push(entry("たつ", group, 2, word_idx, nextMeaning(), "出発する", [{ jp: "旅にたつ。（土佐日記）", translation: "（訳）旅に〔 出発する 〕。" }]));
  lines.push(entry("たつ", group, 3, word_idx, nextMeaning(), "噂が広まる", [{ jp: "名のたつ。（古今和歌集）", translation: "（訳）噂が〔 広まる 〕。" }]));
  lines.push(entry("たつ", group, 4, word_idx, nextMeaning(), "断ち切る", [{ jp: "世をたつ。（源氏物語）", translation: "（訳）俗世との縁を〔 断ち切る 〕（＝出家する）。" }]));
  lines.push(entry("たつ", group, 5, word_idx, nextMeaning(), "時が経つ", [{ jp: "月日のたつ。（徒然草）", translation: "（訳）月日が〔 経つ 〕。" }]));
}

// 32. つく
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("つく", group, 1, word_idx, nextMeaning(), "付く", [{ jp: "もののけのつく。（源氏物語）", translation: "（訳）物の怪が〔 取り憑く 〕。" }]));
  lines.push(entry("つく", group, 2, word_idx, nextMeaning(), "到着する", [{ jp: "国につく。（土佐日記）", translation: "（訳）国に〔 到着する 〕。" }]));
  lines.push(entry("つく", group, 3, word_idx, nextMeaning(), "尽きる", [{ jp: "命つく。（平家物語）", translation: "（訳）命が〔 尽きる 〕。" }]));
  lines.push(entry("つく", group, 4, word_idx, nextMeaning(), "突く", [{ jp: "杖をつく。（徒然草）", translation: "（訳）杖を〔 突く 〕。" }]));
}

// 33. なる
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("なる", group, 1, word_idx, nextMeaning(), "～になる", [{ jp: "尼になる。（源氏物語）", translation: "（訳）尼に〔 なる 〕。" }]));
  lines.push(entry("なる", group, 2, word_idx, nextMeaning(), "できあがる", [{ jp: "歌なる。（古今和歌集）", translation: "（訳）歌が〔 できあがる 〕。" }]));
  lines.push(entry("なる", group, 3, word_idx, nextMeaning(), "鳴る", [{ jp: "鐘なる。（枕草子）", translation: "（訳）鐘が〔 鳴る 〕。" }]));
  lines.push(entry("なる", group, 4, word_idx, nextMeaning(), "実がなる", [{ jp: "実のなる木。（枕草子）", translation: "（訳）実が〔 なる 〕木。" }]));
}

// 34. はつ
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("はつ", group, 1, word_idx, nextMeaning(), "終わる", [{ jp: "祭りはつ。（枕草子）", translation: "（訳）祭りが〔 終わる 〕。" }]));
  lines.push(entry("はつ", group, 2, word_idx, nextMeaning(), "死ぬ", [{ jp: "命はつ。（平家物語）", translation: "（訳）命が〔 果てる（＝死ぬ） 〕。" }]));
  lines.push(entry("はつ", group, 3, word_idx, nextMeaning(), "～し終える", [{ jp: "この物語見はてむと思へど見えず。（更級日記）", translation: "（訳）この物語を〔 読み終えよう 〕と思うが見つからない。" }]));
}

// 35. ひく
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("ひく", group, 1, word_idx, nextMeaning(), "引く", [{ jp: "袖をひく。（源氏物語）", translation: "（訳）袖を〔 引く 〕。" }]));
  lines.push(entry("ひく", group, 2, word_idx, nextMeaning(), "心がひかれる", [{ jp: "心ひく。（源氏物語）", translation: "（訳）心が〔 ひかれる 〕。" }]));
  lines.push(entry("ひく", group, 3, word_idx, nextMeaning(), "退く", [{ jp: "軍ひく。（平家物語）", translation: "（訳）軍を〔 退かせる 〕。" }]));
  lines.push(entry("ひく", group, 4, word_idx, nextMeaning(), "楽器を弾く", [{ jp: "琴ひく。（源氏物語）", translation: "（訳）琴を〔 弾く 〕。" }]));
}

// 36. ふす
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("ふす", group, 1, word_idx, nextMeaning(), "うつ伏せになる", [{ jp: "地にふす。（平家物語）", translation: "（訳）地に〔 うつ伏せになる 〕。" }]));
  lines.push(entry("ふす", group, 2, word_idx, nextMeaning(), "横になる", [{ jp: "床にふす。（源氏物語）", translation: "（訳）床に〔 横になる 〕。" }]));
  lines.push(entry("ふす", group, 3, word_idx, nextMeaning(), "病に伏せる", [{ jp: "病にふす。（大鏡）", translation: "（訳）〔 病に伏せる 〕。" }]));
}

// 37. もる
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("もる", group, 1, word_idx, nextMeaning(), "漏れる", [{ jp: "雨のもる。（伊勢物語）", translation: "（訳）雨が〔 漏れる 〕。" }]));
  lines.push(entry("もる", group, 2, word_idx, nextMeaning(), "光がもれる", [{ jp: "木の間よりもる月影。（新古今和歌集）", translation: "（訳）木の間から〔 もれる 〕月の光。" }]));
  lines.push(entry("もる", group, 3, word_idx, nextMeaning(), "秘密が漏れる", [{ jp: "事のもる。（源氏物語）", translation: "（訳）秘密が〔 漏れる 〕。" }]));
  lines.push(entry("もる", group, 4, word_idx, nextMeaning(), "見守る", [{ jp: "顔をもる。（源氏物語）", translation: "（訳）顔を〔 見守る 〕。" }]));
  lines.push(entry("もる", group, 5, word_idx, nextMeaning(), "番をする", [{ jp: "門をもる。（万葉集）", translation: "（訳）門の〔 番をする 〕。" }]));
}

// 38. よる
{
  const { group, word_idx } = nextGroup();
  lines.push(entry("よる", group, 1, word_idx, nextMeaning(), "近づく", [{ jp: "そばによる。（源氏物語）", translation: "（訳）そばに〔 近づく 〕。" }]));
  lines.push(entry("よる", group, 2, word_idx, nextMeaning(), "立ち寄る", [{ jp: "宿による。（土佐日記）", translation: "（訳）宿に〔 立ち寄る 〕。" }]));
  lines.push(entry("よる", group, 3, word_idx, nextMeaning(), "～のために", [{ jp: "風によりて。（徒然草）", translation: "（訳）風〔 のために 〕。" }]));
  lines.push(entry("よる", group, 4, word_idx, nextMeaning(), "基づく", [{ jp: "先例による。（大鏡）", translation: "（訳）先例に〔 基づく 〕。" }]));
}

// ============================================================
// Write output
// ============================================================

const output = '\n' + lines.join('\n') + '\n';

console.log(`Generated ${lines.length} JSONL entries`);
console.log(`Words: 39 (group ${331} to ${currentGroup})`);
console.log(`Word indices: 332 to ${currentWordIdx}`);
console.log(`Meaning indices: 635 to ${currentMeaningIdx}`);

// Append to public file
fs.appendFileSync(PUBLIC_FILE, output, 'utf8');
console.log(`Appended to ${PUBLIC_FILE}`);

// Append to data file if it exists
if (fs.existsSync(DATA_FILE)) {
  fs.appendFileSync(DATA_FILE, output, 'utf8');
  console.log(`Appended to ${DATA_FILE}`);
}

// Verify
const publicLines = fs.readFileSync(PUBLIC_FILE, 'utf8').trim().split('\n');
console.log(`Total lines in public file: ${publicLines.length}`);

// Verify last 3 lines
console.log('\nLast 3 lines:');
publicLines.slice(-3).forEach(l => console.log(l));
