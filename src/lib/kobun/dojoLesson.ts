// 文法道場の「先生と学ぶ」レッスン（2026-11-15 ユーザー指示「説明→ドリル→説明をいい感じで混ぜて」「少しずつ丁寧に説明してね」）。
// 単元の解説（public/grammar/<id>.json の sections。リファレンスと同じ文。新しい文は書かない＝ユーザー選択）を
// 節ごとに小さく分けて先生が1つずつ見せ、その節の問い（ドリルの refHeading が節の見出しと同じもの）を1〜2問はさむ。
// 最後にポイントでまとめ、ドリル（記録に反映）で仕上げる。設計 = docs/grammar-dojo-lesson.md。
// 下の「レッスンの組み立て」で、途中の問い（今見せた中身から）と、次の節・用語を選ぶ材料を足した。
// DOM・画面に触れない純関数（vitest の node 環境で検査する）。
import type { GrammarDrill, GrammarTopic } from "./types";
import { levelOfSort } from "./topicStatus";
import { shuffle } from "../shuffle";
import { splitSentences } from "../splitSentences";
import { GLOSSARY, splitGloss, type GlossEntry } from "./glossary";
import { parseDanChartLine } from "./dan";

/** 解説の小さなかたまり。1回の「つぎ ▸」で1つ出す */
export type LessonPiece =
  | { type: "text"; text: string } // 地の文の1文／「**接続**: …」のような見出しつきの1行
  | { type: "heading"; text: string } // 節の中の小見出し（### …）
  | { type: "item"; text: string } // 箇条書きの1項目（番号つきは番号ごと）
  | { type: "example"; text: string } // 例文（「例: …」、> の引用）
  | { type: "table"; lines: string[]; caption?: string } // 表（マークダウンの行のまま）
  | { type: "pre"; lines: string[] } // ``` で囲んだ図
  | { type: "dan"; text: string; names: string[] } // 段の図（[段の図:四段,上二段]。text は元の行）
  | { type: "ref"; text: string; content: string }; // 解説の節を開いて見るカード（台本の table が表の無い節のとき。text は節の見出し）

/** 1つの節で出す問いの上限と、レッスン全体の上限 */
export const ASK_PER_SECTION = 2;
export const ASK_MAX = 8;
/** どの節にも問いが結びつかない単元で、最後にまとめて出す数 */
export const ASK_FALLBACK = 3;

const isTableLine = (l: string) => l.includes("|");
const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*\d+\.\s+/;
const EXAMPLE_LEAD = /^(例|用例|【例】)\s*[:：]?\s*/;

/**
 * 節の本文（マークダウン）を小さなかたまりに分ける。
 * 地の文は1文ずつ（かっこの中では切らない）、箇条書きは1項目ずつ、表と図はまるごと1つ。
 * 「例:」だけの行は次のかたまり（表なら見出し、例文なら頭）に付ける。
 */
export function splitSectionPieces(markdown: string): LessonPiece[] {
  const lines = markdown.split("\n");
  const out: LessonPiece[] = [];
  let lead: string | null = null; // 「例:」だけの行
  const push = (p: LessonPiece) => {
    if (lead !== null) {
      if (p.type === "table") p = { ...p, caption: lead };
      else if (p.type !== "pre" && p.type !== "dan") p = { type: "example", text: `${lead} ${p.text}`.trim() };
      lead = null;
    }
    out.push(p);
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith("```")) {
      const block: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) block.push(lines[i]);
      if (block.length) push({ type: "pre", lines: block });
      continue;
    }
    if (isTableLine(t) && i + 1 < lines.length && lines[i + 1].includes("--")) {
      const block: string[] = [];
      for (; i < lines.length && isTableLine(lines[i]); i++) block.push(lines[i].trim());
      i--;
      push({ type: "table", lines: block });
      continue;
    }
    const danNames = parseDanChartLine(t);
    if (danNames) {
      push({ type: "dan", text: t, names: danNames });
      continue;
    }
    if (t.startsWith("#")) {
      push({ type: "heading", text: t.replace(/^#+\s*/, "") });
      continue;
    }
    if (t.startsWith(">")) {
      push({ type: "example", text: t.replace(/^>\s*/, "") });
      continue;
    }
    if (BULLET.test(raw)) {
      push({ type: "item", text: t.replace(BULLET, "") });
      continue;
    }
    if (NUMBERED.test(raw)) {
      push({ type: "item", text: t });
      continue;
    }
    const ex = EXAMPLE_LEAD.exec(t);
    if (ex) {
      const rest = t.slice(ex[0].length).trim();
      if (!rest) lead = "例:";
      else push({ type: "example", text: `例: ${rest}` });
      continue;
    }
    // 地の文・「**接続**: …」の行は1文ずつ
    for (const s of splitSentences(t)) push({ type: "text", text: s });
  }
  if (lead !== null) out.push({ type: "text", text: lead });
  return out;
}

/** 選択肢が2つ以上あり、正解が選択肢に入っている問い（その場で答えられる問い） */
export function isAskable(d: GrammarDrill): boolean {
  if (!d.choices || d.choices.length < 2) return false;
  const a = Array.isArray(d.answer) ? d.answer : [d.answer];
  return a.some((x) => d.choices!.includes(x));
}

/** 低いレベルの問いから無作為に n 問（いちばん低いレベルで足りなければ、次のレベルから足す） */
function pickLowest(pool: GrammarDrill[], n: number, rng: () => number): GrammarDrill[] {
  if (pool.length === 0 || n <= 0) return [];
  const levels = [...new Set(pool.map((d) => levelOfSort(d.sort)))].sort((a, b) => a - b);
  return levels
    .flatMap((L) =>
      shuffle(
        pool.filter((d) => levelOfSort(d.sort) === L),
        rng,
      ),
    )
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// レッスンの組み立て（2026-11-15 追加のユーザー指示「途中で、いくつか質問して。今説明したことのクイズを出したり、
// 次にどこを説明してほしいか聞く」「分かっているものを選ばせたり、説明してほしいものを選ばせたり。
// 文法用語の意味は分かる？とか、接続って？みたいな選択肢」）。
//  - 節の中：かたまりを1つずつ。表を見せた直後・「接続：○○形」の行の直後に、今見せた中身から1問（quick）。
//    最後にその節のドリルの問い（ask、最大2問）。
//  - 節と節のあいだ：先生が「次はどこを説明しようか？」と聞く（残りの節から選ぶ・分かっている節は問題だけ・用語の意味を聞く）。
//    この選ぶところは画面（LessonSession）が持ち、ここでは材料（節・用語）をそろえる。
// ---------------------------------------------------------------------------

/** 今見せた中身から作る1問（表・接続の行）。正解は本文に書いてあることだけ */
export interface QuickQ {
  prompt: string;
  /** 先頭が正解（画面で並べ替える） */
  choices: string[];
  answer: string;
  /** 答えたあとの一言（本文のどこに書いてあったか） */
  explain: string;
  /** 例文（【 】が問う所、《 》が手がかり。台本の問いだけ） */
  context?: string;
  /** 誤答ごとの「なぜそれを選びやすいか」（台本の問いだけ） */
  miss?: Record<string, string>;
}

export type SectionStep =
  | { kind: "piece"; piece: LessonPiece }
  | { kind: "quick"; q: QuickQ }
  | { kind: "ask"; drill: GrammarDrill; nth: number };

export interface LessonSection {
  heading: string;
  /** 単元の中での節の番号（0 から）。-1 は「どの節にも結びつかない問い」をまとめた最後の確かめ */
  index: number;
  steps: SectionStep[];
  /** この節に出てくる文法用語（「〜って？」と聞ける。出てくる順） */
  terms: GlossEntry[];
  /** 台本の部分のときの、選択肢の文（「〜を教えて」「〜は分かってる」） */
  ask?: string;
  known?: string;
}

export interface LessonPlan {
  sections: LessonSection[];
  /** はじめに「分からない言葉はある？」で出す用語（単元ぜんぶの説明に出てくる、先に要る言葉。出てくる順・最大4） */
  startTerms: GlossEntry[];
  /** どの節にも問いが結びつかない単元の、最後の確かめ（無ければ null） */
  finalCheck: LessonSection | null;
  keyPoints: string[];
}

/** はじめに出す用語の数の上限（まとめる前） */
export const START_TERM_MAX = 12;
/** 「どの言葉？」で並べる選択肢の上限 */
export const TERM_OPTION_MAX = 4;

/**
 * 「どの言葉？」の選択肢。同じ種類の用語は1つにまとめ、選択肢の抽象度をそろえる
 * （2026-11-15 ユーザー指摘「質問がMECEではない。抽象度が揃ってない」。「活用」と「未然形」を並べない）。
 */
export interface TermOption {
  key: string;
  label: string;
  /** 種類のまとまりの名前（「活用形」「接続（つながり方）」）。1語だけの選択肢には無い */
  name?: string;
  entries: GlossEntry[];
}

/**
 * 同じ種類としてまとめる用語（name は選択肢の文字）。名前は文法用語で書き、やさしい言い方は（ ）に添える
 * （2026-11-16 ユーザー指示「接続（つながり方）にして。文法用語は覚える必要がある。簡易な言い方にしない。する場合は（）書き」）。
 */
const TERM_FAMILIES: { key: string; name: string; plain?: string; members: string[] }[] = [
  { key: "forms", name: "活用形", members: ["未然形", "連用形", "終止形", "連体形", "已然形", "命令形"] },
  { key: "types", name: "活用の種類", members: ["四段活用", "上二段活用", "下二段活用", "上一段活用", "下一段活用", "変格活用"] },
  { key: "pos", name: "品詞", members: ["用言", "体言", "動詞", "形容詞", "形容動詞", "助動詞", "助詞"] },
  { key: "joshi", name: "助詞の種類", members: ["格助詞", "接続助詞", "係助詞"] },
  { key: "keigo", name: "敬語の種類", members: ["尊敬語", "謙譲語", "丁寧語"] },
  { key: "imi", name: "文法的意味", members: ["打消", "過去", "推量", "意志", "完了", "存続", "詠嘆"] },
  { key: "tsunagi", name: "接続", plain: "つながり方", members: ["仮定", "確定", "順接", "逆接"] },
  { key: "doushi2", name: "動詞の種類", members: ["本動詞", "補助動詞", "自動詞", "他動詞"] },
];

/** 用語を選択肢にまとめる（出てくる順。種類ごとに1つ。上限 max） */
export function termOptions(entries: GlossEntry[], max = TERM_OPTION_MAX): TermOption[] {
  const out: TermOption[] = [];
  for (const e of entries) {
    const fam = TERM_FAMILIES.find((f) => f.members.includes(e.term));
    const key = fam ? fam.key : e.term;
    const have = out.find((o) => o.key === key);
    if (have) have.entries.push(e);
    else out.push({ key, label: fam ? fam.name : `「${e.term}」`, entries: [e] });
  }
  // 種類のまとまりは、1語だけでも種類の名前で出す（抽象度をそろえる）。かっこの中は、この単元に出てくる語（3つ以上は2つ＋など）
  for (const o of out) {
    const fam = TERM_FAMILIES.find((f) => f.key === o.key);
    if (!fam) continue;
    // 種類の中は決まった順（活用形なら 未然形→連用形→…）
    o.entries.sort((x, y) => fam.members.indexOf(x.term) - fam.members.indexOf(y.term));
    const names = o.entries.map((e) => e.term);
    const list = names.length > 2 ? `${names.slice(0, 2).join("・")}など` : names.join("・");
    o.name = fam.plain ? `${fam.name}（${fam.plain}）` : fam.name;
    o.label = fam.plain ? `${fam.name}（${fam.plain}：${list}）` : `${fam.name}（${list}）`;
  }
  return out.slice(0, max);
}

/** 1つの節で出す「今見せた中身から1問」の上限 */
export const QUICK_PER_SECTION = 2;

const FORMS = ["未然形", "連用形", "終止形", "連体形", "已然形", "命令形"];
const EMPTY_CELL = new Set(["", "−", "-", "○", "—", "―", "×", "／"]);
const plain = (s: string) => s.replace(/\*\*/g, "").trim();

/** 表の行をセルに分ける（太字の印は外す） */
function tableRows(lines: string[]): { header: string[]; rows: string[][] } {
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map(plain);
  return { header: cells(lines[0]), rows: lines.slice(2).map(cells) };
}

/**
 * 表から1問。
 * 活用表（見出しが活用形）＝「表で「連体形」の欄は？」・選択肢は同じ行のほかの欄。
 * それ以外（1列目が項目名）＝「「過去（伝聞）」の「訳」は？」・選択肢は同じ列のほかの行。
 * 正解が選択肢の中で1つに決まり、ほかに1つ以上の選択肢が作れるときだけ。
 */
export function tableQuiz(lines: string[], rng: () => number = Math.random): QuickQ | null {
  if (lines.length < 3) return null;
  const { header, rows } = tableRows(lines);
  const ok = (c: string | undefined): c is string => !!c && !EMPTY_CELL.has(c) && c.length <= 24;
  const cands: QuickQ[] = [];
  if (FORMS.includes(header[0])) {
    const row = rows[0] ?? [];
    header.forEach((h, c) => {
      const ans = row[c];
      if (!ok(ans) || row.filter((x) => x === ans).length > 1) return;
      const others = [...new Set(row.filter((x, k) => k !== c && ok(x) && x !== ans))];
      if (others.length < 2) return;
      cands.push({ prompt: `表で「${h}」の欄は？`, choices: [ans, ...shuffle(others, rng).slice(0, 3)], answer: ans, explain: `表の「${h}」の欄は「${ans}」。` });
    });
  } else if (header.length >= 2) {
    rows.forEach((row, r) => {
      const key = row[0];
      if (!ok(key)) return;
      for (let c = 1; c < header.length; c++) {
        const ans = row[c];
        const col = rows.map((x) => x[c]);
        if (!ok(ans) || col.filter((x) => x === ans).length > 1) continue;
        const others = [...new Set(col.filter((x, k) => k !== r && ok(x)))];
        if (others.length < 1) continue;
        cands.push({ prompt: `「${key}」の「${header[c]}」は？`, choices: [ans, ...shuffle(others, rng).slice(0, 3)], answer: ans, explain: `表の「${key}」の「${header[c]}」は「${ans}」。` });
      }
    });
  }
  return cands.length ? shuffle(cands, rng)[0] : null;
}

/** 「**接続**: 連用形に付く」の行から1問（活用形の名前が1つだけ書いてあるとき） */
export function setsuzokuQuiz(text: string, rng: () => number = Math.random): QuickQ | null {
  const t = plain(text);
  if (!/^接続\s*[:：]/.test(t)) return null;
  const found = FORMS.filter((f) => t.includes(f));
  if (found.length !== 1) return null;
  const ans = found[0];
  const others = shuffle(
    FORMS.filter((f) => f !== ans && f !== "命令形"),
    rng,
  ).slice(0, 3);
  return { prompt: "今の説明で、接続は何形？", choices: [ans, ...others], answer: ans, explain: t.replace(/^接続\s*[:：]\s*/, "接続は ") };
}

/** 品詞の名前（「〜って？」に出すときは、ほかの用語のあとに回す。聞きたいのは「接続」「連用形」のような言葉のほう） */
const BASIC_TERMS = new Set(["用言", "体言", "動詞", "形容詞", "形容動詞", "助動詞", "助詞"]);

/** 文の中の文法用語（用語集の48語。重なりなし。出てくる順で、品詞の名前はあとに回す） */
export function termsIn(text: string): GlossEntry[] {
  const out: GlossEntry[] = [];
  for (const part of splitGloss(plain(text))) if (part.entry && !out.includes(part.entry)) out.push(part.entry);
  return [...out.filter((e) => !BASIC_TERMS.has(e.term)), ...out.filter((e) => BASIC_TERMS.has(e.term))];
}

/** 意味の名前（助動詞・助詞の単元では、教える中身そのものになる） */
const MEANING_TERMS = new Set(["打消", "過去", "推量", "意志", "完了", "存続", "詠嘆", "仮定", "確定", "順接", "逆接"]);

/**
 * 「分からない言葉」として出す用語＝この単元を読むのに先に要る言葉だけ（2026-11-15 ユーザー指摘「質問がMECEではない。抽象度が揃ってない」）。
 * 単元そのものが教える言葉は外す：
 *  - 題の用語をふくむ語（「動詞の活用」なら 活用・四段活用…、「音便」なら 音便）
 *  - 要約・ポイントに出てくる意味の名前（「けり」の過去・詠嘆）
 * 活用形・接続などは、要約に出てきても先に要る言葉として残す（「けり」は連用形に接続）。
 */
export function prerequisiteTerms(topic: Pick<GrammarTopic, "title" | "summary" | "keyPoints">, terms: GlossEntry[]): GlossEntry[] {
  const about = `${topic.summary ?? ""}${(topic.keyPoints ?? []).join("")}`;
  const titleTerms = termsIn(topic.title).map((e) => e.term);
  return terms.filter(
    (e) => !titleTerms.some((t) => e.term.includes(t)) && !(MEANING_TERMS.has(e.term) && (about.includes(e.term) || topic.title.includes(e.term))),
  );
}

/**
 * レッスンの材料をそろえる。節ごとに「かたまり（＋今見せた中身から1問）→ その節のドリルの問い」。
 * ドリルの問いは全体で最大8問：まず各節に1問ずつ（前の節から）、余りがあれば2問目を前の節から足す。
 * どの節にも問いが結びつかないとき（形容詞・形容動詞の活用など）は、最後の確かめに3問。
 */
export function buildLessonPlan(topic: GrammarTopic, drills: GrammarDrill[], rng: () => number = Math.random): LessonPlan {
  const secs = (topic.sections ?? []).filter((s) => s.content?.trim());
  const usable = drills.filter((d) => d.topicId === topic.id && isAskable(d));
  const picks = secs.map((s) =>
    pickLowest(
      usable.filter((d) => d.refHeading === s.heading),
      ASK_PER_SECTION,
      rng,
    ),
  );
  const take = secs.map(() => 0);
  let left = ASK_MAX;
  for (let round = 0; round < ASK_PER_SECTION; round++)
    picks.forEach((p, i) => {
      if (left > 0 && p.length > round) {
        take[i]++;
        left--;
      }
    });
  const sections: LessonSection[] = secs.map((s, i) => {
    const steps: SectionStep[] = [];
    let quick = 0;
    // その節のドリルの問いが接続を聞くなら、「接続：○○形」の行からの問いは出さない（同じことを2回聞かない）
    const asksSetsuzoku = picks[i].slice(0, take[i]).some((d) => d.prompt.includes("接続"));
    for (const piece of splitSectionPieces(s.content)) {
      steps.push({ kind: "piece", piece });
      if (quick >= QUICK_PER_SECTION) continue;
      const q =
        piece.type === "table" ? tableQuiz(piece.lines, rng) : piece.type === "text" && !asksSetsuzoku ? setsuzokuQuiz(piece.text, rng) : null;
      if (q) {
        steps.push({ kind: "quick", q });
        quick++;
      }
    }
    picks[i].slice(0, take[i]).forEach((drill, nth) => steps.push({ kind: "ask", drill, nth }));
    return { heading: s.heading, index: i, steps, terms: prerequisiteTerms(topic, termsIn(s.content)) };
  });
  const anyAsk = sections.some((s) => s.steps.some((x) => x.kind === "ask"));
  const fallback = anyAsk ? [] : pickLowest(usable, ASK_FALLBACK, rng);
  return {
    sections,
    finalCheck: fallback.length ? { heading: "", index: -1, steps: fallback.map((drill, nth) => ({ kind: "ask" as const, drill, nth })), terms: [] } : null,
    keyPoints: topic.keyPoints ?? [],
    startTerms: prerequisiteTerms(topic, termsIn(secs.map((s) => s.content).join(" "))).slice(0, START_TERM_MAX),
  };
}

/** 分かっている節は「問題だけ」：その節のドリルの問い。無ければ今見せた中身からの問い（表を見せないので表の問いは外す） */
export function skipSteps(sec: LessonSection): SectionStep[] {
  const asks = sec.steps.filter((x) => x.kind === "ask");
  return asks.length ? asks : sec.steps.filter((x) => x.kind === "quick" && !x.q.prompt.startsWith("表"));
}

/** 名前をかぎかっこで囲む。名前にかぎかっこが入っているとき（「む」と「むず」）は囲まない */
export function quoteName(name: string): string {
  return name.includes("「") ? name : `「${name}」`;
}

/** 節の説明の最初に先生が言う一言。how＝最初の節／選んでもらった節／残り1つ */
export function lessonIntroLine(heading: string, how: "first" | "chosen" | "last"): string {
  if (how === "first") return `まずは${quoteName(heading)}から。`;
  if (how === "last") return `最後は${quoteName(heading)}。`;
  return `じゃあ${quoteName(heading)}を説明するね。`;
}

/** 問いの前に先生が言う一言 */
export function lessonAskLine(kind: "quick" | "ask", nth = 0): string {
  if (kind === "quick") return "今のところを1問。";
  return nth === 0 ? "この節の問題。確かめよう。" : "もう1問。";
}

/** はじめに先生が聞く（この単元で使う用語の意味は分かる？） */
export function lessonStartLines(topicTitle: string, terms: GlossEntry[]): string[] {
  const lines = [`${quoteName(topicTitle)}を、少しずつ説明していくね。`];
  const opts = termOptions(terms);
  if (opts.length) lines.push(`説明には${termOptionNames(opts)}などの言葉が出てくるよ。`, "意味は分かる？");
  return lines;
}

/**
 * 選ぶところの選択肢（2026-11-15 ユーザー指摘「質問がMECEではない。抽象度が揃ってない」で、1つの問いには同じ水準の選択肢だけを並べる）。
 *  start … はじめ：「分かる、はじめよう」「分からない言葉がある」の2つ
 *  terms … 「どの言葉？」：用語だけ＋「もう大丈夫」
 *  next  … 次の節を1つ勧め「どうする？」：説明して／分かってる→問題だけ／ほかの所がいい／分からない言葉がある
 *  other … 「どこにする？」：残りの節だけ＋「やっぱり勧められた節」
 */
export type MenuKind = "start" | "terms" | "next" | "other";


/** はじめの「説明には〜などの言葉が出てくる」の〜（種類のまとまりは「接続（つながり方）」のような名前、1語はその語） */
export function termOptionNames(opts: TermOption[]): string {
  return opts.map((o) => o.name ?? o.label).map((x) => (x.startsWith("「") ? x : `「${x}」`)).join("");
}

/** 用語の「〜って？」に先生が答える文（1文ずつ）。まとめた選択肢は、語ごとに1つの吹き出し */
export function termAnswerLines(entry: GlossEntry): string[] {
  return [`「${entry.term}」は、`, ...splitSentences(entry.body)];
}

export function termOptionAnswerLines(opt: TermOption): string[] {
  if (opt.entries.length === 1) return termAnswerLines(opt.entries[0]);
  return [`${opt.label.replace(/（.*$/, "")}は、この単元では次の${opt.entries.length}つが出てくるよ。`, ...opt.entries.map((e) => `「${e.term}」：${e.body}`)];
}

/** まとめで先生が言う文（ポイントは1つずつ） */
export function lessonWrapLines(keyPoints: string[]): string[] {
  return [...(keyPoints.length ? ["ここまでのまとめ。", ...keyPoints] : ["ここまでよくがんばったね。"]), "あとはドリルで仕上げよう。"];
}

// ---------------------------------------------------------------------------
// 台本（docs/grammar-lessons/*.md の ```lesson → scripts/build-grammar-lessons.mjs --write → public/grammar-lessons/<id>.json）
// からレッスンを組む（2026-11-16）。台本の1部分＝1つの節：先生の説明（say）→ 表（table の節の表・段の図）→ 確かめ（checks）→
// その節のドリルの問い（drillHeading）。台本が無い単元は buildLessonPlan（解説の節から組む）のまま。
// ---------------------------------------------------------------------------

export interface LessonScriptCheck {
  prompt: string;
  context?: string;
  choices: string[];
  answer: string;
  explain: string;
  miss?: Record<string, string>;
}
export interface LessonScriptPart {
  key: string;
  title: string;
  ask: string;
  known: string;
  say: string[];
  table?: string;
  checks?: LessonScriptCheck[];
  drillHeading?: string;
}
export interface LessonScript {
  id: string;
  terms?: string[];
  parts: LessonScriptPart[];
  wrap?: string[];
}

/** 台本として使える形か（壊れたファイルは使わず、解説から組む方へ戻す） */
export function isLessonScript(x: unknown, topicId: string): x is LessonScript {
  const L = x as LessonScript;
  return !!L && L.id === topicId && Array.isArray(L.parts) && L.parts.length > 0 && L.parts.every((p) => p && typeof p.title === "string" && Array.isArray(p.say));
}

/** 台本の部分には確かめ（checks）があるので、ドリルの問いは1部分1問・全体で5問まで（2026-11-16。問いが13〜18問に増えたため） */
export const SCRIPT_ASK_PER_PART = 1;
export const SCRIPT_ASK_MAX = 5;

export function buildScriptPlan(topic: GrammarTopic, script: LessonScript, drills: GrammarDrill[], rng: () => number = Math.random): LessonPlan {
  const usable = drills.filter((d) => d.topicId === topic.id && isAskable(d));
  const secByHeading = new Map((topic.sections ?? []).map((s) => [s.heading, s]));
  const picks = script.parts.map((p) =>
    p.drillHeading ? pickLowest(usable.filter((d) => d.refHeading === p.drillHeading), SCRIPT_ASK_PER_PART, rng) : [],
  );
  const take = script.parts.map(() => 0);
  let left = SCRIPT_ASK_MAX;
  for (let round = 0; round < SCRIPT_ASK_PER_PART; round++)
    picks.forEach((p, i) => {
      if (left > 0 && p.length > round) {
        take[i]++;
        left--;
      }
    });
  const glossOf = (terms: string[]) => terms.map((t) => GLOSSARY.find((e) => e.term === t)).filter((e): e is GlossEntry => !!e);
  const sections: LessonSection[] = script.parts.map((p, i) => {
    const steps: SectionStep[] = p.say.map((text) => ({ kind: "piece" as const, piece: { type: "text" as const, text } }));
    const sec = p.table ? secByHeading.get(p.table) : undefined;
    if (sec) {
      const visual = splitSectionPieces(sec.content).filter((piece) => piece.type === "table" || piece.type === "dan");
      // 表・段の図があればそれを、無ければ節をまるごと「解説を見る」カードで（開いて読む）
      if (visual.length) visual.forEach((piece) => steps.push({ kind: "piece", piece }));
      else steps.push({ kind: "piece", piece: { type: "ref", text: sec.heading, content: sec.content } });
    }
    for (const c of p.checks ?? []) {
      if (!c.choices?.includes(c.answer)) continue;
      steps.push({
        kind: "quick",
        q: { prompt: c.prompt, choices: [c.answer, ...c.choices.filter((x) => x !== c.answer)], answer: c.answer, explain: c.explain, context: c.context, miss: c.miss },
      });
    }
    picks[i].slice(0, take[i]).forEach((drill, nth) => steps.push({ kind: "ask", drill, nth }));
    return { heading: p.title, index: i, steps, terms: prerequisiteTerms(topic, termsIn(p.say.join(""))), ask: p.ask, known: p.known };
  });
  const anyAsk = sections.some((s) => s.steps.some((x) => x.kind === "ask"));
  const fallback = anyAsk ? [] : pickLowest(usable, ASK_FALLBACK, rng);
  // 単元そのものが教える言葉（題名の語）は外す（2026-11-15 の「抽象度をそろえる」と同じ）
  const start = prerequisiteTerms(topic, glossOf(script.terms ?? []));
  return {
    sections,
    finalCheck: fallback.length ? { heading: "", index: -1, steps: fallback.map((drill, nth) => ({ kind: "ask" as const, drill, nth })), terms: [] } : null,
    keyPoints: script.wrap?.length ? script.wrap : topic.keyPoints ?? [],
    startTerms: (start.length ? start : prerequisiteTerms(topic, termsIn(script.parts.flatMap((p) => p.say).join("")))).slice(0, START_TERM_MAX),
  };
}
