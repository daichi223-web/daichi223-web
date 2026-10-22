// 教材の訳・hint が単語帳の語義で訳しているかを検査する（読み取りのみ）
// 2026-10-22「隈なき」を「曇りのない」と訳していた件（単語帳 236-1 は〔 暗い所のない 〕）の再発防止。
//
// 使い方: npx tsx scripts/check-vocab-gloss.ts [--dir public/texts-v3] [--out <report.md>] [--warn-only] [<textId> ...]
//
// 1. 対象の語
//    単語帳（src/data/kobunQ.v2.slim.json）に紐づく語。助詞・助動詞・記号・接頭語・接尾語は除く。
//    (a) resolveVocabKey で紐づく語（アプリの解説カードと同じ紐づけ）
//    (b) 紐づかないが、kuromoji の読み＋活用語尾の付け替えで単語帳の見出しになる語
//        →「紐づけ漏れの疑い」。「隈なき」（基本形が空・漢字表記の登録なし）がこれ。
//        アプリでも解説カードが出ないので、vocabAlias.ts の KANJI_VARIANTS か texts-v3 の baseForm を直す。
// 2. 期待する語義
//    analysis/<id>.json の決め手 decider.meaning が単語帳の語義に当たればその語義だけ、
//    決め手が無ければその見出しの単語帳の語義すべて。
//    決め手が単語帳に無い意味を明示している語（例: 知る＝知る・わかる）は「単語帳外」として数えるだけ。
// 3. 判定
//    単語帳の〔 〕の語義から活用語尾を外した語幹が、文の訳（modernTranslation）／その語の hint に
//    出ていなければ指摘。〔 〕では外れるが senseNorm か決め手の意味には当たるものは「言い換え」として別に出す。
//    hint は「品詞「語」活用: 「訳」」のように訳語を書いているものだけを見る（活用だけの説明は対象外）。
// 終了コード: 訳の「外れ」が1件でもあれば 1（--warn-only で常に 0）。
import fs from "node:fs";
import path from "node:path";
import kuromoji from "kuromoji.js";
import { resolveVocabKey } from "../src/lib/vocabAlias";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k: string) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const warnOnly = flag("--warn-only");
const root = process.cwd();
const dir = path.resolve(root, opt("--dir") ?? "public/texts-v3");
const out = opt("--out");
const jsonOut = opt("--json"); // 指摘をそのまま JSON で書き出す（修正作業のリスト用）
const only = new Set(args);

type Q = { qid: string; lemma: string; sense?: string; senseNorm?: string; pos?: string; trap?: { modern?: string } };
const KQ = JSON.parse(fs.readFileSync(path.join(root, "src/data/kobunQ.v2.slim.json"), "utf8")) as Q[];
const byLemma = new Map<string, Q[]>();
for (const q of KQ) (byLemma.get(q.lemma) ?? byLemma.set(q.lemma, []).get(q.lemma)!).push(q);

// ---- 語義 → 照合用の語幹 ----
const KANJI = /[一-龥々]/;
const ROWS = ["あいうえお", "かきくけこ", "がぎぐげご", "さしすせそ", "ざじずぜぞ", "たちつてと", "だぢづでど", "なにぬねの", "はひふへほ", "ばびぶべぼ", "まみむめも", "やゆよ", "らりるれろ", "わゐうゑを"];
const strip = (s: string) => s.replace(/[〔〕]/g, "").replace(/（[^）]*）|\([^)]*\)/g, "").replace(/[…]/g, "").trim();
const alts = (s: string) => strip(s).split(/[・／/、,，]|または/).map((x) => x.replace(/\s+/g, "")).filter(Boolean);
const NON_INFLECT = new Set(["名詞", "副詞"]);
// 照合キー。「お～になる」のように ～ を含む語義は、～ で区切った各部分がすべて出ていれば当たり（キーを「＆」でつなぐ）。
function stems(s: string, pos?: string): string[] {
  const res = new Set<string>();
  for (const a0 of alts(s)) {
    const parts = a0.split(/[〜～]/).filter(Boolean);
    const keyed = parts.map((p, i) => {
      let a = p;
      if (i === parts.length - 1 && !NON_INFLECT.has(pos ?? "")) {
        // 末尾のかなを最大2字外す。漢字に当たったら止める。残りは2字以上（漢字1字は可）。
        for (let j = 0; j < 2; j++) {
          if (!/[ぁ-ん]$/.test(a)) break;
          const b = a.slice(0, -1);
          if (b.length >= 2 || (b.length === 1 && KANJI.test(b))) a = b;
          else if (b.length === 1 && a.length === 2) {
            // 「ある」「いる」のような2字のかな動詞は、語幹1字＋同じ行の活用語尾で照合する
            const row = ROWS.find((r) => r.includes(a[1])) ?? "";
            a = `re:${b}[${row}っん${a[1] === "る" ? "たてなま" : ""}]`;
            break;
          } else break;
        }
      }
      return a;
    }).filter((p) => p.startsWith("re:") || p.length >= 2 || KANJI.test(p)); // 「お」のような1字のかなは手がかりにしない
    if (!keyed.length) continue;
    const k = keyed.join("＆");
    res.add(k);
    if (/[のが]/.test(k)) { res.add(k.replace(/の/g, "が")); res.add(k.replace(/が/g, "の")); }
  }
  return [...res];
}
// 表記ゆれ（訳と語義の両方にかける）
const fold = (s: string) => (s ?? "").replace(/\s+/g, "").replace(/上げ/g, "あげ").replace(/上が/g, "あが").replace(/頃/g, "ころ").replace(/出来/g, "でき").replace(/致/g, "いた").replace(/時/g, "とき")
  .replace(/い([うっわえ])/g, "言$1"); // 「という」「いった」も「言う」として数える
const hit = (text: string, keys: string[]) => {
  const t = fold(text);
  return keys.some((k) => k && k.split("＆").every((p) => (p.startsWith("re:") ? new RegExp(p.slice(3)).test(t) : t.includes(fold(p)))));
};
// 単語帳の語義で訳す対象でない、構文上の用法（誤りとしない）
//   補助の「あり」: 「にあらず」「とあり」「美しくあり」「ずあり」など（訳は「である・でない」）
//   比況の「やう」: 「やうなり・やうに・やうなる」（訳は「ようだ・ように」）
//   引用の「いふ」: 「といふ」（訳は「という」）
//   変化の「なる」: 「ずなる・くなる・になる」（語義〔 ～になる 〕そのものだが、訳は「なくなる」等で語幹照合に当たらない）
function structuralUse(toks: any[], i: number, lemma: string): boolean {
  const prev = () => { for (let j = i - 1; j >= 0; j--) { const g = toks[j].grammarTag ?? {}; if (g.pos === "係助詞" || g.pos === "副助詞" || g.pos === "記号") continue; return toks[j]; } return null; };
  const next = toks[i + 1];
  if (lemma === "やう") return !!next && /^(なり|に|なる|なれ|なら|な)$/.test(next.text);
  const p = prev(); if (!p) return false;
  const pg = p.grammarTag ?? {};
  if (lemma === "あり") return pg.meaning === "断定" || (pg.pos === "格助詞" && p.text === "と") || ((pg.pos === "形容詞" || pg.pos === "形容動詞" || pg.pos === "助動詞") && /用/.test(pg.conjugationForm ?? "")) || /^(ず|で|く|しく|かく|さ|か)$/.test(p.text);
  if (lemma === "いふ") return pg.pos === "格助詞" && p.text === "と";
  // 「降らずなりにけり」「寒くなる」の「なる」（訳は「なくなる」「くなる」）
  if (lemma === "なる") return /^(ず|く|しく|に|と)$/.test(p.text) || /用/.test(pg.conjugationForm ?? "");
  return false;
}
// 本文の語を訳でもそのまま使っているか（「心→心」「ただ→ただ」）。普通の意味で使っているだけなので誤りとしない。
// ただし単語帳に「現代語の罠」がある語（ながむ＝眺める 等）は、そのまま訳すこと自体が誤りになりうるので外さない。
function reusedAsIs(surface: string, tr: string, cands: Q[]): boolean {
  if (cands.some((q) => q.trap?.modern)) return false;
  const s = surface.replace(/^[、。「」『』（）\s]+|[、。「」『』（）\s]+$/g, "");
  const core = KANJI.test(s) ? (s.match(/^[^ぁ-ん]+/) ?? [""])[0] : s.length >= 3 ? s.slice(0, -1) : s;
  if (!core || (!KANJI.test(core) && core.length < 2)) return false;
  // かなの語は現代仮名遣いにしても照合する（なほ→なお、いふ→いう）
  const modern = KANJI.test(core) ? core : core.replace(/(?<=.)は/g, "わ").replace(/(?<=.)ひ/g, "い").replace(/(?<=.)ふ/g, "う").replace(/(?<=.)へ/g, "え").replace(/(?<=.)ほ/g, "お").replace(/ゐ/g, "い").replace(/ゑ/g, "え").replace(/(?<=.)を/g, "お");
  const t = fold(tr);
  return t.includes(core) || t.includes(modern);
}
// 敬語の補助動詞（たまふ・申す 等）。「なさる」か「お～になる」かは方針の判断なので別の区分に出す。
const KEIGO_AUX = /^(たまふ|たまはる|まうす|きこゆ|きこゆ・きこえさす|たてまつる|まゐらす|はべり|さぶらふ|さうらふ|おはす|おはす・おはします|おはします|つかうまつる|いたす)$/;

// ---- 読みから見出しを推定（紐づけ漏れの疑い） ----
const kata2hira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const ENDS: Record<string, string[]> = {
  形容詞: ["し", "じ"],
  形容動詞: ["なり", "たり"],
  動詞: ["う", "く", "ぐ", "す", "ず", "つ", "づ", "ぬ", "ふ", "ぶ", "む", "ゆ", "る", "り"],
};
// 品詞の家（教材の品詞 → 単語帳の品詞）。品詞が空の語は名詞として扱う。
const FAMILY: Record<string, string> = { 動詞: "動詞", 補助動詞: "動詞", 形容詞: "形容詞", 形容動詞: "形容動詞", 副詞: "副詞", 名詞: "名詞", 代名詞: "名詞", "": "名詞" };
const posFits = (tokenPos: string, lemma: string) => {
  const fam = FAMILY[tokenPos];
  if (!fam) return true;
  return (byLemma.get(lemma) ?? []).some((q) => q.pos === fam || q.pos === "連体詞・連語"); // 単語帳の品詞が空の語（え・あり 等）には推定で当てない
};
// 読み推定で同音の別語に当たるもの（2026-10-23 に語義と照らして採らなかった）。表層形の先頭で判定する。
const GUESS_DENY: Record<string, RegExp> = {
  て: /^手/, いろ: /^色/, つま: /^妻/, かなし: /^(悲|哀)/, おくる: /^(送|贈|臆)/, すむ: /^住/, おこす: /^起/,
  わたる: /^渡[しさせす]/, うつる: /^(写|移)[しさせす]/, あたらし: /^新/, あつし: /^(暑|厚)/, さす: /^指/,
  しる: /^使/, よる: /^詠/, まかる: /^任/, おもひやる: /^思ひやむ/, くやし: /^口惜/, まもる: /^(守|御守)/,
};
let tokenizer: any = null;
function guessLemma(surface: string, pos: string): string | null {
  if (!tokenizer || !KANJI.test(surface)) return null;
  const r = kata2hira(tokenizer.tokenize(surface).map((x: any) => x.reading ?? x.surface_form).join(""));
  if (!r || KANJI.test(r)) return null;
  const okuri = (surface.match(/[ぁ-ん]+$/) ?? [""])[0].length; // 送りがなの字数（これ以上は外さない）
  const tries: string[] = [r];
  const ends = ENDS[pos === "補助動詞" ? "動詞" : pos];
  // 動詞は外した最初の字と同じ行の語尾だけに付け替える（「忍び→しのぶ」は可、「候ふ→こう＋ず」は不可）
  const rowOf = (c: string) => ROWS.findIndex((r) => r.includes(c));
  if (ends) for (let k = 1; k <= Math.min(2, okuri); k++) {
    const stem = r.slice(0, -k);
    if (stem.length < 2) break; // 「恋ひ→こ＋す」のような1字語幹は採らない
    const removed = r.slice(-k)[0];
    for (const e of ends) {
      if ((pos === "動詞" || pos === "補助動詞") && e !== "る" && rowOf(e[0]) !== rowOf(removed)) continue;
      tries.push(stem + e);
    }
  }
  for (const c of tries) {
    const v = resolveVocabKey(c, c, pos);
    if (v && byLemma.has(v) && posFits(pos, v) && !GUESS_DENY[v]?.test(surface.replace(/^[、。「」『』（）\s]+/, ""))) return v;
  }
  return null;
}
// hint の訳語：「品詞「語」活用: 「訳」」の形で、コロンの直後に書かれた「」。無ければ hint は判定しない。
const hintGloss = (hint: string) => (hint.match(/[:：]\s*「([^」]+)」/) ?? [])[1] ?? null;

type Finding = { textId: string; title: string; sid: string; tid: string; surface: string; lemma: string; linked: boolean; where: "訳" | "hint"; level: "外れ" | "言い換え" | "敬語"; expect: string; decider: string | null; context: string };
let nReuse = 0, nStruct = 0;
const findings: Finding[] = [];
const unlinked: { textId: string; title: string; sid: string; tid: string; surface: string; pos: string; lemma: string }[] = [];
let nTok = 0, nOut = 0, nNoTrans = 0;
const seenLemma = new Set<string>();

function run() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");
  for (const f of files) {
    const id = f.replace(/\.json$/, "");
    if (only.size && !only.has(id)) continue;
    const text = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(text.sentences)) continue;
    const an: Record<string, any> = {};
    try { for (const t of JSON.parse(fs.readFileSync(path.join(root, "public/analysis", f), "utf8")).tokenAnalyses ?? []) an[t.tokenId] = t; } catch { /* 無し */ }
    for (const s of text.sentences) {
      const toks = (s.tokens ?? []) as any[];
      for (let ti = 0; ti < toks.length; ti++) {
        const t = toks[ti];
        const g = t.grammarTag ?? {};
        const pos: string = g.pos ?? "";
        if (pos === "助動詞" || /助詞$/.test(pos) || pos === "記号" || pos === "接尾語" || pos === "接頭語") continue;
        let lemma = resolveVocabKey(t.text, g.baseForm, g.pos, g);
        let linked = true;
        if (!lemma && !g.baseForm) {
          lemma = guessLemma(t.text, pos);
          linked = false;
          if (lemma) unlinked.push({ textId: id, title: text.title, sid: s.id, tid: t.id, surface: t.text, pos, lemma });
        }
        if (!lemma) continue;
        const cands = byLemma.get(lemma) ?? [];
        if (!cands.length) continue;
        nTok++; seenLemma.add(lemma);
        if (structuralUse(toks, ti, lemma)) { nStruct++; continue; }
        const dm: string | null = an[t.id]?.decider?.meaning ?? null;
        let exp = cands;
        if (dm) {
          const m = cands.filter((q) => hit(dm, stems(q.sense ?? "", q.pos)) || hit(dm, stems(q.senseNorm ?? "", q.pos)));
          if (m.length) exp = m; else { nOut++; continue; }
        }
        const kSense = exp.flatMap((q) => stems(q.sense ?? "", q.pos));
        // 言い換え：senseNorm か、決め手が明示した意味には当たる
        const kNorm = [...exp.flatMap((q) => stems(q.senseNorm ?? "", q.pos)), ...(dm ? stems(dm, exp[0]?.pos) : [])];
        const expect = exp.map((q) => `${q.qid}〔${strip(q.sense ?? "")}〕`).join(" ");
        const base = { textId: id, title: text.title, sid: s.id, tid: t.id, surface: t.text, lemma, linked, expect, decider: dm };
        const keigo = KEIGO_AUX.test(lemma);
        const lv = (txt: string): Finding["level"] => (keigo ? "敬語" : hit(txt, kNorm) ? "言い換え" : "外れ");
        const tr: string = s.modernTranslation ?? "";
        if (!tr.trim()) nNoTrans++;
        else if (!hit(tr, kSense)) {
          if (!dm && reusedAsIs(t.text, tr, cands)) nReuse++;
          else findings.push({ ...base, where: "訳", level: lv(tr), context: `${s.originalText} ／ ${tr}` });
        }
        const hint: string = t.hint ?? "";
        if (hint && hintGloss(hint) && !hit(hint, kSense)) findings.push({ ...base, where: "hint", level: lv(hint), context: hint });
      }
    }
  }
  report();
}

function report() {
  const c = (w: string, l: string) => findings.filter((x) => x.where === w && x.level === l).length;
  const summary = [
    `対象 ${nTok} 語・${seenLemma.size} 見出し（単語帳外の意味を決め手で明示 ${nOut} 語は除外、訳の無い文の語 ${nNoTrans}）`,
    `紐づけ漏れの疑い: ${unlinked.length} 語（${new Set(unlinked.map((u) => u.lemma)).size} 見出し）`,
    `訳  : 外れ ${c("訳", "外れ")} ／ 言い換え ${c("訳", "言い換え")} ／ 敬語の補助動詞 ${c("訳", "敬語")}（除外: 本文の語をそのまま使用 ${nReuse}・補助のあり／比況のやう／といふ／変化のなる ${nStruct}）`,
    `hint: 外れ ${c("hint", "外れ")} ／ 言い換え ${c("hint", "言い換え")} ／ 敬語の補助動詞 ${c("hint", "敬語")}`,
  ];
  console.log(summary.join("\n"));
  if (out) {
    const esc = (s: string) => s.replace(/\|/g, "｜").replace(/\n/g, " ");
    const md: string[] = ["# 単語帳の語義で訳しているかの検査", "", `生成: scripts/check-vocab-gloss.ts（${new Date().toISOString().slice(0, 10)}）`, "", ...summary.map((x) => `- ${x}`), ""];
    // 見出し別の集計（訳・外れ）。どの語から直すかを決める用。
    const agg = new Map<string, { n: number; texts: Set<string>; expect: string }>();
    for (const x of findings) if (x.where === "訳" && x.level === "外れ") {
      const a = agg.get(x.lemma) ?? { n: 0, texts: new Set(), expect: (byLemma.get(x.lemma) ?? []).map((q) => `${q.qid}〔${strip(q.sense ?? "")}〕`).join(" ") };
      a.n++; a.texts.add(x.textId); agg.set(x.lemma, a);
    }
    md.push(`## 見出し別（訳・外れ、${agg.size} 見出し）`, "", "| 見出し | 件数 | 教材数 | 単語帳の語義 |", "|---|---|---|---|");
    for (const [l, a] of [...agg].sort((p, q) => q[1].n - p[1].n)) md.push(`| ${l} | ${a.n} | ${a.texts.size} | ${a.expect} |`);
    md.push("");
    if (unlinked.length) {
      md.push(`## 紐づけ漏れの疑い（${unlinked.length}）`, "", "読みから推定した見出し。正しければ vocabAlias.ts の KANJI_VARIANTS か texts-v3 の baseForm を直す。", "", "| 教材 | 文 | 語 | 品詞 | 推定見出し |", "|---|---|---|---|---|");
      for (const u of unlinked) md.push(`| ${u.title}(${u.textId}) | ${u.sid} | ${u.surface} | ${u.pos} | ${u.lemma} |`);
      md.push("");
    }
    for (const where of ["訳", "hint"] as const) for (const level of ["外れ", "言い換え", "敬語"] as const) {
      const xs = findings.filter((x) => x.where === where && x.level === level);
      if (!xs.length) continue;
      md.push(`## ${where}・${level}（${xs.length}）`, "", "| 教材 | 文 | 語 | 見出し | 単語帳の語義 | 決め手 | 該当 |", "|---|---|---|---|---|---|---|");
      for (const x of xs) md.push(`| ${x.title}(${x.textId}) | ${x.sid} | ${x.surface}${x.linked ? "" : "※"} | ${x.lemma} | ${x.expect} | ${x.decider ?? ""} | ${esc(x.context)} |`);
      md.push("");
    }
    md.push("※ は紐づけ漏れの疑いの語（読みから推定）。");
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, md.join("\n"), "utf8");
    console.log(`報告: ${out}`);
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ findings, unlinked }, null, 1), "utf8");
  process.exit(!warnOnly && c("訳", "外れ") > 0 ? 1 : 0);
}

(kuromoji as any).builder({ dicPath: path.join(root, "node_modules/kuromoji.js/dict") }).build((err: any, tk: any) => {
  if (err) console.warn("kuromoji を読めないため、紐づけ漏れの推定は行わない:", err?.message ?? err);
  else tokenizer = tk;
  run();
});
