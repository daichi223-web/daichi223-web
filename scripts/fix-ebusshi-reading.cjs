#!/usr/bin/env node
/**
 * 絵仏師良秀 読解ガイド: sentence ID 再マップ + 改訂内容反映 + 新 s8 追加
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', '31d11bf2f8.json');
const distFp = path.join(__dirname, '..', 'dist', 'reading', '31d11bf2f8.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ID mapping (s7 split into new s7+s8, so s8〜s21 shift by +1)
const idMap = {
  s1: 's1', s2: 's2', s3: 's3', s4: 's4', s5: 's5', s6: 's6',
  s7: 's7',  // text changed but ID same
  s8: 's9', s9: 's10', s10: 's11', s11: 's12', s12: 's13', s13: 's14',
  s14: 's15', s15: 's16', s16: 's17', s17: 's18', s18: 's19', s19: 's20',
  s20: 's21', s21: 's22',
};

const remapped = r.annotations.map(a => ({ ...a, sentenceId: idMap[a.sentenceId] || a.sentenceId }));

// Update content for changed sentences

// s5 — 「向かひのつら」復元: 軽くガイドを更新
const s5 = remapped.find(a => a.sentenceId === 's5');
if (s5) {
  s5.guide = '良秀が家族・仏像を気にせず自分だけ逃げた冷淡さを描く。「のつら」=向かい側の方面、「立てり」=完了存続「り」で止まっている状態。';
}

// s7 — 旧 s7 が「ける」「に」→「けれ」「ど」+「騒がず。」に短縮
const s7 = remapped.find(a => a.sentenceId === 's7');
if (s7) {
  s7.guide = '「とぶらひけれど、騒がず」で人々と良秀の対比を端的に提示。逆接「ど」が緊張を生む。';
  s7.hints = [
    {
      type: 'subject',
      label: '主語の対比',
      points: [
        '「人ども来とぶらひ」の主語は弔問客',
        '「騒がず」の主語は良秀（暗黙）',
        '弔問客が騒ぐ通常パターンと、良秀の異常な静けさを対比する短文構造',
      ],
    },
    {
      type: 'grammar',
      label: '逆接「けれど」「ど」',
      points: [
        '「とぶらひけれど」= 「とぶらふ(連用)」+「けり(已然「けれ」)」+「ど」(逆接接続助詞)',
        '「ど」は已然形接続で「〜のに、〜けれども」の逆接確定条件を表す',
      ],
    },
  ];
}

// s8 (NEW) — 「いかに。」と人言ひければ…笑ひけり。
const newS8 = {
  sentenceId: 's8',
  guide: '弔問客の問いかけと、良秀の異常な反応の対比。「いかに」は驚きの呼びかけ、「うちうなづきて」「ときどき笑ひけり」が異様さを際立たせる。',
  hints: [
    {
      type: 'subject',
      label: '主語の転換',
      points: [
        '「人言ひければ」までは弔問客が主語',
        '「向かひに立ちて」以降は良秀が主語（暗黙）',
        '「ば」(順接確定)で良秀の行動描写へ転じる',
      ],
    },
    {
      type: 'grammar',
      label: '「ば」順接確定',
      points: [
        '「言ひければ」の「ば」は已然形接続の順接確定条件',
        '「〜したところ・〜したので」の意で、次の動作への移行を示す',
      ],
    },
    {
      type: 'method',
      label: '異様さの描写技法',
      points: [
        '「うちうなづきて」+「ときどき笑ひけり」で正常な反応との落差を表現',
        '読者は「物の怪が憑いたのか」と疑いたくなるよう仕掛けられている',
        '次の弔問客発言「もののつきたまへるか」への自然な伏線になる',
      ],
    },
  ],
};
remapped.splice(7, 0, newS8);  // insert at position 7 (after s7)

// s11 (旧 s10) — 「おはする」→「立ちたまへる」 へ更新
const s11 = remapped.find(a => a.sentenceId === 's11');
if (s11) {
  s11.guide = '弔問客の驚き。「こはいかに」は「これはどうしたことだ」。「立ちたまへる」=「立つ+尊敬たまふ+存続り」=「お立ちになっている」。';
  // grammar hint があれば「立ちたまへる」 に対応するよう更新
  for (const h of s11.hints || []) {
    if (h.type === 'grammar') {
      h.label = '「立ちたまへる」の構造';
      h.points = [
        '「立ち」(動詞・連用) + 「たまへ」(尊敬補助動詞・已然形) + 「る」(存続助動詞「り」連体形)',
        '「り」は四段動詞已然形に接続し、存続「〜ている」を表す',
        '良秀への敬意が込められており、訪問者は依然丁寧に接している',
      ];
    }
  }
}

// s18 (旧 s17) — 「また」削除、「いでこなむ」へ更新
const s18 = remapped.find(a => a.sentenceId === 's18');
if (s18) {
  s18.guide = '芸術家論の展開。「百千の家もいでこなむ」=「家なんて出てきてほしい(=後からいくらでも作れる)」。「なむ」は終助詞で願望。';
  for (const h of s18.hints || []) {
    if (h.type === 'grammar') {
      h.label = '「いでこなむ」の文法';
      h.points = [
        '「いでこ」=「出で来(いでく)」のカ変動詞未然形',
        '「なむ」は未然形接続の終助詞で願望「〜してほしい」',
        '完了「ぬ」+推量「む」と読むのは誤り（推量「百千の家がきっと出てくる」では文意が浅い）',
      ];
    }
  }
}

// s21 (旧 s20) — 「にぞ」→「にや」 へ更新
const s21 = remapped.find(a => a.sentenceId === 's21');
if (s21) {
  s21.guide = '後日譚を結ぶ。「にや」=「〜であろうか」(下に「あらむ」省略の余情形)。語り手の控えめな推量で説話を閉じる。';
  for (const h of s21.hints || []) {
    if (h.type === 'grammar') {
      h.label = '「にや」と余情結び';
      h.points = [
        '「に」は断定の助動詞「なり」連用形',
        '「や」は係助詞 疑問・余情',
        '下に「あらむ」が省略された結びの省略形で、「〜であろうか」と余韻を残す',
      ];
    }
  }
}

const newReading = {
  textId: r.textId,
  annotations: remapped,
};

fs.writeFileSync(fp, JSON.stringify(newReading, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(newReading, null, 2), 'utf8');
}
console.log(`Updated reading guide: ${remapped.length} annotations (was ${r.annotations.length})`);
console.log('IDs:', remapped.map(a => a.sentenceId).join(','));
