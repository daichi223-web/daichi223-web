#!/usr/bin/env node
/**
 * Reconstruct chigo-no-sorane.json with canonical 宇治拾遺物語 text.
 *
 * Strategy:
 * - Take 9f6b6f2e95.json (canonical full-text tokens)
 * - Re-segment into 15 sentences at natural pedagogical boundaries
 *   (respecting 「」 quotes — never split inside)
 * - Migrate chigo-no-sorane.json's hints onto matching tokens
 *   (matched by text + baseForm + pos, with positional preference)
 * - Migrate chigo-no-sorane.json's learningPoints (richer content)
 * - Provide modernTranslations for new sentences
 */
const fs = require('fs');
const path = require('path');

const oldChigo = require(path.join(__dirname, '..', 'public', 'texts-v3', 'chigo-no-sorane.json'));
const canonical = require(path.join(__dirname, '..', 'public', 'texts-v3', '9f6b6f2e95.json'));

// Get canonical full text and tokens in order
const fullTokens = canonical.sentences.flatMap(s => s.tokens);
const fullText = fullTokens.map(tk => tk.text).join('');

// Define new sentence boundaries (15 sentences at pedagogical breaks)
const sentenceTexts = [
  'これも今は昔、比叡の山に児ありけり。',
  '僧たち、宵のつれづれに、「いざ、かいもちひせむ。」と言ひけるを、',
  'この児、心よせに聞きけり。',
  'さりとて、し出ださむを待ちて寝ざらむも、わろかりなむと思ひて、',
  '片方に寄りて、寝たるよしにて、出で来るを待ちけるに、',
  'すでにし出だしたるさまにて、ひしめき合ひたり。',
  'この児、定めておどろかさむずらむと、待ちゐたるに、',
  '僧の、「もの申しさぶらはむ。おどろかせたまへ。」と言ふを、',
  'うれしとは思へども、ただ一度にいらへむも、待ちけるかともぞ思ふとて、',
  'いま一声呼ばれていらへむと、念じて寝たるほどに、',
  '「や、な起こしたてまつりそ。幼き人は、寝入りたまひにけり。」と言ふ声のしければ、',
  'あな、わびしと思ひて、いま一度起こせかしと、思ひ寝に聞けば、',
  'ひしひしとただ食ひに食ふ音のしければ、ずちなくて、無期の後に、「えい。」といらへたりければ、',
  '僧たち、笑ふことかぎりなし。',
  '（巻第一）',
];

const modernTranslations = [
  'これも今となっては昔の話だが、比叡山に稚児がいた。',
  '僧たちが、宵の退屈な折に、「さあ、ぼたもちを作ろう。」と言ったのを、',
  'この稚児は、期待して聞いていた。',
  'そうは言っても、（ぼたもちを）作り上げるのを待って寝ないのも、みっともないだろうと思って、',
  '片隅に寄って、寝たふりをして、（ぼたもちが）できるのを待っていたところ、',
  'もうすっかり出来上がった様子で、（僧たちが）大騒ぎしている。',
  'この稚児は、きっと（僧たちが私を）起こすだろうと、（じっと）待っていたところ、',
  '僧が、「もし、お目覚めください。」と言うのを、',
  'うれしいとは思うものの、ただ一度で返事をするのも、（ぼたもちを）待っていたのかと思われたら困ると思って、',
  'もう一度呼ばれて返事をしようと、我慢して寝ていたところ、',
  '「これ、お起こし申し上げるな。幼い方はお眠りになってしまった。」と言う声がしたので、',
  'ああ、困ったと思って、もう一度起こしてくれよと、寝たふりして聞いていると、',
  'むしゃむしゃと、ただひたすら食べる音がしたので、どうしようもなくて、ずいぶん経った後に、「はい。」と返事をしたところ、',
  '僧たちは、笑うことこの上ない。',
  '（『宇治拾遺物語』巻第一）',
];

// Verify sentence concat matches fullText (with possible tolerance for source citation)
const concatNew = sentenceTexts.join('');
if (!fullText.startsWith(concatNew.replace('（巻第一）', ''))) {
  // Try without source citation
  const withoutCitation = concatNew.replace('（巻第一）', '');
  if (fullText !== withoutCitation && fullText !== concatNew) {
    console.error('Canonical sentence concat does not match 9f6b6f2e95 fullText');
    console.error('Concat new:', concatNew);
    console.error('Full text :', fullText);
    process.exit(1);
  }
}

// Build hint lookup from old chigo-no-sorane: relaxed matching by text only,
// preserving order so duplicate tokens (e.g. 「む」 appearing many times) are
// consumed in sequence.
const hintQueue = {};
for (const s of oldChigo.sentences) {
  for (const tk of s.tokens) {
    if (tk.hint) {
      const key = tk.text;
      if (!hintQueue[key]) hintQueue[key] = [];
      hintQueue[key].push({
        hint: tk.hint,
        grammarRefId: tk.grammarRefId,
        layer: tk.layer,
        oldGrammarTag: tk.grammarTag,
      });
    }
  }
}

// Distribute fullTokens into new 15 sentences by cumulative position
const boundaries = [];
let pos = 0;
for (const st of sentenceTexts) {
  pos += st.length;
  boundaries.push(pos);
}

const newSentences = sentenceTexts.map((st, i) => ({
  id: `s${i + 1}`,
  originalText: st,
  modernTranslation: modernTranslations[i],
  tokens: [],
}));

let charPos = 0;
let sentIdx = 0;
for (let tIdx = 0; tIdx < fullTokens.length; tIdx++) {
  const tk = fullTokens[tIdx];
  const tkStart = charPos;
  const tkEnd = charPos + tk.text.length;
  charPos = tkEnd;

  while (sentIdx < boundaries.length && tkStart >= boundaries[sentIdx]) sentIdx++;
  if (sentIdx >= boundaries.length) {
    console.log(`Token "${tk.text}" beyond sentences, skipping`);
    continue;
  }
  const sentEnd = boundaries[sentIdx];

  if (tkEnd <= sentEnd) {
    newSentences[sentIdx].tokens.push(tk);
  } else {
    const splitOffset = sentEnd - tkStart;
    const left = { ...tk, text: tk.text.slice(0, splitOffset) };
    const right = { ...tk, text: tk.text.slice(splitOffset) };
    newSentences[sentIdx].tokens.push(left);
    let curSent = sentIdx + 1;
    let curP = sentEnd;
    let rem = right;
    while (curSent < boundaries.length && curP + rem.text.length > boundaries[curSent]) {
      const o = boundaries[curSent] - curP;
      newSentences[curSent].tokens.push({ ...rem, text: rem.text.slice(0, o) });
      curP = boundaries[curSent];
      curSent++;
      rem = { ...rem, text: rem.text.slice(o) };
    }
    if (curSent < boundaries.length && rem.text.length > 0) newSentences[curSent].tokens.push(rem);
  }
}

// Fill last sentence (（巻第一）) with filler if no tokens
const lastSent = newSentences[newSentences.length - 1];
const lastConcat = lastSent.tokens.map(tk => tk.text).join('');
if (lastConcat !== lastSent.originalText) {
  lastSent.tokens = [{
    id: `${lastSent.id}-t1`,
    text: lastSent.originalText,
    start: 0,
    end: lastSent.originalText.length,
    layer: 0,
    grammarTag: { pos: '' },
  }];
}

// Migrate hints from old chigo to matching tokens (consume from queue by text)
// Also enrich grammarTag if old had richer info (baseForm/pos/etc)
let migratedCount = 0;
let enrichedCount = 0;
for (const s of newSentences) {
  for (const tk of s.tokens) {
    const key = tk.text;
    if (hintQueue[key] && hintQueue[key].length > 0) {
      const item = hintQueue[key].shift();
      if (item.hint && !tk.hint) {
        tk.hint = item.hint;
        migratedCount++;
      }
      if (item.grammarRefId && !tk.grammarRefId) {
        tk.grammarRefId = item.grammarRefId;
      }
      // Enrich grammarTag with old data if new lacks it
      if (item.oldGrammarTag) {
        const oldGT = item.oldGrammarTag;
        const newGT = tk.grammarTag || {};
        if (oldGT.baseForm && !newGT.baseForm) { newGT.baseForm = oldGT.baseForm; enrichedCount++; }
        if (oldGT.pos && !newGT.pos) { newGT.pos = oldGT.pos; enrichedCount++; }
        if (oldGT.conjugationType && !newGT.conjugationType) { newGT.conjugationType = oldGT.conjugationType; enrichedCount++; }
        if (oldGT.conjugationForm && !newGT.conjugationForm) { newGT.conjugationForm = oldGT.conjugationForm; enrichedCount++; }
        if (oldGT.meaning && !newGT.meaning) { newGT.meaning = oldGT.meaning; enrichedCount++; }
        if (oldGT.honorific && !newGT.honorific) { newGT.honorific = oldGT.honorific; enrichedCount++; }
        tk.grammarTag = newGT;
      }
      // Layer: prefer old's layer if it's nonzero and new's is 0
      if (item.layer && item.layer > 0 && (!tk.layer || tk.layer === 0)) {
        tk.layer = item.layer;
      }
    }
  }
}
console.log(`Migrated ${migratedCount} hints, enriched ${enrichedCount} grammarTag fields`);

// Renumber tokens with proper IDs and start/end
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

// Validate
for (const s of newSentences) {
  const concat = s.tokens.map(tk => tk.text).join('');
  if (concat !== s.originalText) {
    console.error(`MISMATCH at ${s.id}: orig=${s.originalText}, joined=${concat}`);
    process.exit(1);
  }
  for (const tk of s.tokens) {
    if (s.originalText.slice(tk.start, tk.end) !== tk.text) {
      console.error(`start/end mismatch at ${s.id}/${tk.id}`);
      process.exit(1);
    }
  }
}

// Build new chigo file: keep old metadata (title, source, layers, learningPoints, etc.),
// replace sentences
const newChigo = {
  ...oldChigo,
  sentences: newSentences,
};

const fp = path.join(__dirname, '..', 'public', 'texts-v3', 'chigo-no-sorane.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', 'chigo-no-sorane.json');
fs.writeFileSync(fp, JSON.stringify(newChigo, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(newChigo, null, 2), 'utf8');
}
console.log(`Reconstructed chigo-no-sorane: ${newSentences.length} sentences, ${newSentences.reduce((n, s) => n + s.tokens.length, 0)} tokens, ${migratedCount} hints migrated`);
