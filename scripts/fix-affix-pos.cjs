// 品詞が空のトークンのうち、接頭語・接尾語・名詞と決められるものに品詞を入れる（全教材・何度流しても同じ結果）。
// 2026-10-23。品詞が空だと別名表（src/lib/vocabAlias.ts）が同形の別語に紐づける：
//   接頭語「うち」→ 名詞「うち（内）」、接尾語「たち」→ 動詞「たつ」、接尾語「さ」→ 副詞「さ」、
//   名詞「ふし（節）」→ 動詞「ふす」、名詞「ありか」→ 動詞「ありく」 など。
// vault の品詞分解表はこれらを空欄で書くのが標準なので、convert-to-v3.mjs で作り直したらこのスクリプトを流し直す。
// 2026-10-25 追加：接尾語「さ」は前の語が品詞の空いた語幹（危ふ・いみじ・心細・おぼつかな・はや・不思議 など）でも拾う
//   （vault は「（接尾）」と書いているが変換で落ちていた）。あわせて、同音の別語に基本形を入れる（さはる＝触る。単語帳の「さはる」は「障る」）。
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

// 2026-10-25 追加：用言で基本形が無い（または表層形のままの）語に、hint が名指しする基本形を入れる。
// 例：「まから」（hint：敬語「まかる」(ラ四)の未然形…）→ 基本形「まかる」。基本形が無いと活用形のままでは単語帳に紐づかない（215 語）。
// 入れるのは、単語帳の見出し（併記は分けて）か別名表（src/lib/vocabAlias.ts）に出てくる語だけ（範囲を広げすぎない）
// 表層形そのものが単語帳の見出しの語（例：副詞の見出し「いたく」）は触らない（hint の形容詞「いたし」に寄せると見出しが変わる）
const VOCAB_INDEX = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "vocabIndex.json"), "utf8"));
const VOCAB_KEYS = new Set(Object.keys(VOCAB_INDEX));
const VOCAB_POS = Object.fromEntries(Object.entries(VOCAB_INDEX).map(([k, v]) => [k, (v && v.pos) || ""]));
// 見出しの語形 → 見出し（併記は分ける。別名表 KANJI_VARIANTS などの「'見出し': ['別形', …]」も読む）
const FORM_TO_KEY = (() => {
  const map = new Map();
  for (const k of VOCAB_KEYS) for (const x of k.split("・")) if (!map.has(x)) map.set(x, k);
  const alias = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "vocabAlias.ts"), "utf8");
  for (const m of alias.matchAll(/'([^'\r\n]{1,12})':\s*\[([^\]]*)\]/g)) {
    const key = m[1];
    for (const v of m[2].matchAll(/'([^'\r\n]{1,12})'/g)) if (!map.has(v[1])) map.set(v[1], key);
    if (!map.has(key)) map.set(key, key);
  }
  return map;
})();
const VOCAB_FORMS = new Set(FORM_TO_KEY.keys());
const KANJI = /[㐀-鿿]/;
// hint の基本形が本文の語と同じ語らしいか（頭の字が同じ／本文の頭の漢字を含む／見出しの頭の字が同じ）。合成語（群れゐ←ゐる）は拾わない
function sameWord(surface, lemma) {
  if (!surface || !lemma) return false;
  if (surface[0] === lemma[0]) return true;
  if (KANJI.test(surface[0]) && lemma.includes(surface[0])) return true;
  const key = FORM_TO_KEY.get(lemma);
  return !!key && key.split("・").some((k) => k[0] === surface[0]);
}
const YOUGEN = new Set(["動詞", "補助動詞", "形容詞", "形容動詞"]);
// 単語帳の見出しが同音語の一つだけを指す語は、hint が仮名で名指ししても基本形を入れない（2026-10-25）。
//   さす：単語帳は「鎖す」（戸を閉める）と中断の「〜さす」。指す・差す・挿す・射す・点す（同じサ四）を拾ってしまう
const HOMOGRAPH_SKIP = new Set(["さす"]);
// hint の最初の「…」。前に品詞・敬語・活用の種類・「重要語」などの短い見出しが付く（例：敬語「まかる」、重要語「いみじ」、ヤ行下二段「覚ゆ」）
const HINT_BASE = /^[^「:：]{0,12}「([^」]+)」/;
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
        // 同音の別語：単語帳の「さはる」（障る＝妨げられる）とは別の「触る」（触れる）。教材の hint で見分け、基本形を入れる（vocabAlias が「触る」を単語帳に紐づけない）
        if (g && isVerb(t) && /^さは/.test(t.text) && /触れる|触る/.test(t.hint || "") && g.baseForm !== "触る") {
          g.baseForm = "触る"; n++; log["基本形:触る"] = (log["基本形:触る"] || 0) + 1; return;
        }
        const surface = t.text.replace(/^[、。]+/, "");
        // 表層形が単語帳の見出しで、その見出しの品詞に本文の品詞が含まれる（いたく＝「副詞（形容詞…の連用形）」）ときは、もう紐づくので触らない。
        // 品詞が合わない見出し（名詞「おぼえ」・副詞「わりなく」）しか無いときは、hint の基本形（おぼゆ・わりなし）を入れる
        const surfaceLinked = VOCAB_KEYS.has(surface) && (VOCAB_POS[surface] || "").includes(posOf(t) === "補助動詞" ? "動詞" : posOf(t));
        if (g && YOUGEN.has(posOf(t)) && !surfaceLinked) {
          const m = (t.hint || "").match(HINT_BASE);
          // 基本形が無い・表層形のまま・形容動詞の語幹だけ（あはれ→あはれなり）のときに、hint の基本形を入れる
          const weak = !g.baseForm || g.baseForm === surface || (posOf(t) === "形容動詞" && m && m[1] === g.baseForm + "なり");
          if (weak && m && m[1] !== g.baseForm && VOCAB_FORMS.has(m[1]) && !HOMOGRAPH_SKIP.has(m[1]) && !(g.baseForm === undefined && m[1] === t.text) && sameWord(surface, m[1])) {
            g.baseForm = m[1]; n++; log["基本形:hint"] = (log["基本形:hint"] || 0) + 1; return;
          }
        }
        if (!g || posOf(t) !== "") return;
        const prev = T[i - 1], next = T[i + 1];
        let rule = null;
        if (PREFIX.has(t.text) && isVerb(next)) {
          g.pos = "接頭語"; delete g.baseForm; rule = "接頭語";
        } else if (SUFFIX.has(t.text) && prev && posOf(prev) !== "記号" && !(t.text === "ら" && prev.text === "もの")) {
          g.pos = "接尾語"; delete g.baseForm; rule = "接尾語";
        } else if (t.text === "さ" && prev && (/し$/.test(prev.text) || ["形容詞", "形容動詞"].includes(posOf(prev)) || (posOf(prev) === "" && /[^\s、。「」『』（）]$/.test(prev.text)))) {
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
