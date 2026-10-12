/**
 * 教材の「識別」レイヤーで出す、紛らわしい語（に・なり・なむ・らむ・ぬ・ね・る・れ・し）を
 * 教材データ（grammarTag）だけから機械で見つけ、正体（正解）を決める。
 * - 1語のもの（「に」「なむ」「らむ」…）、隣り合う2語にまたがるもの（あら＋む、な＋む）、
 *   語の末尾にあるもの（静か「に」、げ「に」、死「ぬ」）を扱う
 * - 選択肢と判別のきまりは文法道場の講義（public/grammar/shikibetsu-*.json）の表にそろえる
 * - grammarTag から正体を1つに決められないものは出さない（推測で補わない。koou.ts と同じ原則）
 */
import type { Token } from "./types";

export type ShikibetsuGroup = "ni" | "nari" | "namu" | "ramu" | "nune" | "rure" | "shi";

export interface ShikibetsuChoice {
  id: string;
  label: string;
  /** 判別のきまり（講義の表の「接続・目印」を1文にしたもの） */
  rule: string;
}

export interface ShikibetsuPart {
  tokenId: string;
  /** トークンの何文字目からハイライトするか（0 ならトークン全体） */
  from: number;
}

export interface ShikibetsuTarget {
  /** 対象の最初のトークンの id（対象を指す鍵） */
  id: string;
  group: ShikibetsuGroup;
  /** ハイライトする表記（「に」「なむ」「らむ」…） */
  form: string;
  answer: string;
  parts: ShikibetsuPart[];
  /** この箇所の手がかり（直前・直後の語） */
  clue: string;
}

const C = (id: string, label: string, rule: string): ShikibetsuChoice => ({ id, label, rule });

export const GROUPS: Record<ShikibetsuGroup, { title: string; topicId: string; choices: ShikibetsuChoice[] }> = {
  ni: {
    title: "「に」の識別",
    topicId: "shikibetsu-ni",
    choices: [
      C("kanryo", "完了「ぬ」の連用形", "連用形に付き、下に「き・けり・たり」が来る（暮れにけり）"),
      C("dantei", "断定「なり」の連用形", "体言・連体形に付き、下に「あり・侍り」系が来る（夢にやあらむ・にこそ）"),
      C("kaku", "格助詞", "体言に付き、場所・時・対象などを表す（京に着く）"),
      C("setsuzoku", "接続助詞", "連体形に付き、下に文が続く「〜すると・〜のに」（待つに、来ず）"),
      C("keidoshi", "形容動詞の活用語尾", "「に」まで含めて状態を表す一語（静かに・あはれに）"),
      C("fukushi", "副詞の一部", "「に」まで含めて一語の副詞（げに・さらに・つひに）"),
    ],
  },
  nari: {
    title: "「なり」の識別",
    topicId: "shikibetsu-nari",
    choices: [
      C("dantei", "断定「なり」", "体言・連体形に付く「〜である」（これは竹なり）"),
      C("denbun", "伝聞・推定「なり」", "終止形（ラ変型は連体形・撥音便）に付く「〜らしい・〜が聞こえる」（人あんなり）"),
      C("doushi", "動詞「成る」", "「〜になる」と変化を表す動詞（大人になりぬ）"),
      C("keidoshi", "形容動詞の活用語尾", "「なり」まで含めて状態を表す一語（静かなり・清げなり）"),
    ],
  },
  namu: {
    title: "「なむ」の識別",
    topicId: "shikibetsu-namu",
    choices: [
      C("kakari", "係助詞", "体言・助詞などに付く強調。取り除いても文が成り立つ（これなむ都鳥）"),
      C("ganbou", "願望の終助詞", "未然形に付く「〜してほしい」（帰らなむ）"),
      C("nu_mu", "強意「ぬ」＋推量「む」", "連用形に付く「きっと〜だろう」（帰りなむ）"),
      C("nahen", "ナ変の未然形の語尾＋「む」", "「死なむ」「往なむ」のようにナ変動詞の一部＋「む」"),
    ],
  },
  ramu: {
    title: "「らむ」の識別",
    topicId: "shikibetsu",
    choices: [
      C("genzai", "現在推量「らむ」", "終止形（ラ変型は連体形）に付く「今ごろ〜ているだろう」"),
      C("ri_mu", "完了・存続「り」の未然形＋「む」", "サ変の未然形・四段の已然形（e段）に付いた「ら」＋推量「む」（よめらむ）"),
      C("gobi_mu", "未然形の一部の「ら」＋推量「む」", "「あら・知ら・ざら・たら」のように語の未然形の末尾「ら」に「む」が付いたもの"),
    ],
  },
  nune: {
    title: "「ぬ」「ね」の識別",
    topicId: "shikibetsu-nu-ne",
    choices: [
      C("kanryo", "完了「ぬ」", "連用形に付く。「ぬ」は終止形、「ね」は命令形（花咲きぬ・とく行きね）"),
      C("uchikeshi", "打消「ず」", "未然形に付く。「ぬ」は連体形、「ね」は已然形（咲かぬ花・行かねば）"),
      C("nahen", "ナ変動詞の語尾", "「死ぬ」「往ぬ」のように一語の動詞の一部"),
    ],
  },
  rure: {
    title: "「る」「れ」の識別",
    topicId: "shikibetsu-ru-re",
    choices: [
      C("ru", "受身・尊敬・可能・自発の「る」", "a段（未然形）に付く（知らる・言はれ）"),
      C("ri", "完了・存続の「り」", "e段（サ変の未然形・四段の已然形）に付く（咲ける花・立てれば）"),
      C("doushi", "動詞の一部", "切り離すと動詞が壊れる（忘る・流れ・枯れ）"),
    ],
  },
  shi: {
    title: "「し」の識別",
    topicId: "shikibetsu-shi",
    choices: [
      C("kako", "過去「き」の連体形", "連用形に付き、下に体言などが来る（昔見し人）"),
      C("sahen", "サ変「す」の連用形", "「し」で動詞「する」。下に「けり・て・たり」などが来る（物語などしけり）"),
      C("fukujoshi", "副助詞「し」（強意）", "取り除いても文が成り立つ（名にし負はば）"),
      C("keiyoshi", "形容詞の語尾", "「〜し」で一語の形容詞（うれし・かなし）"),
    ],
  },
};

const FORM_LABEL: Record<string, string> = {
  未: "未然形", 用: "連用形", 終: "終止形", 体: "連体形", 已: "已然形", 命: "命令形",
};
const PUNCT = /^[、。，．「」『』（）・！？〔〕\s]+$/;
const KATSUYO = new Set(["動詞", "補助動詞", "形容詞", "形容動詞", "助動詞"]);

function tag(t: Token | undefined) {
  return (t?.grammarTag ?? { pos: "" }) as { pos: string; meaning?: string; conjugationForm?: string; conjugationType?: string; baseForm?: string };
}
const pos = (t: Token | undefined) => tag(t).pos ?? "";
const meaning = (t: Token | undefined) => tag(t).meaning ?? "";
const isPunct = (t: Token | undefined) => !t || PUNCT.test(t.text);

/** 活用形の名前（「連用形」など）。データの書き方の揺れ（用／連用形）をそろえる */
export function formName(t: Token | undefined): string {
  const f = tag(t).conjugationForm ?? "";
  if (!f) return "";
  return FORM_LABEL[f] ?? (f.endsWith("形") ? f : `${f}形`);
}

/** 直前・直後の語の説明（「直前「暮れ」（連用形）・直後「けり」」） */
function describe(prev: Token | undefined, next: Token | undefined, stem?: string): string {
  const out: string[] = [];
  if (stem) {
    out.push(`「${stem}」と合わせて一語`);
  } else if (prev && !isPunct(prev)) {
    const f = KATSUYO.has(pos(prev)) ? formName(prev) : "";
    const p = !f && pos(prev) === "" ? "体言" : f || pos(prev);
    out.push(`直前「${prev.text}」${p ? `（${p}）` : ""}`);
  }
  if (!next || /^[。！？]/.test(next.text)) out.push("直後で文が終わる");
  else if (/^[、，]/.test(next.text)) out.push("直後に読点");
  else if (isPunct(next)) out.push(`直後に「${next.text.trim()}」`);
  else out.push(`直後「${next.text}」`);
  return out.join("・");
}

/** 1語の「に」の正体 */
function classifyNi(t: Token): string | null {
  const p = pos(t);
  if (p === "格助詞") return "kaku";
  if (p === "接続助詞") return "setsuzoku";
  if (p === "助動詞") {
    if (meaning(t).includes("断定")) return "dantei";
    if (meaning(t).includes("完了")) return "kanryo";
  }
  return null;
}

function classifyNari(t: Token): string | null {
  const p = pos(t);
  const m = meaning(t);
  if (p === "助動詞") {
    if (m.includes("断定") || m === "存在") return "dantei";
    if (m.includes("伝聞") || m.includes("推定")) return "denbun";
    return null;
  }
  if (p === "動詞" && (tag(t).baseForm === "なる" || tag(t).conjugationType === "ラ四")) return "doushi";
  return null;
}

function classifyNune(t: Token): string | null {
  if (pos(t) !== "助動詞") return null;
  const m = meaning(t);
  if (m.includes("打消")) return "uchikeshi";
  if (m.includes("完了") || m.includes("強意")) return "kanryo";
  return null;
}

function classifyRure(t: Token): string | null {
  if (pos(t) !== "助動詞") return null;
  const m = meaning(t);
  if (m.includes("存続") || m.includes("完了")) return "ri";
  if (/受身|尊敬|可能|自発/.test(m)) return "ru";
  return null;
}

function classifyShi(t: Token): string | null {
  const p = pos(t);
  if (p === "助動詞" && meaning(t).includes("過去")) return "kako";
  if (p === "動詞" && tag(t).conjugationType === "サ変") return "sahen";
  if (p === "副助詞") return "fukujoshi";
  return null;
}

const SINGLE: Record<string, { group: ShikibetsuGroup; classify: (t: Token) => string | null }> = {
  に: { group: "ni", classify: classifyNi },
  なり: { group: "nari", classify: classifyNari },
  なる: { group: "nari", classify: classifyNari },
  なれ: { group: "nari", classify: classifyNari },
  なむ: {
    group: "namu",
    classify: (t) => (pos(t) === "係助詞" ? "kakari" : pos(t) === "終助詞" ? "ganbou" : null),
  },
  らむ: { group: "ramu", classify: (t) => (pos(t) === "助動詞" ? "genzai" : null) },
  らめ: { group: "ramu", classify: (t) => (pos(t) === "助動詞" ? "genzai" : null) },
  ぬ: { group: "nune", classify: classifyNune },
  ね: { group: "nune", classify: classifyNune },
  る: { group: "rure", classify: classifyRure },
  れ: { group: "rure", classify: classifyRure },
  し: { group: "shi", classify: classifyShi },
};

const isMu = (t: Token | undefined) => !!t && (t.text === "む" || t.text === "め") && pos(t) === "助動詞";

/**
 * 1文の識別の対象を、本文の順に返す。
 * 同じトークンが2つの対象に入ることはない（2語にまたがるものを先に取る）。
 */
export function findShikibetsu(tokens: Token[]): ShikibetsuTarget[] {
  const out: ShikibetsuTarget[] = [];
  const used = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (used.has(t.id)) continue;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const p = pos(t);

    // 2語にまたがる「なむ」「らむ」（〜な／〜ら＋推量「む」）
    if (isMu(next) && t.text.length >= 1) {
      const mu = next!.text;
      const after = tokens[i + 2];
      if (t.text.endsWith("な")) {
        let answer: string | null = null;
        if (t.text === "な" && p === "助動詞" && /完了|強意/.test(meaning(t))) answer = "nu_mu";
        else if (tag(t).conjugationType === "ナ変") answer = "nahen";
        if (answer) {
          const stem = t.text.length > 1 ? t.text.slice(0, -1) : undefined;
          out.push({
            id: t.id, group: "namu", form: `な${mu}`, answer,
            parts: [{ tokenId: t.id, from: t.text.length - 1 }, { tokenId: next!.id, from: 0 }],
            clue: answer === "nu_mu" ? describe(prev, after) : describe(undefined, after, stem),
          });
          used.add(t.id); used.add(next!.id);
          continue;
        }
      }
      if (t.text.endsWith("ら")) {
        let answer: string | null = null;
        if (t.text === "ら" && p === "助動詞" && /完了|存続/.test(meaning(t))) answer = "ri_mu";
        else if (KATSUYO.has(p)) answer = "gobi_mu";
        if (answer) {
          const stem = t.text.length > 1 ? t.text.slice(0, -1) : undefined;
          out.push({
            id: t.id, group: "ramu", form: `ら${mu}`, answer,
            parts: [{ tokenId: t.id, from: t.text.length - 1 }, { tokenId: next!.id, from: 0 }],
            clue: answer === "ri_mu" ? describe(prev, after) : `「${t.text}」は${p}${formName(t) ? `の${formName(t)}` : ""}${stem ? `（「${stem}」＋「ら」）` : ""}・直後「${mu}」`,
          });
          used.add(t.id); used.add(next!.id);
          continue;
        }
      }
    }

    // 1語のもの
    const single = SINGLE[t.text];
    if (single) {
      const answer = single.classify(t);
      if (answer) {
        out.push({ id: t.id, group: single.group, form: t.text, answer, parts: [{ tokenId: t.id, from: 0 }], clue: describe(prev, next) });
        used.add(t.id);
      }
      continue;
    }

    // 語の末尾にあるもの（形容動詞・副詞の「に」「なり」、ナ変の「ぬ」「ね」）
    if (t.text.length >= 2) {
      const stemOf = (n: number) => t.text.slice(0, -n);
      if (p === "形容動詞" && t.text.endsWith("に")) {
        out.push({ id: t.id, group: "ni", form: "に", answer: "keidoshi", parts: [{ tokenId: t.id, from: t.text.length - 1 }], clue: describe(undefined, next, stemOf(1)) });
      } else if (p === "副詞" && t.text.endsWith("に")) {
        out.push({ id: t.id, group: "ni", form: "に", answer: "fukushi", parts: [{ tokenId: t.id, from: t.text.length - 1 }], clue: describe(undefined, next, stemOf(1)) });
      } else if (p === "形容動詞" && /なり$|なる$|なれ$/.test(t.text) && t.text.length >= 3) {
        const form = t.text.slice(-2);
        out.push({ id: t.id, group: "nari", form, answer: "keidoshi", parts: [{ tokenId: t.id, from: t.text.length - 2 }], clue: describe(undefined, next, stemOf(2)) });
      } else if (tag(t).conjugationType === "ナ変" && /[ぬね]$/.test(t.text)) {
        const form = t.text.slice(-1);
        out.push({ id: t.id, group: "nune", form, answer: "nahen", parts: [{ tokenId: t.id, from: t.text.length - 1 }], clue: describe(undefined, next, stemOf(1)) });
      } else {
        continue;
      }
      used.add(t.id);
    }
  }
  return out;
}

export function choiceOf(target: ShikibetsuTarget, id: string): ShikibetsuChoice | undefined {
  return GROUPS[target.group].choices.find((c) => c.id === id);
}
