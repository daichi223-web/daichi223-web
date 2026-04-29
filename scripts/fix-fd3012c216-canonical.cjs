#!/usr/bin/env node
/**
 * 若紫の君 (fd3012c216) 源氏物語・若紫巻 北山かいま見の場面を正典本文に修正。
 *
 * 検出した正典差分:
 *  s3 末尾  「。「何事ぞや。」が誤って付加（s4 と重複）→ 末尾を「立てり。」までに戻す
 *  s4      「｢何事ぞや。」(半角クオート1字分の単独文)：s3 と s5 にまたがる正典「「何事ぞや。
 *           童べと腹立ちたまへるか。」とて、…」のうち「「何事ぞや。」だけが切り出されたゴミ文
 *           → s4 を s5 に統合して正典の連続会話を復元
 *  s48 末尾「（）」空括弧 (token 36, 37)：正典に存在しない → 削除
 *  s49     「（若紫巻）」：出典ラベルがダミー sentence 化 → 削除
 *  s50     「源氏はついに藤壺と密通の罪を犯し、藤壺は皇子を産んだ。」：AI 生成の後日談要約。
 *           北山かいま見の場面の正典本文ではない → 削除
 *  s51     「尼君を亡くした若紫の君は、源氏に引き取られた。」：AI 生成の後日談要約 → 削除
 *
 * 既存の hint と learningPoints は保持。読解 annotation は別 sentence ID を持つので
 * 削除された s49/s50/s51 と統合された s4 に対応する annotation はガイドからも削除。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', 'fd3012c216.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', 'fd3012c216.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── 編集 1: s3 末尾の捏造「「何事ぞや。」を削除 ─────────
const s3 = t.sentences.find((s) => s.id === 's3');
{
  // 末尾の「「」「何事」「ぞ」「や」「。」を削除
  const tailTexts = ['「', '何事', 'ぞ', 'や', '。'];
  // 末尾から逆順に削除
  for (let i = tailTexts.length - 1; i >= 0; i--) {
    const last = s3.tokens[s3.tokens.length - 1];
    if (last && last.text === tailTexts[i]) {
      s3.tokens.pop();
    } else {
      throw new Error(
        `s3 tail mismatch at i=${i}: expected "${tailTexts[i]}", got "${last?.text}"`,
      );
    }
  }
  s3.originalText = '髪は扇を広げたるやうにゆらゆらとして、顔はいと赤くすりなして立てり。';
}

// ── 編集 2: s4「｢何事ぞや。」を s5 に統合し、正典「「何事ぞや。童べと腹立ちたまへるか。」 ──
//   s4 削除 + s5 の冒頭に「「何事ぞや。」を挿入
const s4Idx = t.sentences.findIndex((s) => s.id === 's4');
const s5Idx = t.sentences.findIndex((s) => s.id === 's5');
{
  const s5 = t.sentences[s5Idx];
  // s5 の現状: 「童べ|と|腹立ち|たまへ|る|か|。」
  const s5Heads = [
    { text: '「', layer: 0, grammarTag: { pos: '' } },
    { text: '何事', layer: 0, grammarTag: { pos: '' } },
    {
      text: 'ぞ',
      layer: 3,
      grammarTag: { pos: '係助詞', meaning: '強意' },
      grammarRefId: 'joshi-fuku-kakari',
      hint: '係助詞「ぞ」: 強意。結びは連体形。「何事ぞや」は「ぞ」+疑問「や」で「何事だろうか」の問いかけ。',
    },
    {
      text: 'や',
      layer: 3,
      grammarTag: { pos: '係助詞', meaning: '疑問' },
      grammarRefId: 'joshi-fuku-kakari',
      hint: '係助詞「や」: 疑問・反語。「ぞや」で「いったい何事か」と尼君が若紫に問いかける表現。',
    },
    { text: '。', layer: 0, grammarTag: { pos: '' } },
  ];
  s5.tokens = [...s5Heads, ...s5.tokens];
  s5.originalText = '「何事ぞや。童べと腹立ちたまへるか。';
  // s4 を削除
  t.sentences.splice(s4Idx, 1);
}

// ── 編集 3: s48 末尾の「（）」削除 ─────────────────────
const s48 = t.sentences.find((s) => s.id === 's48');
{
  // 末尾の「（」「）」 token 2 つを削除
  const last1 = s48.tokens[s48.tokens.length - 1];
  const last2 = s48.tokens[s48.tokens.length - 2];
  if (last1?.text !== '）' || last2?.text !== '（') {
    throw new Error(`s48 tail expected (), got [${last2?.text}][${last1?.text}]`);
  }
  s48.tokens.pop();
  s48.tokens.pop();
  s48.originalText = 'さても、いとうつくしかりつる児かな、何人ならむ、かの人の御代はりに、明け暮れの慰めにも見ばや、と思ふ心深うつきぬ。';
}

// ── 編集 4: s49「（若紫巻）」, s50, s51 (AI 要約) を削除 ─────
{
  const dropIds = ['s49', 's50', 's51'];
  t.sentences = t.sentences.filter((s) => !dropIds.includes(s.id));
}

// ── ID 再採番 (s4 削除と s49-s51 削除でズレが発生) ───────────
let counter = 1;
const idMap = {};
for (const s of t.sentences) {
  const newId = `s${counter}`;
  idMap[s.id] = newId;
  s.id = newId;
  counter++;
}

// 各 sentence 内 token を renumber + start/end 再計算
for (const s of t.sentences) {
  let pos = 0;
  s.tokens = s.tokens.map((tk, i) => {
    const newTk = {
      ...tk,
      id: `${s.id}-t${i + 1}`,
      start: pos,
      end: pos + tk.text.length,
    };
    pos += tk.text.length;
    return newTk;
  });
}

// 検証
let allOk = true;
for (const s of t.sentences) {
  const concat = s.tokens.map((tk) => tk.text).join('');
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

fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');
}

const totalTokens = t.sentences.reduce((n, s) => n + s.tokens.length, 0);
const totalHints = t.sentences.flatMap((s) => s.tokens).filter((tk) => tk.hint).length;
console.log(`Fixed fd3012c216: ${t.sentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
console.log('ID map (old → new):');
for (const [old, neu] of Object.entries(idMap)) {
  if (old !== neu) console.log(`  ${old} → ${neu}`);
}
