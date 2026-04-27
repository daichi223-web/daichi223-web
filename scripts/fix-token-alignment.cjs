#!/usr/bin/env node
/**
 * Fix sentence/token alignment in texts-v3 JSONs.
 *
 * Problem: Some texts have tokens.text concat ≠ sentence.originalText.
 *   Pattern: tokens are correctly ordered but assigned to wrong sentences,
 *   and some tokens span sentence boundaries (e.g. "。家", "、火").
 *
 * Fix: walk through tokens in current order, accumulating chars, and
 *   redistribute them to sentences based on sentence.originalText length.
 *   If a token straddles a sentence boundary, split it into two tokens
 *   preserving grammarTag/hint/grammarRefId/layer (split text only).
 *
 * Usage: node scripts/fix-token-alignment.cjs <textId>
 */
const fs = require('fs');
const path = require('path');

function fixText(textId) {
  const fp = path.join(__dirname, '..', 'public', 'texts-v3', `${textId}.json`);
  const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', `${textId}.json`);
  const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

  const allOrig = t.sentences.map(s => s.originalText).join('');
  const allTokens = t.sentences.flatMap(s => s.tokens);
  const allTokenText = allTokens.map(tk => tk.text).join('');

  // Quick check: token concat should be a prefix of orig, or equal
  if (!allOrig.startsWith(allTokenText) && allTokenText !== allOrig) {
    // Check if it's just the last sentence missing tokens
    const orphanTail = allOrig.slice(allTokenText.length);
    console.log(`Note: tokens cover ${allTokenText.length}/${allOrig.length} chars, orphan tail: "${orphanTail}"`);
  }

  // Compute sentence boundary positions
  const boundaries = [];
  let pos = 0;
  for (const s of t.sentences) {
    pos += s.originalText.length;
    boundaries.push({ id: s.id, end: pos, originalText: s.originalText });
  }

  // Walk tokens, cumulative position
  let charPos = 0;
  let sentIdx = 0;
  const newSentenceTokens = t.sentences.map(() => []);
  let counter = {};

  for (const tk of allTokens) {
    const tkStart = charPos;
    const tkEnd = charPos + tk.text.length;
    charPos = tkEnd;

    // Advance sentIdx if needed
    while (sentIdx < boundaries.length && tkStart >= boundaries[sentIdx].end) {
      sentIdx++;
    }

    if (sentIdx >= boundaries.length) {
      console.log(`Token "${tk.text}" beyond all sentences, skipping`);
      continue;
    }

    const sentEnd = boundaries[sentIdx].end;

    if (tkEnd <= sentEnd) {
      // Token fully within current sentence
      newSentenceTokens[sentIdx].push(tk);
    } else {
      // Token straddles boundary: split
      const splitOffset = sentEnd - tkStart;
      const leftText = tk.text.slice(0, splitOffset);
      const rightText = tk.text.slice(splitOffset);

      const left = { ...tk, text: leftText };
      const right = { ...tk, text: rightText };
      // grammarTag/hint/grammarRefId stay on both halves (could be split
      // smarter, but punctuation + char fragment doesn't need precision)

      newSentenceTokens[sentIdx].push(left);
      // Recurse for right half — could span more boundaries
      let curPos = sentEnd;
      let curSentIdx = sentIdx + 1;
      let remaining = right;
      while (curSentIdx < boundaries.length && curPos + remaining.text.length > boundaries[curSentIdx].end) {
        const nextBoundary = boundaries[curSentIdx].end;
        const offset = nextBoundary - curPos;
        const lpart = { ...remaining, text: remaining.text.slice(0, offset) };
        const rpart = { ...remaining, text: remaining.text.slice(offset) };
        newSentenceTokens[curSentIdx].push(lpart);
        curPos = nextBoundary;
        curSentIdx++;
        remaining = rpart;
      }
      if (curSentIdx < boundaries.length && remaining.text.length > 0) {
        newSentenceTokens[curSentIdx].push(remaining);
      }
    }
  }

  // Rebuild sentences with new token assignments + reset start/end + new IDs
  for (let i = 0; i < t.sentences.length; i++) {
    const s = t.sentences[i];
    const tokens = newSentenceTokens[i];
    let pos = 0;
    const newTokens = tokens.map((tk, idx) => {
      const newTk = {
        ...tk,
        id: `${s.id}-t${idx + 1}`,
        start: pos,
        end: pos + tk.text.length,
      };
      pos = newTk.end;
      return newTk;
    });
    s.tokens = newTokens;
  }

  // Backfill: if a sentence's tokens don't cover its originalText (e.g. trailing
  // 「（巻第三）」 with no tokens), generate a single layer-0 filler token for the
  // missing tail so the sentence is internally consistent.
  for (const s of t.sentences) {
    const concat = s.tokens.map(tk => tk.text).join('');
    if (concat.length < s.originalText.length && s.originalText.startsWith(concat)) {
      const missing = s.originalText.slice(concat.length);
      s.tokens.push({
        id: `${s.id}-t${s.tokens.length + 1}`,
        text: missing,
        start: concat.length,
        end: s.originalText.length,
        layer: 0,
        grammarTag: { pos: '' },
      });
    }
  }

  // Validation
  let allOk = true;
  for (const s of t.sentences) {
    const concat = s.tokens.map(tk => tk.text).join('');
    if (concat !== s.originalText) {
      console.log(`STILL MISMATCH ${s.id}:`);
      console.log(`  orig:    [${s.originalText}]`);
      console.log(`  joined:  [${concat}]`);
      allOk = false;
    }
  }

  if (!allOk) {
    console.log('Validation failed; not writing');
    process.exit(1);
  }

  fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
  if (fs.existsSync(path.dirname(distFp))) {
    fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');
  }
  console.log(`Fixed ${textId}: ${t.sentences.length} sentences, ${t.sentences.reduce((n, s) => n + s.tokens.length, 0)} tokens`);
}

const textId = process.argv[2];
if (!textId) {
  console.error('Usage: node scripts/fix-token-alignment.cjs <textId>');
  process.exit(1);
}
fixText(textId);
