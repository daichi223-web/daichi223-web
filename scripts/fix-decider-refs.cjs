#!/usr/bin/env node
/**
 * 決め手（public/analysis）の参照切れを、本文の前後関係から貼り直す。
 *
 *   node scripts/fix-decider-refs.cjs           … 検査だけ（書き込みなし）
 *   node scripts/fix-decider-refs.cjs --apply   … 貼り直す
 *   node scripts/fix-decider-refs.cjs <id> ...  … 教材を指定
 *
 * 考え方
 *   本文の分割をやり直すとトークン id が振り直され、決め手の参照先がずれる。
 *   決め手の文言は正しいので作り直さず、「その語が本文のどこに居たか」を
 *   git の古い版から取り出し、同じ前後関係を今の本文で探して id を付け替える。
 *
 *   ・古い版は「その tokenId がまだ在った、いちばん新しい版」を使う
 *   ・まず古い版と今の版の「トークン列」を最長共通部分列で対応づける
 *     （語が同じでも並びで決まるので、同じ語が何度も出ても取り違えない）
 *   ・そこで決まらないものだけ、前後の文脈を狭めながら1か所に決まるか試す
 *   ・どちらでも決まらないものは直さず「要手当て」として出す
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const V3 = path.join(ROOT, 'public', 'texts-v3');
const AN = path.join(ROOT, 'public', 'analysis');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const only = args.filter((a) => !a.startsWith('-'));

const SKIP = /[\s　]/; // 正規化で落とす字

/** 教材1本を「全文の連結」と「トークンの位置」に開く（正規化＝空白を除く） */
function flatten(doc) {
  let norm = '';
  const spans = []; // { id, s, e }（norm 上の位置）
  for (const st of doc.sentences || []) {
    for (const tk of st.tokens || []) {
      const s = norm.length;
      for (const ch of tk.text ?? '') if (!SKIP.test(ch)) norm += ch;
      spans.push({ id: tk.id, text: tk.text ?? '', s, e: norm.length });
    }
  }
  return { norm, spans, byId: new Map(spans.map((x) => [x.id, x])) };
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const gitShow = (rev, rel) => {
  try {
    return JSON.parse(execSync(`git show ${rev}:${rel}`, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
};

/** その tokenId 群がまだ在った、いちばん新しい版を探す */
function findOldVersion(id, wantedIds) {
  const rel = `public/texts-v3/${id}.json`;
  let revs = [];
  try {
    revs = execSync(`git log --format=%H -- ${rel}`, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n').filter(Boolean);
  } catch {
    return null;
  }
  let best = null;
  for (const rev of revs.slice(0, 60)) {
    const doc = gitShow(rev, rel);
    if (!doc) continue;
    const flat = flatten(doc);
    const hit = wantedIds.filter((t) => flat.byId.has(t)).length;
    if (!best || hit > best.hit) best = { rev, flat, hit };
    if (hit === wantedIds.length) break;
  }
  return best;
}

/** 古い版と今の版のトークン列を対応づける（語が同じで並びも合うものを最長でつなぐ） */
function alignTokens(oldSpans, newSpans) {
  const n = oldSpans.length, m = newSpans.length;
  const rows = [new Uint32Array(m + 1)];
  for (let i = 0; i < n; i++) {
    const prev = rows[i];
    const cur = new Uint32Array(m + 1);
    for (let j = 0; j < m; j++) {
      cur[j + 1] = oldSpans[i].text === newSpans[j].text
        ? prev[j] + 1
        : Math.max(cur[j], prev[j + 1]);
    }
    rows.push(cur);
  }
  const map = new Map();
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (oldSpans[i - 1].text === newSpans[j - 1].text && rows[i][j] === rows[i - 1][j - 1] + 1) {
      map.set(oldSpans[i - 1].id, newSpans[j - 1]);
      i--; j--;
    } else if (rows[i - 1][j] >= rows[i][j - 1]) i--;
    else j--;
  }
  return map;
}

/** 前後の文脈を長い順に狭めて、今の本文でちょうど1か所に決まる位置を探す */
function locate(oldFlat, newFlat, span) {
  for (const w of [24, 16, 12, 8, 6, 4]) {
    const left = oldFlat.norm.slice(Math.max(0, span.s - w), span.s);
    const right = oldFlat.norm.slice(span.e, span.e + w);
    const word = oldFlat.norm.slice(span.s, span.e);
    const pat = left + word + right;
    if (pat.length < word.length + 3) continue; // 文脈がほとんど無いものは使わない
    const hits = [];
    let at = newFlat.norm.indexOf(pat);
    while (at >= 0) {
      hits.push(at + left.length);
      at = newFlat.norm.indexOf(pat, at + 1);
      if (hits.length > 4) break;
    }
    if (hits.length === 1) return { pos: hits[0], word, window: w };
  }
  return null;
}

const targets = (only.length ? only : fs.readdirSync(AN).map((f) => f.replace(/\.json$/, '')))
  .filter((id) => fs.existsSync(path.join(AN, `${id}.json`)) && fs.existsSync(path.join(V3, `${id}.json`)));

let nBroken = 0, nFixed = 0, nManual = 0;
const repointed = new Set(); // 第1パスで付け替えた先（第2パスで二重に動かさない）
for (const id of targets) {
  const an = readJson(path.join(AN, `${id}.json`));
  const newFlat = flatten(readJson(path.join(V3, `${id}.json`)));
  const list = an.tokenAnalyses || [];
  const broken = list.filter((t) => t.tokenId && !newFlat.byId.has(t.tokenId));
  if (broken.length === 0) continue;
  nBroken += broken.length;

  const old = findOldVersion(id, broken.map((t) => t.tokenId));
  console.log(`\n${id}  参照切れ ${broken.length} 件` + (old ? `　古い版 ${old.rev.slice(0, 7)}（${old.hit}/${broken.length} 件あり）` : '　古い版が見つからない'));
  if (!old) { nManual += broken.length; continue; }

  const aligned = alignTokens(old.flat.spans, newFlat.spans);

  let changed = 0;
  for (const t of broken) {
    const span = old.flat.byId.get(t.tokenId);
    const label = t.decider?.meaning ?? (t.reasoning ? '足場' : '?');
    if (!span) { console.log(`   ? ${t.tokenId}（${label}）… 古い版にも無い`); nManual++; continue; }
    const byOrder = aligned.get(t.tokenId);
    // 並びで決めたあと、前後の字も見て裏を取る（同じ語の取り違えを防ぐ）
    const ctx = (flat, sp, w) => [
      flat.norm.slice(Math.max(0, sp.s - w), sp.s),
      flat.norm.slice(sp.e, sp.e + w),
    ];
    if (byOrder) {
      const [ol, orr] = ctx(old.flat, span, 6);
      const [nl, nr] = ctx(newFlat, byOrder, 6);
      const tailSame = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++; return k; };
      const headSame = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };
      const agree = Math.max(tailSame(ol, nl), headSame(orr, nr));
      if (agree < 3) {
        console.log(`   ✗ ${t.tokenId}「${span.text}」（${label}）… 並びでは ${byOrder.id} だが前後が合わない（旧「${ol}｜${orr}」/ 新「${nl}｜${nr}」）`);
        nManual++; continue;
      }
    }
    if (byOrder) {
      console.log(`   → ${t.tokenId} → ${byOrder.id}「${byOrder.text}」（${label}、並びで対応）`);
      t.tokenId = byOrder.id;
      repointed.add(`${id}:${byOrder.id}`);
      changed++; nFixed++;
      continue;
    }
    const found = locate(old.flat, newFlat, span);
    if (!found) { console.log(`   ✗ ${t.tokenId}「${span.text}」（${label}）… 一意に決まらない`); nManual++; continue; }
    const hit = newFlat.spans.find((x) => x.s === found.pos && x.e === found.pos + (found.word.length));
    if (!hit) {
      const covering = newFlat.spans.filter((x) => x.s < found.pos + found.word.length && x.e > found.pos);
      console.log(`   ✗ ${t.tokenId}「${span.text}」（${label}）… 区切りが合わない（今は ${covering.map((c) => `${c.id}「${c.text}」`).join('+') || 'なし'}）`);
      nManual++; continue;
    }
    console.log(`   → ${t.tokenId} → ${hit.id}「${hit.text}」（${label}、文脈±${found.window}）`);
    t.tokenId = hit.id;
    repointed.add(`${id}:${hit.id}`);
    changed++; nFixed++;
  }
  if (APPLY && changed > 0) {
    fs.writeFileSync(path.join(AN, `${id}.json`), JSON.stringify(an, null, 2), 'utf8');
    console.log(`   ＝ ${changed} 件を書き込んだ`);
  }
}
console.log(`\n参照切れ ${nBroken} 件 / ${APPLY ? '貼り直した' : '貼り直せる'} ${nFixed} 件 / 要手当て ${nManual} 件`);

// ---- 第2パス: 参照は生きているが、指す語が変わったもの ----------------------
// 本文を切り直すと id は在るまま中身がずれることがある（参照切れにならないので
// T8 では見つからない）。いま作業中で本文を変えた教材だけ、HEAD と語を突き合わせる。
let changedFiles = [];
try {
  changedFiles = execSync('git diff --name-only -- public/texts-v3', { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
} catch {
  /* git が使えない場所では飛ばす */
}

let nShift = 0;
let nShiftFixed = 0;
for (const rel of changedFiles) {
  const id = rel.split('/').pop().replace(/\.json$/, '');
  if (only.length && !only.includes(id)) continue;
  const ap = path.join(AN, `${id}.json`);
  if (!fs.existsSync(ap)) continue;
  const oldDoc = gitShow('HEAD', rel);
  if (!oldDoc) continue;
  const oldFlat = flatten(oldDoc);
  const newFlat = flatten(readJson(path.join(V3, `${id}.json`)));
  const an = readJson(ap);
  const stale = (an.tokenAnalyses || []).filter((t) => {
    const o = oldFlat.byId.get(t.tokenId);
    const n = newFlat.byId.get(t.tokenId);
    if (repointed.has(`${id}:${t.tokenId}`)) return false; // 第1パスで直したものは触らない
    return o && n && o.text !== n.text;
  });
  if (stale.length === 0) continue;
  nShift += stale.length;
  const aligned = alignTokens(oldFlat.spans, newFlat.spans);
  console.log(`\n${id}  指す語が変わった参照 ${stale.length} 件`);
  let changed = 0;
  for (const t of stale) {
    const o = oldFlat.byId.get(t.tokenId);
    const nowPoints = newFlat.byId.get(t.tokenId).text;
    const hit = aligned.get(t.tokenId);
    const label = t.decider?.meaning ?? '?';
    if (!hit) {
      console.log(`   ✗ ${t.tokenId}「${o.text}」（${label}）… 対応先が決まらない`);
      continue;
    }
    console.log(`   → ${t.tokenId}（いまは「${nowPoints}」を指していた）→ ${hit.id}「${hit.text}」（${label}）`);
    t.tokenId = hit.id;
    changed++;
    nShiftFixed++;
  }
  if (APPLY && changed > 0) {
    fs.writeFileSync(ap, JSON.stringify(an, null, 2), 'utf8');
    console.log(`   ＝ ${changed} 件を書き込んだ`);
  }
}
console.log(`\n指す語が変わった参照 ${nShift} 件 / ${APPLY ? '直した' : '直せる'} ${nShiftFixed} 件`);
