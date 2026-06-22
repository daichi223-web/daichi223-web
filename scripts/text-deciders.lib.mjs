// text-deciders.lib.mjs
// texts-v3 の教材から助動詞トークンを抽出し、意味決定の「決め手」を
// 文例集(grammar_reibun)と同じモデル(型+根拠+手がかり cues)で扱うための共通ライブラリ。
//
// 設計:
//  - extractJodoshi(text): 各文の助動詞トークンを、前接/後接/係助詞/主語手がかりつきで取り出す。
//  - 生成は「捏造禁止」。意味(meaning)は教材が既に確定済みなので変更しない。
//    決め手は (a)既存 hint の本文固有部分 (b)前後トークン (c)文例集の総則 から組み立てる。
//  - cues.text は必ず本文(originalText)の部分文字列であること(幻覚排除)。ReibunSentence と同条件。
import fs from "node:fs";
import path from "node:path";

export const V3_DIR = "public/texts-v3";
export const ANALYSIS_DIR = "public/analysis";

/** 助動詞の決め手の型(文例集と共有)。意味語からの既定推定。 */
export const DECIDER_TYPES = ["後接", "呼応", "形", "主語", "文脈"];

/** 実トークン(句読点・空ラベルでない、本文を担う層)か */
function isContentToken(t) {
  return t && t.grammarTag && t.grammarTag.pos && t.grammarTag.pos !== "";
}

/** 直前/直後の「意味を持つ」トークンを返す(空ラベルの地の文をスキップ) */
function neighbors(tokens, idx) {
  let prev = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (isContentToken(tokens[i])) { prev = tokens[i]; break; }
  }
  let next = null;
  for (let i = idx + 1; i < tokens.length; i++) {
    if (isContentToken(tokens[i])) { next = tokens[i]; break; }
  }
  return { prev, next };
}

/** 文中の係助詞(ぞ・なむ・や・か・こそ)トークンを集める(呼応・係り結び用) */
function kakariJoshi(tokens) {
  const KAKARI = new Set(["ぞ", "なむ", "なん", "や", "か", "こそ"]);
  return tokens.filter(
    (t) => t.grammarTag?.pos === "係助詞" && KAKARI.has((t.text || "").replace(/[、。「」]/g, ""))
  );
}

/** 文中の打消助動詞(ず系)があるか(可能・呼応判定の補助) */
function hasNegation(tokens) {
  return tokens.some(
    (t) => t.grammarTag?.pos === "助動詞" && /打消/.test(t.grammarTag?.meaning || "")
  );
}

/**
 * 1教材から助動詞トークンを抽出。
 * 返り値: [{ textId, title, source, sentenceId, sentence, translation,
 *            tokenId, surface, meaning, form, hint, refId,
 *            prev:{text,pos,form,type}, next:{text,pos}, kakari:[...], negation:bool }]
 */
export function extractJodoshi(text) {
  const out = [];
  for (const s of text.sentences || []) {
    const toks = s.tokens || [];
    const kakari = kakariJoshi(toks).map((t) => cleanSurface(t.text));
    const negation = hasNegation(toks);
    toks.forEach((t, idx) => {
      const g = t.grammarTag || {};
      if (g.pos !== "助動詞") return;
      const { prev, next } = neighbors(toks, idx);
      out.push({
        textId: text.id,
        title: text.title,
        source: text.source,
        sentenceId: s.id,
        sentence: s.originalText,
        translation: s.modernTranslation,
        tokenId: t.id,
        surface: cleanSurface(t.text),
        meaning: g.meaning || "",
        form: g.conjugationForm || "",
        hint: t.hint || "",
        refId: t.grammarRefId || "",
        prev: prev
          ? { text: cleanSurface(prev.text), pos: prev.grammarTag.pos, form: prev.grammarTag.conjugationForm || "", type: prev.grammarTag.conjugationType || "" }
          : null,
        next: next ? { text: cleanSurface(next.text), pos: next.grammarTag.pos, meaning: next.grammarTag.meaning || "" } : null,
        kakari,
        negation,
      });
    });
  }
  return out;
}

/** トークン表層から句読点・カギ括弧を除去(cues 照合や表示の安定用) */
export function cleanSurface(s) {
  return (s || "").replace(/[、。「」『』（）\s]/g, "");
}

/** texts-v3 の index から全教材 id を取得 */
export function allTextIds(root = ".") {
  const idxPath = path.join(root, V3_DIR, "index.json");
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
  const items = Array.isArray(idx) ? idx : idx.texts || idx.items || Object.values(idx);
  return items.map((it) => (typeof it === "string" ? it : it.id)).filter(Boolean);
}

/** 1教材 JSON を読む */
export function loadText(id, root = ".") {
  return JSON.parse(fs.readFileSync(path.join(root, V3_DIR, `${id}.json`), "utf8"));
}
