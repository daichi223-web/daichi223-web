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
  'き': '用', 'けり': '用', 'つ': '用', 'ぬ': '用',
  'たり': '用', // 完了「たり」(断定「たり」は別途処理)
  'けむ': '用', 'たし': '用',
  // 終止形接続 (ラ変型は連体形)
  'べし': '終', 'らむ': '終', 'らし': '終',
  'めり': '終', 'まじ': '終',
};

// 終止形接続のうち、ラ変型例外を持つもの
const SHUSHI_RA_HEN_EXCEPTION = new Set(['べし', 'らむ', 'らし', 'めり', 'まじ']);

// 接続助詞ごとの「直前に来るべき活用形」
// 注: 「に」「を」「が」「ものを」等の連体形接続は誤検出回避のため厳密判定 (体言直後は接続助詞ではないことが多い)
// 「ば」は未然 (順接仮定) と已然 (順接確定) の二者択一
// 「とも」は動詞・助動詞は終止形、形容詞・形容動詞は連用形
const PARTICLE_RULES = {
  'て': ['用'],
  'して': ['用'],
  'つつ': ['用'],
  'ながら': ['用'],   // 体言接続「~ながら」もあるが、pos=接続助詞 と明示タグされていれば連用扱い
  'で': ['未'],       // 打消接続
  'ば': ['未', '已'], // 順接仮定/順接確定
  'ど': ['已'],
  'ども': ['已'],
  'とも': ['終'],     // 形容詞・形容動詞は連用 — 別途分岐
  'を': ['体'],
  'に': ['体'],
  'が': ['体'],
  'ものを': ['体'],
  'ものから': ['体'],
  'ものの': ['体'],
  'ものゆゑ': ['体'],
  'からに': ['体'],
  'ほどに': ['体'],
};

function isRaHenType(type) {
  if (!type) return false;
  // ラ変、形容詞カリ活用、形容動詞タリ/ナリ活用 はラ変型
  return /ラ変|ラ行変格|カリ|タリ活用|ナリ活用/.test(type);
}

// 形容詞カリ活用の連体形語尾: 〜かる / 〜しかる / 〜かり (連用) / 〜かれ (已然・命令)
function isKariRentai(text) {
  return /(?:し)?かる$/.test(text);
}

// ラ変型助動詞の text 連体形検出 (なる/ざる/べかる/たる/たれ/ごとくなる など)
function isAuxRentaiRaHen(text) {
  return /(?:なる|ざる|べかる|たる|めれ|べけれ|ざれ|ごとくなる|たれ)$/.test(text);
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

// 活用形の表記揺れを正規化: 未/未然/未然形 → "未", 用/連用/連用形 → "用" など
function normalizeForm(s) {
  if (!s) return s;
  const cleaned = String(s).replace(/[\s　形]/g, '');
  const map = { '未然': '未', '連用': '用', '終止': '終', '連体': '体', '已然': '已', '命令': '命' };
  return map[cleaned] || cleaned;
}

// 助動詞の baseForm が抜けているケースのために、text + meaning から baseForm を推定
function inferAuxBaseForm(text, meaning) {
  if (!text) return null;
  const t = text;
  const m = meaning || '';
  // 完了「ぬ」: な/に/ぬ/ぬる/ぬれ/ね
  if (/完了/.test(m) && /^(な|に|ぬ|ぬる|ぬれ|ね)$/.test(t)) return 'ぬ';
  // 打消「ず」: (な/に/ず) /ず/ぬ/ね /ざら/ざり/ざる/ざれ
  if (/打消/.test(m) && /^(ず|ぬ|ね|ざら|ざり|ざる|ざれ|ざ)$/.test(t)) return 'ず';
  // 完了「つ」: て/て/つ/つる/つれ/てよ
  if (/完了/.test(m) && /^(て|つ|つる|つれ|てよ)$/.test(t)) return 'つ';
  // 過去「き」: (せ)/_/き/し/しか/_
  if (/過去/.test(m) && /^(き|し|しか|せ)$/.test(t)) return 'き';
  // 過去「けり」: (けら)/_/けり/ける/けれ/_
  if (/(過去|詠嘆)/.test(m) && /^(けり|ける|けれ|けら)$/.test(t)) return 'けり';
  // 完了存続「たり」: たら/たり/たり/たる/たれ/たれ
  if (/(完了|存続)/.test(m) && /^(たら|たり|たる|たれ)$/.test(t)) return 'たり';
  // 過去推量「けむ」: _/_/けむ/けむ/けめ/_
  if (/(過去推量|過去の|過去)/.test(m) && /^(けむ|けめ)$/.test(t)) return 'けむ';
  // 推量「む」「むず」「じ」「まし」「まほし」
  if (/推量|意志|婉曲|仮定/.test(m) && /^(む|め|ん)$/.test(t)) return 'む';
  if (/反実仮想/.test(m) && /^(まし|ましか|ませ)$/.test(t)) return 'まし';
  // 推量「べし」: べから/べく・べかり/べし/べき・べかる/べけれ/_  (ウ音便「べう」も連用)
  if (/推量|当然|意志|可能|命令|適当/.test(m) && /^(べし|べき|べく|べう|べかり|べから|べかる|べけれ)$/.test(t)) return 'べし';
  // 現在推量「らむ」
  if (/現在推量/.test(m) && /^(らむ|らめ|らん)$/.test(t)) return 'らむ';
  // 推定「めり」
  if (/推定|婉曲/.test(m) && /^(めり|める|めれ)$/.test(t)) return 'めり';
  // 打消推量「まじ」  (ウ音便「まじう」も連用)
  if (/(打消推量|打消意志|打消当然|不可能)/.test(m) && /^(まじ|まじき|まじく|まじう|まじかり|まじから|まじかる|まじけれ)$/.test(t)) return 'まじ';
  // 願望「たし」  (ウ音便「たう」も連用)
  if (/(願望|希望)/.test(m) && /^(たし|たき|たく|たう|たかり|たから|たかる|たけれ)$/.test(t)) return 'たし';
  // 受身/自発/可能/尊敬「る」「らる」
  if (/(受身|自発|可能|尊敬)/.test(m) && /^(る|れ|るる|るれ|られ)$/.test(t)) return /^ら/.test(t) ? 'らる' : 'る';
  // 使役/尊敬「す」「さす」「しむ」
  if (/(使役|尊敬)/.test(m)) {
    if (/^(す|せ|する|すれ|せよ)$/.test(t)) return 'す';
    if (/^(さす|させ|さする|さすれ|させよ)$/.test(t)) return 'さす';
    if (/^(しむ|しめ|しむる|しむれ|しめよ)$/.test(t)) return 'しむ';
  }
  return null;
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
      let nextBase = nextGt.baseForm;
      const nextMeaning = nextGt.meaning;
      const nextForm = nextGt.conjugationForm;

      // === 接続助詞経路 ===
      if (nextPos === '接続助詞') {
        // text の句読点除去で正規化
        const partKey = (next.text || '').replace(/[、。「」]/g, '');
        const partRule = PARTICLE_RULES[partKey];
        if (!partRule) continue;

        let partAcceptable = [...partRule];

        // 「で」: 直前が音便形 (ん/い/っ) の場合は「て」の連濁形なので連用接続を許容
        // 例: 「病んで」(病み+て連濁)、「飛んで」(飛び+て連濁)
        if (partKey === 'で') {
          const lastChar = (tk.text || '').slice(-1);
          if (['ん', 'い', 'っ'].includes(lastChar)) {
            partAcceptable = ['用', '未'];
          }
        }

        // 「とも」: 形容詞・形容動詞は連用形、形容詞型助動詞 (べし/まじ/たし/まほし/ごとし) も連用形可
        // 近世以降の サ変・カ変 で 連体形 + とも (「するとも」「来るとも」) も成立
        if (partKey === 'とも') {
          if (/(形容詞|形容動詞)/.test(gt.pos || '')) {
            partAcceptable = ['用'];
          } else if (gt.pos === '助動詞') {
            const inferred = gt.baseForm || inferAuxBaseForm(tk.text, gt.meaning);
            if (inferred && /^(べし|まじ|たし|まほし|ごとし)$/.test(inferred)) {
              partAcceptable = ['用', '終'];
            }
          } else if (/(サ変|サ行変格|カ変|カ行変格)/.test(gt.conjugationType || '')) {
            // 近世テキスト (不易流行など) で「するとも」「来るとも」が見られる
            partAcceptable = ['終', '体'];
          }
        }

        // 「ながら」: 接続助詞 (連用接続) と副助詞 (体言・連体接続) の二用法
        // 「ありしながらの匂ひ」のように 連体形 + ながら も成立 (副助詞用法)
        if (partKey === 'ながら') {
          partAcceptable = ['用', '体'];
        }

        const actualClean = normalizeForm(gt.conjugationForm);
        const partAccNorm = partAcceptable.map(normalizeForm);
        if (!partAccNorm.includes(actualClean)) {
          issues.push({
            file: f, title: t.title, sid: s.id, tid: tk.id,
            text: tk.text,
            pos: gt.pos,
            type: gt.conjugationType,
            actual: gt.conjugationForm,
            expected: partAcceptable.join('/'),
            next: next.text,
            nextBase: '(接続助詞)' + partKey,
            nextMeaning,
          });
        }
        continue;
      }

      // 直後が助動詞でない場合は判定しない (精度優先)
      if (nextPos !== '助動詞') continue;
      // baseForm 欠落時は text+meaning から推定
      if (!nextBase) nextBase = inferAuxBaseForm(next.text, nextMeaning);
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
      // ラ変型例外: 終止形接続の助動詞 (べし/めり/まじ/らむ/らし) は
      // ラ変型語尾の語の後では連体形に接続する。
      // 加えて、平安以降は撥音便化により連体形末尾「る」が脱落する現象もある
      // (「なるめり→なめり」「べかるめり→べかめり」「多かるめり→多かめり」など)。
      // そのため、conjugationForm が「体」と明示的にタグされていて、かつ
      // 次が終止接続例外助動詞であれば、ラ変型接続パターンとして許容する。
      if (SHUSHI_RA_HEN_EXCEPTION.has(nextBase)) {
        const raHen =
          isRaHenType(gt.conjugationType) ||
          (gt.pos === '形容詞' && isKariRentai(tk.text)) ||
          (gt.pos === '助動詞' && isAuxRentaiRaHen(tk.text));
        if (raHen) acceptable = ['体'];
        // 明示的に連体形タグされている場合 (撥音便を含む) は許容
        if (normalizeForm(gt.conjugationForm) === '体') acceptable = ['体'];
      }
      // 「き」の特殊接続: カ変・サ変の未然形にも接続する
      if (nextBase === 'き' && /(カ変|サ変|カ行変格|サ行変格)/.test(gt.conjugationType || '')) {
        acceptable = ['未', '用'];
      }
      // 「断定なり」は体言・連体形両方 OK だが、判定は省略

      // 既存タグの表記揺れ正規化 (未然/未然形/未 などを統一)
      const actualClean = normalizeForm(gt.conjugationForm);
      const acceptableNorm = acceptable.map(normalizeForm);

      if (!acceptableNorm.includes(actualClean)) {
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
