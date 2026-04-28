#!/usr/bin/env node
/**
 * Rebuild sentences.originalText from tokens (orphan_tail_only fix).
 *
 * Strategy: existing originalTexts are "anchors" — find each in the full
 * concatenated token text. Then expand each sentence to cover from its
 * anchor to the next anchor, absorbing surrounding token content.
 *
 * Preserves sentence count, sentence IDs, modernTranslation, so reading
 * guide annotations remain valid. Reassigns tokens via the same logic
 * as fix-token-alignment.cjs (cumulative position + boundary split).
 *
 * Usage: node scripts/rebuild-from-tokens.cjs <textId>
 */
const fs = require('fs');
const path = require('path');

function rebuild(textId) {
  const fp = path.join(__dirname, '..', 'public', 'texts-v3', `${textId}.json`);
  const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', `${textId}.json`);
  const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

  const allTokens = t.sentences.flatMap(s => s.tokens);
  const fullText = allTokens.map(tk => tk.text).join('');

  // Find each existing originalText in fullText (as anchor positions).
  // If an originalText is not found in fullText (e.g. citation suffix
  // 「（第八四段）」 absent from tokens), the sentence is treated as
  // un-anchored: keep its original text as-is and synthesize a filler
  // token for it (no token redistribution, no anchor used).
  const anchors = [];
  let searchStart = 0;
  for (const s of t.sentences) {
    const idx = fullText.indexOf(s.originalText, searchStart);
    if (idx === -1) {
      anchors.push({ sentId: s.id, anchored: false });
      console.log(`(skipping anchor for ${s.id}: not found in tokens)`);
      // do not advance searchStart
    } else {
      anchors.push({ sentId: s.id, anchored: true, start: idx, end: idx + s.originalText.length });
      searchStart = idx + s.originalText.length;
    }
  }

  // Each anchored sentence covers from this anchor.start to next anchor.start.
  // First anchored sentence absorbs prefix, last absorbs tail.
  // Un-anchored sentences keep their original text and get a filler token.
  const anchoredIndices = anchors.map((a, i) => a.anchored ? i : null).filter(i => i !== null);
  const newSentences = [];
  for (let i = 0; i < t.sentences.length; i++) {
    if (anchors[i].anchored) {
      // Find next anchored sentence position (or end of fullText)
      const nextAnchored = anchoredIndices.find(j => j > i);
      const isFirstAnchored = anchoredIndices[0] === i;
      const isLastAnchored = anchoredIndices[anchoredIndices.length - 1] === i;
      const startInFull = isFirstAnchored ? 0 : anchors[i].start;
      const endInFull = isLastAnchored ? fullText.length : anchors[nextAnchored].start;
      const newOriginalText = fullText.slice(startInFull, endInFull);
      newSentences.push({
        ...t.sentences[i],
        originalText: newOriginalText,
        tokens: [],
        _anchored: true,
      });
    } else {
      // Un-anchored: keep originalText as-is, generate filler token
      newSentences.push({
        ...t.sentences[i],
        originalText: t.sentences[i].originalText,
        tokens: [{
          id: `${t.sentences[i].id}-t1`,
          text: t.sentences[i].originalText,
          start: 0,
          end: t.sentences[i].originalText.length,
          layer: 0,
          grammarTag: { pos: '' },
        }],
        _anchored: false,
      });
    }
  }

  // Redistribute tokens to anchored sentences by cumulative position over fullText.
  // Un-anchored sentences already have their filler token.
  const anchoredSentences = newSentences.filter(s => s._anchored);
  const boundaries = [];
  let pos = 0;
  for (const s of anchoredSentences) {
    pos += s.originalText.length;
    boundaries.push(pos);
  }

  let charPos = 0;
  let sentIdx = 0;
  for (let tIdx = 0; tIdx < allTokens.length; tIdx++) {
    const tk = allTokens[tIdx];
    const tkStart = charPos;
    const tkEnd = charPos + tk.text.length;
    charPos = tkEnd;

    while (sentIdx < boundaries.length && tkStart >= boundaries[sentIdx]) {
      sentIdx++;
    }
    if (sentIdx >= boundaries.length) {
      console.log(`Token "${tk.text}" beyond all sentences, skipping`);
      continue;
    }
    const sentEnd = boundaries[sentIdx];

    if (tkEnd <= sentEnd) {
      anchoredSentences[sentIdx].tokens.push(tk);
    } else {
      const splitOffset = sentEnd - tkStart;
      const left = { ...tk, text: tk.text.slice(0, splitOffset) };
      const right = { ...tk, text: tk.text.slice(splitOffset) };
      anchoredSentences[sentIdx].tokens.push(left);
      let curSentIdx = sentIdx + 1;
      let curPos = sentEnd;
      let remaining = right;
      while (curSentIdx < boundaries.length && curPos + remaining.text.length > boundaries[curSentIdx]) {
        const offset = boundaries[curSentIdx] - curPos;
        const lpart = { ...remaining, text: remaining.text.slice(0, offset) };
        const rpart = { ...remaining, text: remaining.text.slice(offset) };
        anchoredSentences[curSentIdx].tokens.push(lpart);
        curPos = boundaries[curSentIdx];
        curSentIdx++;
        remaining = rpart;
      }
      if (curSentIdx < boundaries.length && remaining.text.length > 0) {
        anchoredSentences[curSentIdx].tokens.push(remaining);
      }
    }
  }

  // Renumber token IDs and reset start/end
  for (const s of newSentences) {
    let pos = 0;
    s.tokens = s.tokens.map((tk, idx) => {
      const newTk = {
        ...tk,
        id: `${s.id}-t${idx + 1}`,
        start: pos,
        end: pos + tk.text.length,
      };
      pos += tk.text.length;
      return newTk;
    });
  }

  // Strip internal _anchored flag
  t.sentences = newSentences.map(s => {
    const { _anchored, ...rest } = s;
    return rest;
  });

  // Validate
  for (const s of t.sentences) {
    const concat = s.tokens.map(tk => tk.text).join('');
    if (concat !== s.originalText) {
      console.error(`Validation failed at ${s.id}:`);
      console.error(`  orig:    [${s.originalText}]`);
      console.error(`  joined:  [${concat}]`);
      process.exit(1);
    }
    for (const tk of s.tokens) {
      if (s.originalText.slice(tk.start, tk.end) !== tk.text) {
        console.error(`start/end mismatch at ${s.id}/${tk.id}`);
        process.exit(1);
      }
    }
  }

  fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
  if (fs.existsSync(path.dirname(distFp))) {
    fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');
  }
  console.log(`Rebuilt ${textId}: ${newSentences.length} sentences, ${newSentences.reduce((n, s) => n + s.tokens.length, 0)} tokens`);
}

const textId = process.argv[2];
if (!textId) {
  console.error('Usage: node scripts/rebuild-from-tokens.cjs <textId>');
  process.exit(1);
}
rebuild(textId);
