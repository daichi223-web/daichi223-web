#!/usr/bin/env node
/**
 * 教材データの機械検査（read-only）。
 *
 *   node scripts/check-texts.mjs           … 全件を検査してサマリを出す
 *   node scripts/check-texts.mjs <id>      … 1本だけ
 *   node scripts/check-texts.mjs --json    … 機械可読で出す
 *
 * 人が目で見るのは、この検査を通った後だけにするための道具。
 * 直せるものは直さない（検出だけ）。何も書き換えない。
 *
 * 検査項目
 *   T1 索引の実在      索引の id にファイルが存在するか（texts-v3 / texts）
 *   T1b 索引のズレ     アプリが読む索引（src/data）と public の索引が食い違っていないか
 *   T2 トークン連結    tokens の text を連ねたものが originalText と一致するか
 *   T3 オフセット      token.start/end が originalText の実位置と合っているか
 *   T4 訳の有無        文ごとに訳があるか
 *                     除く: 出典表記の行／編者のあらすじ文／前の行から続いている行
 *                     （和歌集の詞書は2〜3行に割れ、訳は先頭行にまとまっている）
 *   T5 訳の長さ        訳が本文の 3 倍を超えていないか（短文は除外。訳の膨張＝別文の混入を疑う）
 *   T9 訳の使い回し    同じ訳が複数の文に付いていないか（訳の取り違えを疑う）
 *   T10 訳のズレ       隣の文の訳のほうが原文に合っていないか（1文ずれの検出）
 *   T11 歌頭のズレ     「〜……」で始まる和歌の訳が、和歌でない文に付いていないか
 *   T6 文 id の重複    sentence.id / token.id が重複していないか
 *   T7 文法参照        grammarRefId が public/grammar に実在するか
 *   T8 決め手          analysis/<id>.json があるとき、その参照 token が実在するか
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const V3 = path.join(ROOT, 'public/texts-v3');
const TEXTS = path.join(ROOT, 'public/texts');
// アプリが実際に読むのはバンドルされた索引（src/data）。public 側の index.json は
// ビルド成果物で、ズレていても画面には出ないが、生成漏れの目印になる。
const BUNDLED_V3_INDEX = path.join(ROOT, 'src/data/textsV3Index.json');
const PUBLIC_V3_INDEX = path.join(V3, 'index.json');
const GRAMMAR = path.join(ROOT, 'public/grammar');
const ANALYSIS = path.join(ROOT, 'public/analysis');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.find((a) => !a.startsWith('-')) || null;

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(p);
const norm = (s) => (s || '').replace(/\s+/g, '');
// 「（巻第三）」「（第九段・前半）」のような出典表記だけの行は訳す対象ではない
const isCitationOnly = (t) => /^[（(][^（）()]{1,20}[）)]$/.test((t || '').trim());

// 教材には編者による現代語の「あらすじ」文が混ざる（古文本文ではない）。
// これらは品詞分解の対象外なので、文法タグの付いたトークンが1つも無い。
// 訳す対象ではないので「訳なし」に数えない。
// 古文の目印。現代語にも現れる短い形（たれ・しか など）は入れない
// （「討たれた時の」を古文と誤判定していた）
const CLASSICAL = /(けり|けれ|ける|たまふ|給ふ|侍り|はべり|べし|べき|なむ|こそ|ぬれ|らむ|けむ|まじ|ごとし|いはく|なりけ|ざりけ|めり|かな。|にけり)/;
// 歌集名だけの行（古今和歌集・金槐和歌集…）。訳す対象ではない。
const isCollectionName = (t) => /^[^\s\u3000。、]{2,12}(集|抄)$/.test((t || '').trim());

// 前の行から続いている行かどうか。
// 和歌集の教材では詞書が2〜3行に割れ、長歌や今様も複数行に分かれる。
// 正本の訳はその先頭行にまとまっているので、続きの行に訳が無いのは正しい。
const isContinuation = (sentences, i) => {
  if (i === 0) return false;
  const prev = (sentences[i - 1].originalText || '').trim();
  const cur = (sentences[i].originalText || '').trim();
  if (/^[」』）)]/.test(cur)) return true;          // 閉じ括弧で始まる＝前の文の続き
  return prev !== '' && !/[。！？」』）)]$/.test(prev); // 前の行が文末で終わっていない
};

const isEditorSummary = (sentence) => {
  const tokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
  if (tokens.length === 0) return false;
  // 品詞分解の対象になっていない＝古文本文として扱われていない
  const tagged = tokens.filter((t) => (t.grammarTag && t.grammarTag.pos) || t.grammarRefId);
  if (tagged.length > 0) return false;
  const o = (sentence.originalText || '').trim();
  if (o.length < 8 || !o.includes('。')) return false;
  // 古文の目印があれば本文。あらすじ文ではない
  if (CLASSICAL.test(o)) return false;
  return true;
};

// T10 用: 古文→現代語訳では漢字の語（比叡・富士・雀…）がそのまま訳に残ることが多い。
// 原文の漢字2字以上の語が、自分の訳より隣の訳に多く出るなら1文ずれを疑う。
const kanjiWords = (t) => {
  const m = (t || '').match(/[一-鿿]{2,}/g);
  return m ? [...new Set(m)] : [];
};
const overlap = (words, tr) => {
  if (words.length === 0 || !tr) return 0;
  return words.filter((w) => tr.includes(w)).length / words.length;
};

// 和歌・漢詩の訳は「初句……（訳）」の書式で書かれている。
// 頭の「初句」がその文の原文の冒頭と一致していれば正しい訳、しなければ
// 別の文（多くは次の和歌）の訳がここに入っている。
const GLOSS = /^[\s　「]*(.{2,12}?)……/;
const glossHead = (tr) => {
  const m = GLOSS.exec(tr || '');
  return m ? m[1].replace(/[\s　「]/g, '') : null;
};
// 訳の「初句」は本文と表記が揺れる（すこし／少し、ゐ／い など）。
// 前方一致だけだと取りこぼすので、共通部分の長さでも判定する。
const longestCommon = (a, b) => {
  let best = 0;
  for (let x = 0; x < a.length; x++) {
    for (let y = 0; y < b.length; y++) {
      let k = 0;
      while (x + k < a.length && y + k < b.length && a[x + k] === b[y + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
};
const headMatchesOriginal = (head, original) => {
  const o = (original || '').replace(/[\s\u3000「」『』]/g, '');
  if (o.startsWith(head)) return true;
  const window = o.slice(0, head.length + 6);
  return longestCommon(head, window) >= Math.ceil(head.length * 0.6);
};

const grammarIds = new Set(
  exists(GRAMMAR)
    ? fs.readdirSync(GRAMMAR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    : [],
);

const findings = [];
const add = (id, code, detail) => findings.push({ id, code, detail });

// ---- T1: 索引の実在 / T1b: 索引のズレ --------------------------------------
const index = exists(BUNDLED_V3_INDEX) ? read(BUNDLED_V3_INDEX) : [];
const ids = index.map((t) => t.id).filter(Boolean);
for (const t of index) {
  if (!exists(path.join(V3, `${t.id}.json`))) add(t.id, 'T1-v3欠', `texts-v3/${t.id}.json がない`);
  // /texts/<slug>.json は検索と教材詳細ページが実行時に取りにいく
  if (exists(TEXTS) && !exists(path.join(TEXTS, `${t.id}.json`))) {
    add(t.id, 'T1-texts欠', `texts/${t.id}.json がない（全文検索と /texts/${t.id} が動かない）`);
  }
}
if (exists(PUBLIC_V3_INDEX)) {
  const pub = new Set(read(PUBLIC_V3_INDEX).map((t) => t.id));
  for (const t of index) {
    if (!pub.has(t.id)) add(t.id, 'T1b-索引ズレ', 'public/texts-v3/index.json に無い（生成漏れ）');
  }
  for (const id of pub) {
    if (!ids.includes(id)) add(id, 'T1b-索引ズレ', 'src/data/textsV3Index.json に無い');
  }
}

// ---- 本体 -----------------------------------------------------------------
const targets = only ? ids.filter((i) => i === only) : ids;
if (only && targets.length === 0) {
  console.error(`id "${only}" は index.json にない`);
  process.exit(1);
}

let checked = 0;
for (const id of targets) {
  const p = path.join(V3, `${id}.json`);
  if (!exists(p)) continue;
  let doc;
  try {
    doc = read(p);
  } catch (e) {
    add(id, 'T0-壊れJSON', String(e.message).slice(0, 120));
    continue;
  }
  checked++;
  const sentences = Array.isArray(doc.sentences) ? doc.sentences : [];
  const seenSentence = new Set();
  const seenToken = new Set();

  for (const s of sentences) {
    if (seenSentence.has(s.id)) add(id, 'T6-文id重複', s.id);
    seenSentence.add(s.id);

    const original = s.originalText || '';
    const tokens = Array.isArray(s.tokens) ? s.tokens : [];

    // T2 連結一致
    const joined = tokens.map((t) => t.text || '').join('');
    if (tokens.length > 0 && norm(joined) !== norm(original)) {
      add(id, 'T2-連結不一致', `${s.id}: tokens=${joined.length}字 / 本文=${original.length}字`);
    }

    // T3 オフセット
    for (const t of tokens) {
      if (seenToken.has(t.id)) add(id, 'T6-token id重複', t.id);
      seenToken.add(t.id);
      if (typeof t.start === 'number' && typeof t.end === 'number') {
        const slice = original.slice(t.start, t.end);
        if (slice !== (t.text || '')) {
          add(id, 'T3-オフセットずれ', `${t.id}: 本文[${t.start},${t.end}]="${slice}" ≠ "${t.text}"`);
        }
      }
      // T7 文法参照
      if (t.grammarRefId && !grammarIds.has(t.grammarRefId)) {
        add(id, 'T7-文法参照切れ', `${t.id}: ${t.grammarRefId}`);
      }
    }

    // T4/T5 訳
    const tr = s.modernTranslation || '';
    if (!tr) {
      const idx = sentences.indexOf(s);
      if (
        !isCitationOnly(original) &&
        !isEditorSummary(s) &&
        !isCollectionName(original) &&
        !isContinuation(sentences, idx)
      ) {
        add(id, 'T4-訳なし', s.id);
      }
    } else if (
      original.length >= 15 &&
      tr.length > original.length * 3 &&
      // 和歌・俳句の行（句点が無く短い）は、訳が原文より長くなって当然
      !(original.length <= 45 && !original.includes('。'))
    ) {
      // 短い文（「」だけ等）は訳が長くなって当然なので見ない。
      // 和歌の訳（「初句……」書式）は原文より長くなるのが normal なので、
      // 頭がこの文の原文と一致していれば数えない。
      const head = glossHead(tr);
      if (!(head && headMatchesOriginal(head, original))) {
        add(id, 'T5-訳が長すぎ', `${s.id}: 本文${original.length}字 → 訳${tr.length}字`);
      }
    }
    // T11 歌頭のズレ: 「初句……」の初句がこの文の原文と合わない
    {
      const head = glossHead(tr);
      if (head && !headMatchesOriginal(head, original)) {
        add(id, 'T11-歌頭のズレ', `${s.id}: 訳が「${head}……」で始まるが、この文の原文は「${original.slice(0, 14)}」`);
      }
    }
  }

  // T9 訳の使い回し（同じ訳が複数の文に付いている＝取り違えを疑う）
  const trMap = new Map();
  for (const s of sentences) {
    const tr = (s.modernTranslation || '').trim();
    if (tr.length < 10) continue; // 「」など短い訳は一致して当然
    if (!trMap.has(tr)) trMap.set(tr, []);
    trMap.get(tr).push(s.id);
  }
  for (const [tr, sids] of trMap) {
    if (sids.length >= 2) {
      add(id, 'T9-訳の使い回し', `${sids.join(',')} が同じ訳「${tr.slice(0, 24)}…」`);
    }
  }

  // T10 訳のズレ（隣の訳のほうが原文に合う）
  for (let i = 0; i < sentences.length; i++) {
    const words = kanjiWords(sentences[i].originalText || '');
    if (words.length < 2) continue; // 手がかりが少ない文は判定しない
    // 訳が無い文のズレは判定しない（訳が無いこと自体は T4 の担当。
    // 詞書の続き行のように訳が先頭行にまとまっているケースを二重に数えない）
    if (!(sentences[i].modernTranslation || '').trim()) continue;
    const own = overlap(words, sentences[i].modernTranslation || '');
    const next = i + 1 < sentences.length ? overlap(words, sentences[i + 1].modernTranslation || '') : 0;
    const prev = i > 0 ? overlap(words, sentences[i - 1].modernTranslation || '') : 0;
    const best = Math.max(own, next, prev);
    if (best > 0 && best - own > 0.34) {
      add(id, 'T10-訳のズレ', `${sentences[i].id}: 自分の訳との一致 ${own.toFixed(2)} < ${next >= prev ? '次' : '前'}の訳 ${best.toFixed(2)}`);
    }
  }

  // T8 決め手
  const ap = path.join(ANALYSIS, `${id}.json`);
  if (exists(ap)) {
    let an;
    try {
      an = read(ap);
    } catch (e) {
      add(id, 'T0-壊れJSON(analysis)', String(e.message).slice(0, 120));
      an = null;
    }
    const deciders = an && (an.deciders || an.tokens || []);
    if (Array.isArray(deciders)) {
      for (const d of deciders) {
        const tid = d.tokenId || d.id;
        if (tid && !seenToken.has(tid)) add(id, 'T8-決め手の参照切れ', tid);
      }
    }
  }
}

// ---- 出力 -----------------------------------------------------------------
if (asJson) {
  console.log(JSON.stringify({ checked, findings }, null, 2));
  process.exit(findings.length > 0 ? 1 : 0);
}

const byCode = new Map();
for (const f of findings) byCode.set(f.code, (byCode.get(f.code) || 0) + 1);
const byText = new Map();
for (const f of findings) byText.set(f.id, (byText.get(f.id) || 0) + 1);

console.log(`検査: ${checked} 本 / 指摘 ${findings.length} 件`);
if (findings.length === 0) {
  console.log('問題なし。');
  process.exit(0);
}
console.log('\n種類別:');
for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${code}`);
}
console.log('\n指摘の多い教材 上位10本:');
const titleOf = Object.fromEntries(index.map((t) => [t.id, t.title]));
for (const [id, n] of [...byText].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(5)}  ${id}  ${titleOf[id] || ''}`);
}
console.log('\n例（各種類の先頭3件）:');
const shown = new Map();
for (const f of findings) {
  const n = shown.get(f.code) || 0;
  if (n >= 3) continue;
  shown.set(f.code, n + 1);
  console.log(`  [${f.code}] ${f.id}: ${f.detail}`);
}
process.exit(1);
