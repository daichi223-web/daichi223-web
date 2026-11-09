// 和歌教材の「歌ごとの解説」を、kokugo-vault の教材 MD から public/guides/<id>.json の `poems` に入れる（1教材ずつ）。
//   node scripts/build-poem-guides.mjs f0740d6350 [faa890f809 ...]
// convert-to-v3.mjs は和歌4本の texts-v3 を壊すので（文の分割が崩れる）、和歌の guides はこの script だけで更新する。
// MD → JSON の変換本体は scripts/poem-guides.mjs（convert-to-v3 と共用）。
import fs from "node:fs";
import path from "node:path";
import { buildPoemsSection } from "./poem-guides.mjs";

const ROOT = process.cwd();
const GUIDES = path.join(ROOT, "public", "guides");
const INDEX = path.join(ROOT, "public", "texts", "index.json");
const VAULT = "F:/A2A/NotebookLM/kokugo-vault/30-教材/古文";
// 2026-11-09 教員判断: AI 作成の解説は照合が済むまで vault の下書きに置く（accuracy.md 5）。下書きがあれば下書きを読む
const DRAFTS = "F:/A2A/NotebookLM/kokugo-vault/00-inbox/_教材下書き/古文/和歌";

const ids = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (ids.length === 0) {
  console.error("使い方: node scripts/build-poem-guides.mjs <textId> [...]");
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));

function sectionOf(md, heading) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\s*$`).test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

let failed = 0;
for (const id of ids) {
  const meta = index.find((t) => t.id === id || t.slug === id);
  if (!meta) {
    console.error(`${id}: public/texts/index.json に無い`);
    failed++;
    continue;
  }
  const full = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "texts", `${id}.json`), "utf8"));
  const draftPath = path.join(DRAFTS, `${meta.title}_歌ごとの解説.md`);
  const mdPath = fs.existsSync(draftPath) ? draftPath : path.join(VAULT, full.file_name.replace(/\\/g, "/"));
  if (!fs.existsSync(mdPath)) {
    console.error(`${id}: 教材 MD が無い ${mdPath}`);
    failed++;
    continue;
  }
  const md = fs.readFileSync(mdPath, "utf8");
  const sec = sectionOf(md, "歌ごとの解説");
  const poems = sec ? buildPoemsSection(sec) : null;
  const gp = path.join(GUIDES, `${id}.json`);
  const guide = JSON.parse(fs.readFileSync(gp, "utf8"));
  if (poems) guide.sections.poems = poems;
  else delete guide.sections.poems;
  fs.writeFileSync(gp, JSON.stringify(guide, null, 2) + "\n", "utf8");
  console.log(`${id} ${meta.title}: 歌ごとの解説 ${poems ? poems.items.length : 0} 首 → ${path.relative(ROOT, gp)}`);
}
process.exit(failed ? 1 : 0);
