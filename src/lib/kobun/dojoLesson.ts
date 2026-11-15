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
import { splitGloss, type GlossEntry } from "./glossary";

/** 解説の小さなかたまり。1回の「つぎ ▸」で1つ出す */
export type LessonPiece =
  | { type: "text"; text: string } // 地の文の1文／「**接続**: …」のような見出しつきの1行
  | { type: "heading"; text: string } // 節の中の小見出し（### …）
  | { type: "item"; text: string } // 箇条書きの1項目（番号つきは番号ごと）
  | { type: "example"; text: string } // 例文（「例: …」、> の引用）
  | { type: "table"; lines: string[]; caption?: string } // 表（マークダウンの行のまま）
  | { type: "pre"; lines: string[] }; // ``` で囲んだ図

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
      else if (p.type !== "pre") p = { type: "example", text: `${lead} ${p.text}`.trim() };
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
}

export interface LessonPlan {
  sections: LessonSection[];
  /** どの節にも問いが結びつかない単元の、最後の確かめ（無ければ null） */
  finalCheck: LessonSection | null;
  keyPoints: string[];
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
    return { heading: s.heading, index: i, steps, terms: termsIn(s.content) };
  });
  const anyAsk = sections.some((s) => s.steps.some((x) => x.kind === "ask"));
  const fallback = anyAsk ? [] : pickLowest(usable, ASK_FALLBACK, rng);
  return {
    sections,
    finalCheck: fallback.length ? { heading: "", index: -1, steps: fallback.map((drill, nth) => ({ kind: "ask" as const, drill, nth })), terms: [] } : null,
    keyPoints: topic.keyPoints ?? [],
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
  if (terms.length) lines.push(`説明には${terms.map((t) => `「${t.term}」`).join("")}という言葉が出てくるよ。`, "意味は分かる？");
  return lines;
}

/** 用語の「〜って？」に先生が答える文（1文ずつ） */
export function termAnswerLines(entry: GlossEntry): string[] {
  return [`「${entry.term}」は、`, ...splitSentences(entry.body)];
}

/** まとめで先生が言う文（ポイントは1つずつ） */
export function lessonWrapLines(keyPoints: string[]): string[] {
  return [...(keyPoints.length ? ["ここまでのまとめ。", ...keyPoints] : ["ここまでよくがんばったね。"]), "あとはドリルで仕上げよう。"];
}
