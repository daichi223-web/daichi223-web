// 品詞が空のトークンのうち、接頭語・接尾語・名詞と決められるものに品詞を入れる（全教材・何度流しても同じ結果）。
// 2026-10-23。品詞が空だと別名表（src/lib/vocabAlias.ts）が同形の別語に紐づける：
//   接頭語「うち」→ 名詞「うち（内）」、接尾語「たち」→ 動詞「たつ」、接尾語「さ」→ 副詞「さ」、
//   名詞「ふし（節）」→ 動詞「ふす」、名詞「ありか」→ 動詞「ありく」 など。
// vault の品詞分解表はこれらを空欄で書くのが標準なので、convert-to-v3.mjs で作り直したらこのスクリプトを流し直す。
//
// 使い方: node scripts/fix-affix-pos.cjs [--dry] [public|dist ...]   （既定は public と dist の両方）
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const bases = args.filter((a) => !a.startsWith("--"));
const roots = (bases.length ? bases : ["public", "dist"]).map((b) => path.join(__dirname, "..", b, "texts-v3"));

const PREFIX = new Set(["うち", "かき", "ひき", "さし", "もて", "おし", "とり", "あひ"]);
const SUFFIX = new Set(["ども", "たち", "ら", "ばら"]);
// 名詞なのに動詞の基本形が入っているもの（表層形 → 正しい基本形。null は基本形を外す）
const NOUN_FIX = { ふし: null, ありか: null, つか: null, なか: null, よし: "よし" };

const posOf = (t) => (t && t.grammarTag && t.grammarTag.pos) || "";
const isVerb = (t) => ["動詞", "補助動詞"].includes(posOf(t));

let changed = 0;
const log = {};
for (const dir of roots) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const p = path.join(dir, f);
    const raw = fs.readFileSync(p, "utf8");
    const d = JSON.parse(raw);
    if (!Array.isArray(d.sentences)) continue;
    let n = 0;
    for (const s of d.sentences) {
      const T = s.tokens || [];
      T.forEach((t, i) => {
        const g = t.grammarTag;
        if (!g || posOf(t) !== "") return;
        const prev = T[i - 1], next = T[i + 1];
        let rule = null;
        if (PREFIX.has(t.text) && isVerb(next)) {
          g.pos = "接頭語"; delete g.baseForm; rule = "接頭語";
        } else if (SUFFIX.has(t.text) && prev && posOf(prev) !== "記号" && !(t.text === "ら" && prev.text === "もの")) {
          g.pos = "接尾語"; delete g.baseForm; rule = "接尾語";
        } else if (t.text === "さ" && prev && (/し$/.test(prev.text) || ["形容詞", "形容動詞"].includes(posOf(prev)))) {
          g.pos = "接尾語"; delete g.baseForm; rule = "接尾語さ";
        } else if (t.text === "わたり" && prev && prev.text === "の") {
          g.pos = "名詞"; delete g.baseForm; rule = "名詞わたり";
        } else if (Object.prototype.hasOwnProperty.call(NOUN_FIX, t.text) && g.baseForm && g.baseForm !== t.text) {
          g.pos = "名詞";
          if (NOUN_FIX[t.text]) g.baseForm = NOUN_FIX[t.text]; else delete g.baseForm;
          rule = "名詞";
        }
        if (rule) { n++; log[`${rule}:${t.text}`] = (log[`${rule}:${t.text}`] || 0) + 1; }
      });
    }
    if (n) {
      changed += n;
      // 元の書式（indent=2・改行コード）を保つ
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      let out = JSON.stringify(d, null, 2).replace(/\n/g, eol);
      if (raw.endsWith(eol)) out += eol;
      if (!dry) fs.writeFileSync(p, out, "utf8");
    }
  }
}
console.log(`${dry ? "DRY " : ""}${changed} トークン`, log);
