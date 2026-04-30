#!/usr/bin/env node
/**
 * 萩のうは露 (467249bc39) — 源氏物語 御法巻 紫の上臨終 を正典本文に合わせて修正。
 *
 * 主な修正:
 *  s1  「、脇息」「「今日」「。」」のように複数語が結合したトークンを分割
 *  s5  末尾の重複した「「今は渡らせたまひね。」を削除
 *      (s5 は「悲しかりける。」で終わるべき。次の s6 にすでに同じ文があるため)
 *  s6  単一トークン「｢今は渡らせたまひね。」を正規の「「今は渡らせたまひね。」(全角開き括弧) に
 *      正規化したうえで品詞分解 (s5 末尾と同じトークン構成)
 *  s11 末尾に残った「（）」(空の括弧2トークン) を削除
 *
 * 既存の hint, learningPoints は保持。
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'texts-v3', '467249bc39.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '467249bc39.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── 編集 1: s1 の「、脇息」「「今日」「。」」のような結合トークンを分割 ───
const s1 = t.sentences.find(s => s.id === 's1');
{
  // 「、脇息」 → 「、」+「脇息」
  let idx = s1.tokens.findIndex(tk => tk.text === '、脇息');
  if (idx !== -1) {
    s1.tokens.splice(idx, 1,
      { text: '、', layer: 0, grammarTag: { pos: '' } },
      { text: '脇息', layer: 0, grammarTag: { pos: '' } }
    );
  }
  // 「「今日」 → 「「」+「今日」
  idx = s1.tokens.findIndex(tk => tk.text === '「今日');
  if (idx !== -1) {
    s1.tokens.splice(idx, 1,
      { text: '「', layer: 0, grammarTag: { pos: '' } },
      { text: '今日', layer: 0, grammarTag: { pos: '' } }
    );
  }
  // 「。」」 → 「。」+「」」
  idx = s1.tokens.findIndex(tk => tk.text === '。」');
  if (idx !== -1) {
    s1.tokens.splice(idx, 1,
      { text: '。', layer: 0, grammarTag: { pos: '' } },
      { text: '」', layer: 0, grammarTag: { pos: '' } }
    );
  }
  // originalText は変更なし (本文は同じ)
}

// ── 編集 2: s5 末尾の重複した「「今は渡らせたまひね。」を削除 ──
const s5 = t.sentences.find(s => s.id === 's5');
{
  // 末尾7トークン (「、今は、渡ら、せ、たまひ、ね、。) を削除
  // 確実に場所を特定するため、最後の「ける」「。」の直後から削除
  const idxKeru = s5.tokens.findIndex(tk => tk.text === 'ける' && tk.grammarTag?.meaning === '過去');
  if (idxKeru === -1) throw new Error('s5: 「ける」 not found');
  // 「ける」の後に「。」があるはず
  const idxPeriod = idxKeru + 1;
  if (s5.tokens[idxPeriod].text !== '。') throw new Error('s5: 「ける」 の後の「。」が見つからない');
  // 「。」より後ろを全削除
  s5.tokens.splice(idxPeriod + 1);
  s5.originalText = 'と聞こえかはしたまふ御容貌どもあらまほしく、見るかひあるにつけても、かくて千年を過ぐすわざもがな、と思さるれど、心にかなはぬことなれば、かけとめむ方なきぞ悲しかりける。';
}

// ── 編集 3: s6 を正規の品詞分解に ──
// 「｢今は渡らせたまひね。」(半角開き括弧の単一トークン) を
// 「「今は渡らせたまひね。」(全角開き括弧) に正規化
const s6 = t.sentences.find(s => s.id === 's6');
{
  s6.tokens = [
    { text: '「', layer: 0, grammarTag: { pos: '' } },
    { text: '今は', layer: 0, grammarTag: { pos: '副詞', baseForm: 'いまは' } },
    { text: '渡ら', layer: 1, grammarTag: { pos: '動詞', conjugationType: 'ラ四', conjugationForm: '未', baseForm: 'わたる' }, grammarRefId: 'doushi-katsuyo' },
    { text: 'せ', layer: 2, grammarTag: { pos: '助動詞', conjugationForm: '用', meaning: '尊敬', baseForm: 'す' }, grammarRefId: 'jodoshi-keigo' },
    { text: 'たまひ', layer: 4, grammarTag: { pos: '補助動詞', conjugationType: 'ハ四', conjugationForm: '用', baseForm: 'たまふ', honorific: '尊敬' }, grammarRefId: 'doushi-katsuyo' },
    { text: 'ね', layer: 2, grammarTag: { pos: '助動詞', conjugationForm: '命', meaning: '強意', baseForm: 'ぬ' }, grammarRefId: 'jodoshi-jisei' },
    { text: '。', layer: 0, grammarTag: { pos: '' } },
  ];
  s6.originalText = '「今は渡らせたまひね。';
}

// ── 編集 4: s11 末尾の「（）」を削除 ──
const s11 = t.sentences.find(s => s.id === 's11');
{
  // 末尾の「（」「）」を削除
  while (s11.tokens.length > 0) {
    const last = s11.tokens[s11.tokens.length - 1];
    if (last.text === '）' || last.text === '（') {
      s11.tokens.pop();
    } else {
      break;
    }
  }
  s11.originalText = 'さきざきも、かくて生き出でたまふをりにならひたまひて、御物の怪と疑ひたまひて、夜一夜、さまざまのことをし尽くさせたまへど、かひもなく、明けはつるほどに消えはてたまひぬ。';
}

// ── 全 sentence で id / start / end を再採番 ──
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

// ── 検証 ──
let allOk = true;
for (const s of t.sentences) {
  const concat = s.tokens.map(tk => tk.text).join('');
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
const totalHints = t.sentences.flatMap(s => s.tokens).filter(tk => tk.hint && tk.hint.trim()).length;
console.log(`Fixed 467249bc39: ${t.sentences.length} sentences, ${totalTokens} tokens, ${totalHints} hints`);
