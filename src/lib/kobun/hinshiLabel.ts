/**
 * 品詞分解プリント（/read/texts/:id/print）の語ごとのラベル。
 * 配布プリントの生成スクリプト（F:\A2A\teaching\補助プリント\品詞分解\make_hinshi_pdf.py）と同じ規則。
 * データ（grammarTag）に無いものは出さない。
 */
import type { GrammarTag, Token } from "./types";

type Tag = GrammarTag & { honorific?: string };

const POS_SHORT: Record<string, string> = {
  格助詞: "格助",
  係助詞: "係助",
  接続助詞: "接助",
  副助詞: "副助",
  終助詞: "終助",
  間投助詞: "間助",
  形容詞: "形",
  形容動詞: "形動",
};

const YOGEN = new Set(["動詞", "形容詞", "形容動詞"]);

export type HinshiKind = "yo" | "jd" | "js" | "kei" | "etc" | "none";

export interface HinshiLabel {
  /** 上段: 活用の種類・助動詞の意味・助詞の種類など */
  top: string;
  /** 下段: 活用形・助詞のはたらき・敬語 */
  bottom: string;
  /** 用言の終止形（表記と同じときは null） */
  base: string | null;
  kind: HinshiKind;
}

export function hinshiLabel(token: Pick<Token, "text" | "grammarTag">): HinshiLabel {
  const tag = (token.grammarTag ?? { pos: "" }) as Tag;
  const pos = tag.pos ?? "";
  const { conjugationType: ctype, conjugationForm: form, meaning } = tag;

  let top: string;
  if (pos === "動詞") top = ctype || "動詞";
  else if (pos === "形容詞" || pos === "形容動詞") top = POS_SHORT[pos] + (ctype ? `・${ctype}` : "");
  else if (pos === "助動詞") top = meaning || "助動";
  else if (pos.endsWith("助詞")) top = POS_SHORT[pos] ?? pos;
  else top = pos;

  const bottom: string[] = [];
  if (pos === "助動詞") {
    if (form) bottom.push(form);
  } else if (pos.endsWith("助詞")) {
    if (meaning) bottom.push(meaning);
  } else if (form) {
    bottom.push(form);
  }
  if (tag.honorific) bottom.push(tag.honorific);

  const base = YOGEN.has(pos) && tag.baseForm && tag.baseForm !== token.text ? tag.baseForm : null;

  let kind: HinshiKind;
  if (tag.honorific) kind = "kei";
  else if (pos === "助動詞") kind = "jd";
  else if (pos.endsWith("助詞")) kind = "js";
  else if (YOGEN.has(pos)) kind = "yo";
  else kind = pos ? "etc" : "none";

  return { top, bottom: bottom.join("・"), base, kind };
}

const PUNCT = new Set([..."、。，．「」『』（）・！？〔〕"]);
const OPEN = new Set([..."「『（〔"]);

export interface HinshiCell {
  /** 語の前に付ける開き括弧 */
  pre: string;
  text: string;
  /** 語の後に付ける句読点・閉じ括弧 */
  punct: string;
  token: Token | null;
}

/** 句読点・括弧だけのトークンを前後の語にくっつけて、語ごとのセルにする */
export function toCells(tokens: Token[]): HinshiCell[] {
  const cells: HinshiCell[] = [];
  let pre = "";
  for (const t of tokens) {
    const chars = [...t.text];
    if (chars.length > 0 && chars.every((c) => PUNCT.has(c))) {
      if (chars.every((c) => OPEN.has(c)) || cells.length === 0) pre += t.text;
      else cells[cells.length - 1].punct += t.text;
      continue;
    }
    cells.push({ pre, text: t.text, punct: "", token: t });
    pre = "";
  }
  if (pre) cells.push({ pre, text: "", punct: "", token: null });
  return cells;
}
