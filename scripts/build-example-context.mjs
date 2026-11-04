#!/usr/bin/env node
/**
 * 例文ごとの手当て（誤答に出さない意味・前後の本文・補足）を検査して public/example-context.json を作る。
 *   入力: data/enrich/example-context.jsonl（1例文1行。正本）
 *     {"qid","jp","avoid":[qid],"before","after","contextSource","note","noteBasis","reason"}
 *   出力: public/example-context.json（キー = qid|例文の照合キー。手で編集しない）
 *
 * 検査（1つでも NG なら書き出さずに終了コード1）
 *   - qid が単語データ（src/data/kobunQ.v2.slim.json）にあり、jp がその qid の例文のどれかと一致する
 *   - avoid の qid が存在し、正解と同じ見出し語である（別の語なら警告）
 *   - before / after は contextSource（vault（00-inbox・90_作業中を除く）か public/texts-v3 のファイル）に一字一句ある
 *     （ユーザー方針 2026-11-05: 前後の本文は vault と教材本文からだけ取る）
 *   - note は40字以内で、正解の選択肢の言葉を含まない
 * 照合キーの作り方は src/lib/exampleContext.ts の normExampleText と同じ（src/tests/exampleContext.test.ts で突き合わせ）。
 *
 * 使い方: node scripts/build-example-context.mjs [--check]   （--check は書き出さずに検査だけ）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = path.join(ROOT, 'data', 'enrich', 'example-context.jsonl');
const OUT = path.join(ROOT, 'public', 'example-context.json');
const SLIM = path.join(ROOT, 'src', 'data', 'kobunQ.v2.slim.json');
const VAULT = path.resolve(ROOT, '..', '..', 'NotebookLM', 'kokugo-vault');
// vault の中でも AI 生成の下書き（00-inbox）と作業中（90_作業中）は根拠にしない
const VAULT_EXCLUDED = ['00-inbox', '90_作業中'].map((d) => path.join(VAULT, d) + path.sep);
const TEXTS_V3 = path.join(ROOT, 'public', 'texts-v3');
const checkOnly = process.argv.includes('--check');

export const normExampleText = (jp) =>
  (jp ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[（(][^（）()]*[）)]$/, '')
    .trim();
const squash = (t) => (t ?? '').normalize('NFKC').replace(/\s+/g, '');
const senseText = (s) => squash((s ?? '').replace(/[〔〕]/g, ''));

const slim = JSON.parse(fs.readFileSync(SLIM, 'utf8'));
const byQid = new Map(slim.map((w) => [String(w.qid), w]));

const errors = [];
const warns = [];
const out = {};
const lines = fs.existsSync(SRC) ? fs.readFileSync(SRC, 'utf8').split(/\r?\n/) : [];
const sourceCache = new Map();

function readSource(p) {
  const abs = path.resolve(ROOT, p);
  const inVault = abs.startsWith(VAULT + path.sep) && !VAULT_EXCLUDED.some((d) => abs.startsWith(d));
  const inTexts = abs.startsWith(TEXTS_V3 + path.sep);
  if (!inVault && !inTexts) return { error: `contextSource は vault（00-inbox・90_作業中を除く）か public/texts-v3 に限る: ${p}` };
  if (!fs.existsSync(abs)) return { error: `contextSource が無い: ${p}` };
  if (!sourceCache.has(abs)) sourceCache.set(abs, squash(fs.readFileSync(abs, 'utf8')));
  return { text: sourceCache.get(abs) };
}

lines.forEach((line, i) => {
  if (!line.trim()) return;
  const at = `L${i + 1}`;
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    errors.push(`${at}: JSON が読めない`);
    return;
  }
  const w = byQid.get(String(r.qid));
  if (!w) return errors.push(`${at}: qid ${r.qid} が単語データに無い`);
  const key = normExampleText(r.jp);
  if (!(w.examples ?? []).some((e) => normExampleText(e.jp) === key)) {
    return errors.push(`${at}: ${r.qid} の例文に「${r.jp}」が無い`);
  }
  const entry = {};
  if (Array.isArray(r.avoid) && r.avoid.length) {
    for (const q of r.avoid) {
      const a = byQid.get(String(q));
      if (!a) errors.push(`${at}: avoid の qid ${q} が無い`);
      else if (a.lemma !== w.lemma) warns.push(`${at}: avoid ${q}（${a.lemma}）は ${r.qid}（${w.lemma}）と別の語`);
      if (String(q) === String(r.qid)) errors.push(`${at}: avoid に正解 ${q} 自身が入っている`);
    }
    entry.avoid = r.avoid.map(String);
  }
  for (const side of ['before', 'after']) {
    if (!r[side]) continue;
    if (!r.contextSource) {
      errors.push(`${at}: ${side} があるのに contextSource が無い`);
      continue;
    }
    const src = readSource(r.contextSource);
    if (src.error) {
      errors.push(`${at}: ${src.error}`);
      continue;
    }
    if (!src.text.includes(squash(r[side]))) {
      errors.push(`${at}: ${side}「${r[side]}」が ${r.contextSource} に一字一句ない`);
      continue;
    }
    entry[side] = r[side];
  }
  if (r.note) {
    const note = String(r.note);
    if ([...note].length > 40) errors.push(`${at}: note が40字を超える`);
    const answer = senseText(w.sense);
    if (answer && squash(note).includes(answer)) errors.push(`${at}: note に正解の言葉「${answer}」が入っている`);
    entry.note = note;
  }
  if (Object.keys(entry).length === 0) return;
  const k = `${r.qid}|${key}`;
  if (out[k]) errors.push(`${at}: ${k} が重複`);
  out[k] = entry;
});

for (const m of warns) console.warn('警告', m);
if (errors.length) {
  for (const m of errors) console.error('NG', m);
  console.error(`NG ${errors.length} 件。書き出していません。`);
  process.exit(1);
}
const counts = Object.values(out).reduce(
  (c, e) => ({
    avoid: c.avoid + (e.avoid ? 1 : 0),
    context: c.context + (e.before || e.after ? 1 : 0),
    note: c.note + (e.note ? 1 : 0),
  }),
  { avoid: 0, context: 0, note: 0 }
);
console.log(`OK ${Object.keys(out).length} 例文（誤答に出さない ${counts.avoid}・前後の本文 ${counts.context}・補足 ${counts.note}）`);
if (!checkOnly) {
  fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n', 'utf8');
  console.log(`書き出し: ${path.relative(ROOT, OUT)}`);
}
