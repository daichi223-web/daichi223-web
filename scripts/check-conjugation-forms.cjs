// scripts/check-conjugation-forms.cjs
// 直後の助動詞の接続規則から期待される活用形を導出し、誤タグを検出する
//
// 注意点:
//  - 「る」は 助動詞「る」(受身/自発, 未然接続) と
//    助動詞「り」(存続, 四段已然/サ変未然接続) の連体形「る」が同形
//  - 「ぬ」は 助動詞「ぬ」(完了, 連用接続) と
//    助動詞「ず」連体形「ぬ」(未然接続) が同形
//  - 「ね」は 助動詞「ぬ」命令形 (連用接続) と
//    助動詞「ず」已然形 (未然接続) が同形
// これらは next token の meaning/baseForm がはっきりしている場合のみ判定し、
// 曖昧な場合は skip。誤検出を抑える方針。

const fs = require('fs');
const path = require('path');

// 助動詞ごとの「直前に来るべき活用形」
const JODOSHI_RULES = {
  // 未然形接続
  'ず': '未', 'む': '未', 'むず': '未', 'じ': '未',
  'まし': '未', 'まほし': '未',
  'る': '未', 'らる': '未', 'す': '未', 'さす': '未', 'しむ': '未',
  // 連用形接続
  'き': '用', 'けり': '用', 'つ': '用',
  'けむ': '用', 'たし': '用',
  // 終止形接続 (ラ変型は連体形)
  'べし': '終', 'らむ': '終', 'らし': '終',
  'めり': '終', 'まじ': '終',
};

// 終止形接続のうち、ラ変型例外を持つもの
const SHUSHI_RA_HEN_EXCEPTION = new Set(['べし', 'らむ', 'らし', 'めり', 'まじ']);

function isRaHenType(type) {
  if (!type) return false;
  // ラ変、形容詞カリ活用、形容動詞タリ/ナリ活用 はラ変型
  return /ラ変|ラ行変格|カリ|タリ|ナリ/.test(type);
}

function isYodanType(type) {
  if (!type) return false;
  return /四段/.test(type);
}

function isSaHenType(type) {
  if (!type) return false;
  return /サ変|サ行変格/.test(type);
}

// 四段動詞の已然形は e 段で終わる。命令形と同形なので、文末か助動詞「り」前以外では識別困難。
function endsInEDan(text) {
  const last = text[text.length - 1];
  return /[えけげせぜてでねへべぺめれゑ]/.test(last);
}

const dir = path.join(__dirname, '..', 'public', 'texts-v3');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json');
const issues = [];

for (const f of files) {
  let t;
  try {
    t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch (e) {
    console.error('PARSE ERROR', f, e.message);
    continue;
  }
  if (!t.sentences) continue;
  for (const s of t.sentences) {
    if (!s.tokens) continue;
    for (let i = 0; i < s.tokens.length - 1; i++) {
      const tk = s.tokens[i];
      const next = s.tokens[i + 1];
      const gt = tk.grammarTag;
      if (!gt || !gt.conjugationForm) continue;

      const nextGt = next.grammarTag || {};
      const nextPos = nextGt.pos;
      const nextBase = nextGt.baseForm;
      const nextMeaning = nextGt.meaning;
      const nextForm = nextGt.conjugationForm;

      // 直後が助動詞でない場合は判定しない (精度優先)
      if (nextPos !== '助動詞') continue;
      if (!nextBase) continue;

      let expected = JODOSHI_RULES[nextBase];

      // 「る」: 助動詞「る」(受身/自発) は未然接続。「り」(存続) ではない。
      //  → baseForm が「る」のとき = 受身/自発の「る」、未然接続
      //  → baseForm が「り」のとき = 存続の「り」、四段已然/サ変未然接続

      // 「り」(存続) の判定
      if (nextBase === 'り') {
        if (isYodanType(gt.conjugationType)) expected = '已';
        else if (isSaHenType(gt.conjugationType)) expected = '未';
        else continue; // それ以外には接続しないはず → skip
      }

      // 「ぬ」: baseForm が「ぬ」(完了) → 連用接続
      //         baseForm が「ず」で連体形「ぬ」→ 未然接続
      // baseForm「ぬ」なら完了として扱う (JODOSHI_RULES に既定はないが追加)
      if (nextBase === 'ぬ') {
        if (nextMeaning && /打消/.test(nextMeaning)) {
          expected = '未';
        } else {
          expected = '用';
        }
      }
      // 「ず」が直後にある場合も meaning ベースで
      if (nextBase === 'ず') expected = '未';

      // 「なり」「たり」は伝聞推定と断定で接続が違う → meaning が無いと判定不能
      if (nextBase === 'なり' || nextBase === 'たり') {
        if (nextMeaning && /(伝聞|推定)/.test(nextMeaning)) expected = '終';
        else if (nextMeaning && /断定/.test(nextMeaning)) expected = '体'; // 体言 or 連体形 → 動詞なら連体
        else continue;
      }

      if (!expected) continue;

      let acceptable = [expected];
      // ラ変型例外: 終止形接続の助動詞 + 前語がラ変型 → 連体形
      if (SHUSHI_RA_HEN_EXCEPTION.has(nextBase) && isRaHenType(gt.conjugationType)) {
        acceptable = ['体'];
      }
      // 「断定なり」は体言・連体形両方 OK だが、判定は省略

      // 既存タグの全角スペース等のクリーン化
      const actualClean = (gt.conjugationForm || '').replace(/[\s　]/g, '');

      if (!acceptable.includes(actualClean)) {
        issues.push({
          file: f, title: t.title, sid: s.id, tid: tk.id,
          text: tk.text,
          pos: gt.pos,
          type: gt.conjugationType,
          actual: gt.conjugationForm,
          expected: acceptable.join('/'),
          next: next.text,
          nextBase,
          nextMeaning,
        });
      }
    }
  }
}

console.log(`検出件数: ${issues.length}`);
console.log('');
const byFile = {};
for (const x of issues) {
  byFile[x.file] = byFile[x.file] || [];
  byFile[x.file].push(x);
}
for (const [f, list] of Object.entries(byFile)) {
  console.log(`==== ${f} (${list[0].title}) — ${list.length}件 ====`);
  for (const x of list) {
    console.log(`  ${x.sid}/${x.tid} 「${x.text}」(${x.pos || '?'}/${x.type || '?'}) ${x.actual}→${x.expected} 次:「${x.next}」(${x.nextBase}${x.nextMeaning ? '/' + x.nextMeaning : ''})`);
  }
  console.log('');
}
