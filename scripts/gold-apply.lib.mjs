// gold-apply.lib.mjs
// 手書き gold decider を検証つきで analysis/<id>.json にマージ適用する共通関数。
// 各バッチスクリプトは GOLD(textId→tokenId→decider) を渡すだけ。
import fs from "node:fs";
import path from "node:path";
import { loadText } from "./text-deciders.lib.mjs";

const TYPES = new Set(["後接", "呼応", "形", "主語", "文脈"]);
function occ(h, n) { if (!n) return 0; let c = 0, i = 0; while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; } return c; }

/**
 * GOLD を検証して書き込む。
 * 検証: token存在 / type∈5種 / summary>=10字 / cue.text は本文の部分文字列かつ文中1回出現。
 * 書込み: 既存 reasoning と他 token は保持してマージ。検証エラーがあれば何も書かずに throw。
 * @returns {applied:number, offsetWarn:string[]}
 */
export function applyGold(GOLD, { root = ".", write = true } = {}) {
  const errs = [];
  const offsetWarn = [];
  const texts = {};
  for (const [textId, deciders] of Object.entries(GOLD)) {
    const text = loadText(textId, root);
    texts[textId] = text;
    const sentOf = {}, span = {}, tok = new Set();
    for (const s of text.sentences) for (const t of s.tokens) { sentOf[t.id] = s.originalText; span[t.id] = t; tok.add(t.id); }
    for (const [tid, d] of Object.entries(deciders)) {
      if (!tok.has(tid)) { errs.push(`${textId} ${tid}: token不在`); continue; }
      if (!TYPES.has(d.type)) errs.push(`${textId} ${tid}: type ${d.type}`);
      if (!d.summary || d.summary.length < 10) errs.push(`${textId} ${tid}: summary弱`);
      if (!Array.isArray(d.cues) || d.cues.length === 0) errs.push(`${textId} ${tid}: cue無し`);
      const sent = sentOf[tid];
      for (const c of d.cues || []) {
        if (!TYPES.has(c.type)) errs.push(`${textId} ${tid}: cue type ${c.type}`);
        if (c.text !== "") {
          if (!sent.includes(c.text)) errs.push(`${textId} ${tid}: cue "${c.text}" 本文になし`);
          else if (occ(sent, c.text) > 1) errs.push(`${textId} ${tid}: cue "${c.text}" 複数出現(${occ(sent, c.text)})`);
        }
      }
      const t = span[tid];
      if (t && sentOf[tid].slice(t.start, t.end) !== t.text) offsetWarn.push(`${textId} ${tid}`);
    }
  }
  if (errs.length) { for (const e of errs) console.error("✗ " + e); throw new Error(`検証エラー ${errs.length} 件。書込み中止。`); }

  let applied = 0;
  if (write) {
    for (const [textId, deciders] of Object.entries(GOLD)) {
      const outPath = path.join(root, "public/analysis", `${textId}.json`);
      let cur = { textId, tokenAnalyses: [] };
      try { cur = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { /* 新規 */ }
      const byId = new Map((cur.tokenAnalyses || []).map((a) => [a.tokenId, a]));
      for (const [tid, d] of Object.entries(deciders)) {
        const entry = byId.get(tid) || { tokenId: tid };
        entry.decider = d;
        byId.set(tid, entry);
        applied++;
      }
      fs.writeFileSync(outPath, JSON.stringify({ textId, tokenAnalyses: [...byId.values()] }, null, 2) + "\n");
      console.log(`✓ ${textId}: ${Object.keys(deciders).length} gold / 全 ${byId.size} entries`);
    }
  }
  if (offsetWarn.length) console.warn(`⚠ オフセット不一致(【】はonlyOnceで対応): ${offsetWarn.join(", ")}`);
  console.log(`適用 ${applied} 件 / エラー 0`);
  return { applied, offsetWarn };
}
