#!/usr/bin/env node
/**
 * Remap chigo-no-sorane reading guide annotations to new 15-sentence structure.
 * Add new annotations for sentences not in the old (truncated) version.
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', 'chigo-no-sorane.json');
const distFp = path.join(__dirname, '..', 'dist', 'reading', 'chigo-no-sorane.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

// Mapping: old sentence ID → new sentence ID
const remap = {
  s1: 's2',  // 僧たち、宵のつれづれに、…
  s2: 's3',  // この児、心よせに聞きけり。
  s3: 's4',  // さりとて、…と思ひて、
  s4: null,  // 「よばれたらば、いらへむ。」と思ひ寝に寝たるに、 (invalid invented sentence — DROP)
  s5: 's8',  // 「もの申しさぶらはむ。おどろかせたまへ。」と言ふを、
  s6: 's9',  // うれしとは思へども、…
  s7: 's10', // いま一声呼ばれて…
  s8: 's11', // 「や、な起こしたてまつりそ。…」
  s9: 's12', // あな、わびしと思ひて、…
  s10: 's13', // ひしひしとただ食ひに食ふ音…
  s11: 's14', // 僧たち、笑ふことかぎりなし。
};

// Remap existing annotations
const remapped = [];
for (const a of r.annotations) {
  const newId = remap[a.sentenceId];
  if (newId === undefined) {
    console.log(`Unknown old sentenceId ${a.sentenceId}, dropping`);
    continue;
  }
  if (newId === null) {
    console.log(`Dropping invalid annotation ${a.sentenceId} (no canonical equivalent)`);
    continue;
  }
  remapped.push({ ...a, sentenceId: newId });
}

// Update old s3 guide since old s3 had 「」 quotes around sarinatorious — fix to canonical
// Actually old s3 guide is fine; just the originalText differs. Keep guide.

// Update old s7 (now new s10) guide to mention 「念じて」 which is in canonical
const newS10 = remapped.find(a => a.sentenceId === 's10');
if (newS10) {
  newS10.guide = '「と」で意図、「念じて」で内的努力、「ほどに」で時間経過＋予想外の展開を予告。';
  // Add 念じて to vocab hints if applicable
  newS10.hints = newS10.hints.map(h => {
    if (h.type === 'method' && h.label.includes('ほどに')) {
      return {
        ...h,
        points: ['「ほどに」が出たら次に予想外の事態が来ると予測できる', 'ここでは児の計画が裏目に出る転換点', '「念じて」は「我慢して・じっとこらえて」の意で、児の見栄を張る心理を示す'],
      };
    }
    return h;
  });
}

// Add new annotations for s1, s5, s6, s7, s15
const newAnnotations = [
  {
    sentenceId: 's1',
    guide: '冒頭の定型「これも今は昔」は説話文学の典型的な枕詞。「けり」は伝聞過去で、語り手が伝え聞いた話であることを示す。',
    hints: [
      {
        type: 'structure',
        label: '説話の冒頭定型',
        points: [
          '「これも今は昔」＝『今昔物語集』『宇治拾遺物語』などの説話集に頻出する枕詞',
          '「これも」は前話との並列を示し、説話集の中の一段であることを暗示',
          '「あり**けり**」で物語の世界に読者を導入する',
        ],
      },
      {
        type: 'subject',
        label: '主役の提示',
        points: [
          '「比叡の山に児ありけり」で主人公（児）が登場',
          'まだ名前は無く、「児」という類型としてのみ示される',
        ],
      },
      {
        type: 'culture',
        label: '古文常識: 比叡山と児',
        points: [
          '比叡山延暦寺は天台宗の総本山で、平安・鎌倉期最大の宗教学問の中心地',
          '貴族や上級官人の子弟が「児」として預けられ、出家前の俗体のまま教養と仏縁を学んだ',
          '本作の児も比叡山に修学のため上っている貴公子と読むのが通例で、後の僧たちの敬語表現に反映される',
        ],
      },
    ],
  },
  {
    sentenceId: 's5',
    guide: '児の行動描写。「寝たるよし」＝寝たふり。「を待ちけるに」で時間経過と次の展開（出来上がり場面）への接続。',
    hints: [
      {
        type: 'subject',
        label: '主語は児',
        points: [
          '前文「思ひて」を受けて、児の動作が続く',
          '「寄りて」「寝たるよしにて」「待ちける」すべて児の行動',
        ],
      },
      {
        type: 'vocab',
        label: '「よし」「を待ちけるに」',
        points: [
          '「寝たるよし」の「よし」＝そぶり・ようす。寝たふり、を意味する重要古語',
          '「を待ちけるに」の「に」は接続助詞で時間順接（〜していたところ）',
        ],
      },
      {
        type: 'method',
        label: 'そらね（寝たふり）の伏線',
        points: [
          '本作のタイトル「ちごのそらね」＝児の空寝（うそ寝）',
          '「寝たるよしにて」がまさにそらねの瞬間を描写する核心の表現',
          'この行為が後段の悲喜劇のすべての発端となる',
        ],
      },
    ],
  },
  {
    sentenceId: 's6',
    guide: '僧たち側の動作描写へ転換。「すでに」「ひしめき合ひたり」で完成・盛り上がりを表現。「たり」は存続。',
    hints: [
      {
        type: 'subject',
        label: '主語の暗黙転換',
        points: [
          '主語表示なし → 僧たちの動作と判断（児が寝たふりしている間の出来事）',
          '「し出だしたる」「ひしめき合ひ」は僧たちが餅を作り上げて騒いでいる様子',
        ],
      },
      {
        type: 'vocab',
        label: '「すでに」「ひしめき合ふ」',
        points: [
          '「すでに」＝もうすっかり、もはや（時間的完了）',
          '「ひしめき合ふ」＝大勢で混み合って騒がしくする',
          '「たり」存続で「騒いでいる（最中）」の意',
        ],
      },
    ],
  },
  {
    sentenceId: 's7',
    guide: '児の心理描写。「ずらむ」は推量「らむ」、「待ちゐたる」は連体形で次文に続く。',
    hints: [
      {
        type: 'subject',
        label: '主語は児',
        points: [
          '「この児」と冒頭に明示',
          '「定めて〜ずらむ」「待ちゐたる」すべて児の心理・動作',
        ],
      },
      {
        type: 'grammar',
        label: '「むずらむ」の二重推量',
        points: [
          '「おどろかさむずらむ」＝「むず（推量）」＋「らむ（現在推量）」',
          '「むず」は「む」に「と思ふ」が付いた形で、「〜だろうと思う」の強い推量',
          '「らむ」は現在の推量「今〜しているだろう」',
          '組み合わせで「きっと〜するだろう」の確信的予想',
        ],
      },
      {
        type: 'method',
        label: '「定めて〜らむ」の確信',
        points: [
          '「定めて」＝きっと、必ず（強い確信）',
          'この児の確信＝「僧たちが私を起こしてくれるはず」',
          'しかし続く s11 でその期待は裏切られ、滑稽な結末を生む',
        ],
      },
    ],
  },
  {
    sentenceId: 's15',
    guide: '出典表示。『宇治拾遺物語』巻第一所収の説話。',
    hints: [
      {
        type: 'culture',
        label: '出典: 宇治拾遺物語 巻第一',
        points: [
          '本段は『宇治拾遺物語』巻第一・第十二段',
          '同書は鎌倉時代初期成立、編者未詳の説話集（全十五巻、約197話）',
          '仏教説話と世俗滑稽譚を併収し、本段は世俗の笑話を代表する一段',
        ],
      },
    ],
  },
];

// Combine: new annotations + remapped existing, sorted by sentence ID number
const all = [...newAnnotations, ...remapped];
all.sort((a, b) => {
  const an = parseInt(a.sentenceId.slice(1), 10);
  const bn = parseInt(b.sentenceId.slice(1), 10);
  return an - bn;
});

const newReading = {
  textId: r.textId,
  annotations: all,
};

fs.writeFileSync(fp, JSON.stringify(newReading, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(newReading, null, 2), 'utf8');
}
console.log(`Updated reading guide: ${all.length} annotations (was ${r.annotations.length})`);
console.log('Sentence IDs:', all.map(a => a.sentenceId).join(', '));
