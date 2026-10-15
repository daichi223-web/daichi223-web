// 単語帳（330）に紐づく語の「理由」（decider）を書くための材料を、教材ごとに書き出す（読み取りのみ）
// 使い方: npx tsx scripts/vocab-deciders-extract.ts <textId> <outDir>
//   → <outDir>/<textId>.md（執筆者向け：文・語・候補の意味・核・決め手の総則）と <outDir>/<textId>.json（検証用）
import fs from "node:fs";
import path from "node:path";
import { resolveVocabKey } from "../src/lib/vocabAlias";

const [textId, outDir] = process.argv.slice(2);
if (!textId || !outDir) { console.error("usage: tsx scripts/vocab-deciders-extract.ts <textId> <outDir>"); process.exit(1); }
const root = process.cwd();
const text = JSON.parse(fs.readFileSync(path.join(root, "public/texts-v3", `${textId}.json`), "utf8"));
type Q = { qid: string; lemma: string; group?: number; meaning_idx?: number; senseNorm?: string; sense?: string; senseCore?: string; decider?: { clue: string; rule: string }; pos?: string };
const KQ = JSON.parse(fs.readFileSync(path.join(root, "src/data/kobunQ.v2.slim.json"), "utf8")) as Q[];
const byLemma = new Map<string, Q[]>();
for (const q of KQ) { if (!byLemma.has(q.lemma)) byLemma.set(q.lemma, []); byLemma.get(q.lemma)!.push(q); }
let an: Record<string, any> = {};
try { for (const t of JSON.parse(fs.readFileSync(path.join(root, "public/analysis", `${textId}.json`), "utf8")).tokenAnalyses ?? []) an[t.tokenId] = t; } catch { /* 無し */ }

const norm = (s: string) => s.replace(/〔|〕/g, "").trim();
const md: string[] = [`# ${text.title}（${textId}）`, ""];
const items: any[] = [];
for (const s of text.sentences) {
  const targets = (s.tokens as any[]).filter((t) => {
    const g = t.grammarTag ?? {};
    if (g.pos === "助動詞" || /助詞$/.test(g.pos ?? "") || g.pos === "記号") return false;
    return !!resolveVocabKey(t.text, g.baseForm, g.pos);
  });
  if (!targets.length) continue;
  md.push(`## ${s.id}`, `本文：${s.originalText}`, `訳　：${s.modernTranslation ?? ""}`, "");
  for (const t of targets) {
    const g = t.grammarTag ?? {};
    const lemma = resolveVocabKey(t.text, g.baseForm, g.pos)!;
    const senses = (byLemma.get(lemma) ?? []).filter((q) => !g.pos || !q.pos || q.pos === g.pos || true);
    const seen = new Set<string>(); const list: Q[] = [];
    for (const q of senses.sort((a, b) => (a.meaning_idx ?? 0) - (b.meaning_idx ?? 0))) {
      const k = norm(q.senseNorm ?? q.sense ?? ""); if (!k || seen.has(k)) continue; seen.add(k); list.push(q);
    }
    const core = list.find((q) => q.senseCore)?.senseCore;
    md.push(`- **${t.id}**「${t.text}」 見出し：${lemma}　品詞：${g.pos ?? ""}${g.conjugationForm ? "・" + g.conjugationForm : ""}　教材の意味ラベル：${g.meaning ?? "（なし）"}${an[t.id]?.decider ? "　※決め手あり" : ""}`);
    if (core) md.push(`  - 核：${core}`);
    for (const q of list) md.push(`  - 候補 ${q.qid}：${norm(q.senseNorm ?? q.sense ?? "")}${q.decider ? `（総則：${q.decider.rule}）` : ""}`);
    if (t.hint) md.push(`  - 教材のポイント：${t.hint}`);
    items.push({ sentenceId: s.id, tokenId: t.id, text: t.text, lemma, pos: g.pos ?? "", meaning: g.meaning ?? null, candidates: list.map((q) => ({ qid: q.qid, sense: norm(q.senseNorm ?? q.sense ?? "") })), originalText: s.originalText });
  }
  md.push("");
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${textId}.md`), md.join("\n"), "utf8");
fs.writeFileSync(path.join(outDir, `${textId}.json`), JSON.stringify({ textId, title: text.title, items }, null, 1), "utf8");
console.log(`${text.title}: 対象 ${items.length} 語（${new Set(items.map((i) => i.lemma)).size} 見出し）`);
