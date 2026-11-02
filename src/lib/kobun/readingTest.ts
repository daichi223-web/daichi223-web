/**
 * 教材の読解テスト（第1段・自動問題。2026-11-02 ユーザー指示。設計 = docs/reading-test.md）。
 *
 * 本文の傍線部（①②…）について選択式で答える。問題はデータから自動で作る（捏造しない）：
 * - 語の意味（vocab）：単語帳（330）に紐づく語。紐づけは読解ページと同じ resolveVocabKey。
 *   この箇所の意味は決め手（analysis の decider.meaning）→ 品詞分解の意味の順に、WordCard と同じ cardSenses で単語帳に照らす。
 *   決められない語・理由が「単語帳の意味（…）とは別に」で始まる語は出さない。傍線は語だけ。
 * - 文法的意味（grammar）：助動詞。意味は決め手の meaning → 品詞分解の意味（grammarMeaningLabel）。
 *   誤りの選択肢はその助動詞が取りうる意味（AUX_TABLE＝文法道場の単元の意味の一覧）→ 同じ形のほかの助動詞の意味 → 一般の意味。
 *   助動詞が2つ以上続く箇所を優先し、傍線は用言＋助動詞の連なり（文節）に引いて、その中の1語を指して問う。
 * 手書きの問題ファイル（public/reading-tests/<textId>.json）があれば、そちらを使う（parseManualTest）。
 *
 * 純関数。DOM に触れない（vitest の node 環境で検査する）。並びは決定的（同じ教材なら同じ問題）。
 */
import bundledKobunQ from "@/data/kobunQ.v2.slim.json";
import type { KobunText, TextAnalysis, Token, TokenDecider, DeciderCue } from "@/lib/kobun/types";
import type { Word } from "@/types";
import { resolveVocabKey } from "@/lib/vocabAlias";
import { getQuizQidsForLemma } from "@/lib/vocabLookup";
import { cardSenses, sensesOf } from "@/lib/kobun/wordCardSenses";
import { grammarMeaningLabel } from "@/lib/kobun/grammarMeaningLabel";
import { canUseAsDistractor, indexByLemma, isSameMeaning } from "@/lib/senseEquivalence";
import { senseLabel } from "@/components/quiz/writingVerdict";
import { auxShort, type ChatBubble } from "@/lib/quiz/chatThread";
import { fillTemplate, pickVariant, type TeacherId, type TeacherLines } from "@/lib/teachers";
import { NEUTRAL_LINES, TEACHER_LINES } from "@/lib/teacherLines";
import { fetchJsonAsset } from "@/lib/fetchJson";

export type ReadingKind = "vocab" | "grammar" | "subject" | "kakari" | "reading" | "yaku";

/** 問題の札（「問N」の横） */
export const READING_KIND_LABEL: Record<ReadingKind, string> = {
  vocab: "語の意味",
  grammar: "文法的意味",
  subject: "主語",
  kakari: "係り先",
  reading: "内容",
  yaku: "現代語訳",
};

export interface ReadingExplain {
  /** 手書きの問題の解説（1〜3文） */
  text?: string;
  /** 核イメージ（単語帳の senseCore）／助動詞の意味の一覧 */
  core?: string;
  /** この箇所の決め手（analysis の decider） */
  decider?: { summary: string; cues?: DeciderCue[] };
  /** 現代語の罠 */
  trap?: { modern: string; note?: string };
}

export interface ReadingQ {
  no: number;
  kind: ReadingKind;
  sentenceId: string;
  /** 傍線の範囲（その文の originalText 内の文字位置。end は含まない）。傍線は文をまたがない */
  span: [number, number];
  /** 傍線部の文字列（originalText.slice(span)） */
  spanText: string;
  /** 傍線に重なるトークン（記録用） */
  tokenIds: string[];
  prompt: string;
  choices: string[];
  answerIndex: number;
  explain: ReadingExplain;
  /** 語の意味：単語帳の見出し（単語カードへのリンク） */
  lemma?: string;
  /** 語の意味：正解の意味の qid（意味の一覧の「この文」） */
  qid?: string;
  /** 文法的意味：問うている助動詞（本文の形）と参照単元 */
  target?: string;
  grammarRefId?: string;
}

export interface ReadingTest {
  source: "auto" | "manual";
  title?: string;
  /** 本文の上に出す出典・背景（1〜2行） */
  lead?: string;
  questions: ReadingQ[];
}

export interface BuildOptions {
  /** 1教材あたりの上限（既定 8） */
  max?: number;
}

// ---------------------------------------------------------------------------
// 共通

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
export const circled = (n: number): string => CIRCLED[n - 1] ?? `(${n})`;

// FNV-1a（32bit）。同じ seed なら同じ値（並びを決定的にする）
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/** seed で決まる並べ替え（同じ入力なら同じ順） */
function seededOrder<T>(xs: T[], key: (x: T) => string, seed: string): T[] {
  return xs
    .map((x) => ({ x, h: hash(`${seed}|${key(x)}`) }))
    .sort((a, b) => a.h - b.h)
    .map((o) => o.x);
}

/** 品詞の無い句読点・かぎ括弧（useWordCard と同じ） */
const PUNCT = /^[\s、。，．・「」『』（）()〈〉《》【】〔〕！？!?…―—]+$/;
const PUNCT_EDGE = /^[\s、。，．・「」『』（）()〈〉《》【】〔〕！？!?…―—]+|[\s、。，．・「」『』（）()〈〉《》【】〔〕！？!?…―—]+$/g;
/** 前後の句読点を外す（語に「、」が付いて切られていることがある） */
const trimPunct = (s: string) => s.replace(PUNCT_EDGE, "");
const isPunct = (t: Token) => !t.text.trim() || PUNCT.test(t.text) || t.grammarTag?.pos === "記号";
const isParticle = (pos: string) => /助詞$/.test(pos);
const isYougen = (pos: string) => /動詞|形容詞|形容動詞/.test(pos) && pos !== "助動詞";

// ---------------------------------------------------------------------------
// 助動詞の意味の一覧（出典＝文法道場の単元 public/grammar/jodoshi-*.json の「意味」の表）。
// forms はその助動詞の活用した形（本文の形からどの助動詞かを決めるのに使う）。
// 同じ形で意味の違う助動詞（なり＝断定／伝聞推定、ぬ＝完了／ず の連体形 など）は別の行。

interface AuxEntry {
  /** 表示名（問い文には本文の形を出す） */
  name: string;
  meanings: string[];
  forms: string[];
}

export const AUX_TABLE: AuxEntry[] = [
  { name: "き", meanings: ["過去"], forms: ["せ", "き", "し", "しか"] },
  { name: "けり", meanings: ["過去", "詠嘆"], forms: ["けら", "けり", "ける", "けれ"] },
  { name: "つ", meanings: ["完了", "強意"], forms: ["て", "つ", "つる", "つれ", "てよ"] },
  { name: "ぬ", meanings: ["完了", "強意"], forms: ["な", "に", "ぬ", "ぬる", "ぬれ", "ね"] },
  { name: "たり", meanings: ["完了", "存続"], forms: ["たら", "たり", "たる", "たれ"] },
  { name: "り", meanings: ["完了", "存続"], forms: ["ら", "り", "る", "れ"] },
  { name: "ず", meanings: ["打消"], forms: ["ず", "ざら", "ざり", "ぬ", "ざる", "ね", "ざれ"] },
  { name: "じ", meanings: ["打消推量", "打消意志"], forms: ["じ"] },
  { name: "む", meanings: ["推量", "意志", "勧誘", "適当", "仮定", "婉曲"], forms: ["む", "め", "ん"] },
  { name: "むず", meanings: ["推量", "意志", "勧誘", "適当", "仮定", "婉曲"], forms: ["むず", "むずる", "むずれ", "んず", "んずる", "んずれ"] },
  { name: "らむ", meanings: ["現在推量", "原因推量", "伝聞", "婉曲"], forms: ["らむ", "らめ", "らん"] },
  { name: "けむ", meanings: ["過去推量", "過去の原因推量", "過去伝聞", "婉曲"], forms: ["けむ", "けめ", "けん"] },
  {
    name: "べし",
    meanings: ["推量", "意志", "当然", "可能", "命令", "適当"],
    forms: ["べく", "べから", "べし", "べき", "べかる", "べけれ", "べかり", "べう", "べか"],
  },
  {
    name: "まじ",
    meanings: ["打消推量", "打消意志", "打消当然", "不可能", "禁止", "不適当"],
    forms: ["まじく", "まじから", "まじ", "まじき", "まじかる", "まじけれ", "まじかり", "まじう"],
  },
  { name: "まし", meanings: ["反実仮想", "推量", "意志"], forms: ["ませ", "ましか", "まし"] },
  { name: "めり", meanings: ["推定", "婉曲"], forms: ["めり", "める", "めれ"] },
  { name: "らし", meanings: ["推定"], forms: ["らし", "らしき"] },
  { name: "なり", meanings: ["断定", "存在"], forms: ["なら", "なり", "に", "なる", "なれ", "な"] },
  { name: "なり", meanings: ["伝聞", "推定"], forms: ["なり", "なる", "なれ", "な"] },
  { name: "たり", meanings: ["断定"], forms: ["たら", "たり", "と", "たる", "たれ"] },
  { name: "る", meanings: ["受身", "尊敬", "自発", "可能"], forms: ["れ", "る", "るる", "るれ", "れよ"] },
  { name: "らる", meanings: ["受身", "尊敬", "自発", "可能"], forms: ["られ", "らる", "らるる", "らるれ", "られよ"] },
  { name: "す", meanings: ["使役", "尊敬"], forms: ["せ", "す", "する", "すれ", "せよ"] },
  { name: "さす", meanings: ["使役", "尊敬"], forms: ["させ", "さす", "さする", "さすれ", "させよ"] },
  { name: "しむ", meanings: ["使役", "尊敬"], forms: ["しめ", "しむ", "しむる", "しむれ", "しめよ"] },
  { name: "まほし", meanings: ["願望"], forms: ["まほしく", "まほしから", "まほし", "まほしき", "まほしかる", "まほしけれ"] },
  { name: "たし", meanings: ["願望"], forms: ["たく", "たから", "たし", "たき", "たかる", "たけれ", "たかり"] },
  { name: "ごとし", meanings: ["比況", "例示"], forms: ["ごとく", "ごとし", "ごとき", "ごとくなら", "ごとくなり", "ごとくに", "ごとくなる", "ごとくなれ"] },
];

/** 足りないときに足す一般の意味（よく問われる意味。正解と同じものは除く） */
const GENERAL_MEANINGS = ["過去", "完了", "推量", "断定", "打消", "受身", "使役", "存続"];

/** 品詞分解・決め手の意味の略記・別表記を、一覧の言い方にそろえる */
function normalizeAuxMeaning(raw: string | undefined, auxName?: string): string {
  let m = grammarMeaningLabel(raw);
  m = m.replace(/（.*）$/, "").trim(); // 比況（幹）など
  const alias: Record<string, string> = { 現推: "現在推量", 完了体: "完了", 希望: "願望", 過去の伝聞: "過去伝聞" };
  m = alias[m] ?? m;
  if (auxName === "けむ" && m === "原因推量") m = "過去の原因推量";
  return m;
}

/** 本文の形と意味から、どの助動詞か（一覧に無ければ null） */
export function auxEntryOf(surface: string, meaning: string): AuxEntry | null {
  for (const e of AUX_TABLE) {
    if (!e.forms.includes(surface)) continue;
    if (e.meanings.includes(normalizeAuxMeaning(meaning, e.name))) return e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 単語帳

type QWord = Word & { pos?: string };
const KOBUN_Q = bundledKobunQ as unknown as QWord[];
let qByQid: Map<string, QWord> | null = null;
let qByLemma: Map<string, QWord[]> | null = null;
let qByPos: Map<string, QWord[]> | null = null;
function qIndex() {
  if (!qByQid) {
    qByQid = new Map(KOBUN_Q.filter((q) => q.qid).map((q) => [q.qid, q]));
    qByLemma = indexByLemma(KOBUN_Q.filter((q) => q.qid && q.lemma));
    qByPos = new Map();
    for (const q of KOBUN_Q) {
      if (!q.qid || !q.lemma || !q.sense) continue;
      const arr = qByPos.get(q.pos ?? "") ?? [];
      arr.push(q);
      qByPos.set(q.pos ?? "", arr);
    }
  }
  return { byQid: qByQid!, byLemma: qByLemma!, byPos: qByPos! };
}
export const kobunWordByQid = (qid: string): QWord | undefined => qIndex().byQid.get(qid);

/** 選択肢・答え合わせに出す意味の表示（辞書形。補助動詞の注記は「補動」） */
export const vocabChoiceLabel = (w: Word): string => auxShort(senseLabel(w)).replace(/〔|〕/g, "").trim();

// ---------------------------------------------------------------------------
// 候補を集める

interface Flat {
  token: Token;
  sentenceId: string;
  sIdx: number;
  tIdx: number;
  order: number;
}

interface Cand {
  kind: "vocab" | "grammar";
  sentenceId: string;
  order: number; // 本文の中の位置（並べる順）
  tokens: Flat[]; // 傍線の範囲のトークン
  key: string; // 同じ語は1回（vocab=見出し、grammar=助動詞）
  score: number; // grammar：助動詞の連なり・意味の多さで優先
  build: (no: number) => Omit<ReadingQ, "no" | "kind" | "sentenceId" | "span" | "spanText" | "tokenIds"> | null;
}

function shuffleChoices(correct: string, wrongs: string[], seed: string): { choices: string[]; answerIndex: number } {
  const choices = seededOrder([correct, ...wrongs], (x) => x, seed);
  return { choices, answerIndex: choices.indexOf(correct) };
}

function vocabCandidate(f: Flat, dec: TokenDecider | undefined, textId: string): Cand | null {
  const t = f.token;
  const tag = t.grammarTag ?? { pos: "" };
  const pos = tag.pos ?? "";
  if (isPunct(t) || pos === "助動詞" || isParticle(pos)) return null;
  const key = resolveVocabKey(t.text, tag.baseForm, pos, tag as never);
  if (!key) return null;
  // 理由が「単語帳の意味（…）とは別に」で始まる語は、単語帳の見出しと別の語なので出さない
  if (dec?.summary && /^単語帳の意味/.test(dec.summary)) return null;
  const classOnly = (m?: string) => (m && !/^(尊敬語|謙譲語|丁寧語)$/.test(m) ? m : undefined);
  const meaning = classOnly(dec?.meaning) ?? classOnly(tag.meaning);
  if (!meaning) return null;
  const qids = getQuizQidsForLemma(key, pos);
  const g0 = qids.length ? Number(qids[0].split("-")[0]) : undefined;
  const { senses, curIdx } = cardSenses(key, Number.isFinite(g0) ? g0 : undefined, meaning);
  if (curIdx < 0) return null;
  const { byQid, byLemma, byPos } = qIndex();
  const correct = byQid.get(senses[curIdx].qid);
  if (!correct?.sense) return null;
  const correctLabel = vocabChoiceLabel(correct);
  const seed = `${textId}:${t.id}`;
  return {
    kind: "vocab",
    sentenceId: f.sentenceId,
    order: f.order,
    tokens: [f],
    key: `v:${key}`,
    score: 0,
    build: (no) => {
      // 誤りの選択肢：同じ見出しのほかの意味 → 同じ品詞のほかの語の意味（同義の重なり・表示の重なりは除く）
      const picked: QWord[] = [];
      const labels = new Set([correctLabel]);
      const tryAdd = (c: QWord | undefined) => {
        if (!c?.sense || picked.length >= 3) return;
        if (!canUseAsDistractor(c, correct, picked, "sense", byLemma)) return;
        const l = vocabChoiceLabel(c);
        if (!l || labels.has(l)) return;
        labels.add(l);
        picked.push(c);
      };
      const same = sensesOf(correct.lemma).map((s) => byQid.get(s.qid));
      for (const c of seededOrder(same.filter((x): x is QWord => !!x), (x) => x.qid, seed)) tryAdd(c);
      const pool = (byPos.get(correct.pos ?? "") ?? []).filter((c) => c.lemma !== correct.lemma);
      for (const c of seededOrder(pool, (x) => x.qid, seed)) {
        if (picked.length >= 3) break;
        tryAdd(c);
      }
      if (picked.length < 2) return null;
      const { choices, answerIndex } = shuffleChoices(correctLabel, picked.map(vocabChoiceLabel), seed);
      return {
        prompt: `傍線部${circled(no)}「${trimPunct(t.text)}」の意味として最も適当なものを選べ。`,
        choices,
        answerIndex,
        explain: {
          core: correct.senseCore,
          decider: dec?.summary ? { summary: dec.summary, cues: dec.cues } : undefined,
          trap: correct.trap?.modern ? { modern: correct.trap.modern, note: correct.trap.note } : undefined,
        },
        lemma: correct.lemma,
        qid: correct.qid,
      };
    },
  };
}

/** 右へ伸ばす尊敬の補助動詞（「させたまふ」の「たまふ」） */
const HONORIFIC_AUX_VERB = /^(たま|給)/;

function grammarCandidates(sentTokens: Flat[], decOf: (id: string) => TokenDecider | undefined, textId: string): Cand[] {
  const out: Cand[] = [];
  let i = 0;
  while (i < sentTokens.length) {
    if (sentTokens[i].token.grammarTag?.pos !== "助動詞") {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < sentTokens.length && sentTokens[j + 1].token.grammarTag?.pos === "助動詞") j++;
    const chain = sentTokens.slice(i, j + 1);
    // 文節：前の用言（無ければ前の体言など1語）＋助動詞の連なり＋尊敬の補助動詞
    let from = i;
    const prev = sentTokens[i - 1];
    if (prev && !isPunct(prev.token) && !isParticle(prev.token.grammarTag?.pos ?? "")) {
      from = i - 1;
      const prev2 = sentTokens[i - 2];
      if (isYougen(prev.token.grammarTag?.pos ?? "") && prev2 && isYougen(prev2.token.grammarTag?.pos ?? "") && /動詞/.test(prev2.token.grammarTag?.pos ?? "")) {
        from = i - 2; // 複合した用言（「思ひ出で」など）
      }
    }
    let to = j;
    const next = sentTokens[j + 1];
    if (next && /動詞/.test(next.token.grammarTag?.pos ?? "") && HONORIFIC_AUX_VERB.test(next.token.text)) to = j + 1;
    const span = sentTokens.slice(from, to + 1);

    // 連なりの中で問う1語：意味が決まり一覧にある語のうち、意味の多い語（同じなら後ろ）
    let best: { f: Flat; e: AuxEntry; meaning: string; dec?: TokenDecider } | null = null;
    for (const f of chain) {
      const dec = decOf(f.token.id);
      const raw = dec?.meaning || f.token.grammarTag?.meaning;
      if (!raw) continue;
      const e = auxEntryOf(f.token.text, raw);
      if (!e) continue;
      const meaning = normalizeAuxMeaning(raw, e.name);
      if (!best || e.meanings.length >= best.e.meanings.length) best = { f, e, meaning, dec };
    }
    if (best) {
      const { f, e, meaning, dec } = best;
      const surface = f.token.text;
      // 同じ形が傍線の中に2つ以上あれば、何番目かを言う
      const sameForm = span.filter((x) => x.token.text === surface);
      const nth = sameForm.length > 1 ? `${sameForm.indexOf(f) + 1}つ目の` : "";
      const spanText = trimPunct(span.map((x) => x.token.text).join(""));
      const seed = `${textId}:${f.token.id}`;
      const homographs = AUX_TABLE.filter((x) => x !== e && x.forms.includes(surface)).flatMap((x) => x.meanings);
      const pool = [...seededOrder(e.meanings, (x) => x, seed), ...seededOrder(homographs, (x) => x, seed), ...GENERAL_MEANINGS];
      const wrongs: string[] = [];
      for (const m of pool) {
        if (wrongs.length >= 3) break;
        if (m !== meaning && !wrongs.includes(m)) wrongs.push(m);
      }
      const ownCount = e.meanings.length - 1 + new Set(homographs.filter((m) => m !== meaning)).size;
      out.push({
        kind: "grammar",
        sentenceId: f.sentenceId,
        order: span[0].order,
        tokens: span,
        key: `g:${e.name}:${e.meanings.join("")}`,
        score: (chain.length >= 2 ? 2 : 0) + (ownCount >= 1 ? 1 : 0),
        build: (no) => {
          const { choices, answerIndex } = shuffleChoices(meaning, wrongs, seed);
          return {
            prompt:
              span.length > 1
                ? `傍線部${circled(no)}「${spanText}」の中の${nth}助動詞「${surface}」の文法的意味として最も適当なものを選べ。`
                : `傍線部${circled(no)}の助動詞「${surface}」の文法的意味として最も適当なものを選べ。`,
            choices,
            answerIndex,
            explain: {
              core: `助動詞「${e.name}」の意味：${e.meanings.join("・")}`,
              decider: dec?.summary ? { summary: dec.summary, cues: dec.cues } : undefined,
            },
            target: surface,
            grammarRefId: f.token.grammarRefId,
          };
        },
      });
    }
    i = j + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 生成

/** 自動問題の出典・背景の1行（text.source。無ければ出さない） */
export function autoLead(text: Pick<KobunText, "source">): string | undefined {
  const s = (text.source ?? "").trim();
  return s ? `出典：『${s.replace(/^『|』$/g, "")}』` : undefined;
}

export function buildReadingTest(text: KobunText, analysis: TextAnalysis | null | undefined, opts: BuildOptions = {}): ReadingTest {
  const max = opts.max ?? 8;
  const decMap = new Map<string, TokenDecider>();
  for (const a of analysis?.tokenAnalyses ?? []) if (a.decider) decMap.set(a.tokenId, a.decider);
  const decOf = (id: string) => decMap.get(id);

  const flat: Flat[] = [];
  const bySentence: Flat[][] = [];
  (text.sentences ?? []).forEach((s, sIdx) => {
    const arr: Flat[] = [];
    s.tokens.forEach((token, tIdx) => {
      const f = { token, sentenceId: s.id, sIdx, tIdx, order: flat.length };
      flat.push(f);
      arr.push(f);
    });
    bySentence.push(arr);
  });

  // 候補（同じ語は最初の1回）
  const vocab: Cand[] = [];
  const seenV = new Set<string>();
  for (const f of flat) {
    const c = vocabCandidate(f, decOf(f.token.id), text.id);
    if (!c || seenV.has(c.key)) continue;
    seenV.add(c.key);
    vocab.push(c);
  }
  const grammarAll = bySentence.flatMap((ts) => grammarCandidates(ts, decOf, text.id));
  const grammar: Cand[] = [];
  const seenG = new Set<string>();
  for (const c of [...grammarAll].sort((a, b) => b.score - a.score || a.order - b.order)) {
    if (seenG.has(c.key)) continue;
    seenG.add(c.key);
    grammar.push(c);
  }

  // 何問ずつ：語の意味と文法を半々（足りない方は他方で埋める）
  const total = Math.min(max, vocab.length + grammar.length);
  let g = Math.min(grammar.length, Math.ceil(total / 2));
  const v = Math.min(vocab.length, total - g);
  g = Math.min(grammar.length, total - v);

  const pickedG = grammar.slice(0, g); // 連なり・多義を優先した順
  const covered = new Set(pickedG.flatMap((c) => c.tokens.map((f) => f.token.id)));
  // 語の意味は文法の傍線と重ならない語から、本文全体に散らして選ぶ
  const vFree = vocab.filter((c) => !covered.has(c.tokens[0].token.id));
  const pickedV: Cand[] = [];
  const vn = Math.min(v, vFree.length);
  for (let k = 0; k < vn; k++) pickedV.push(vFree[Math.floor(((k + 0.5) * vFree.length) / vn)]);

  const ordered = [...pickedG, ...pickedV].sort((a, b) => a.order - b.order);
  const questions: ReadingQ[] = [];
  for (const c of ordered) {
    const no = questions.length + 1;
    const body = c.build(no);
    if (!body) continue;
    const first = c.tokens[0].token;
    const last = c.tokens[c.tokens.length - 1].token;
    const sentence = text.sentences.find((s) => s.id === c.sentenceId)!;
    // 語に句読点が付いて切られていることがある（「、寝入り」）。傍線は句読点を外して引く
    let a = first.start;
    let b = last.end;
    while (a < b && PUNCT.test(sentence.originalText[a])) a++;
    while (b > a && PUNCT.test(sentence.originalText[b - 1])) b--;
    questions.push({
      no,
      kind: c.kind,
      sentenceId: c.sentenceId,
      span: [a, b],
      spanText: sentence.originalText.slice(a, b),
      tokenIds: c.tokens.map((f) => f.token.id),
      ...body,
    });
  }
  return { source: "auto", title: text.title, lead: autoLead(text), questions };
}

// ---------------------------------------------------------------------------
// 手書きの問題ファイル（public/reading-tests/<textId>.json）

export interface ManualReadingFile {
  textId?: string;
  title?: string;
  lead?: string;
  questions?: Array<{
    no?: number;
    kind?: string;
    sentenceId?: string;
    span?: [number, number];
    spanText?: string;
    prompt?: string;
    choices?: string[];
    answerIndex?: number;
    explain?: string;
  }>;
}

const KINDS: ReadingKind[] = ["vocab", "grammar", "subject", "kakari", "reading", "yaku"];

/**
 * 手書きの問題ファイルを ReadingQ にそろえる。傍線の文字列（spanText）が本文の該当範囲と合わない問題、
 * 文・範囲・選択肢・正解の番号が正しくない問題は捨てて warn に知らせる（既定 console.warn）。
 */
export function parseManualTest(
  raw: ManualReadingFile,
  text: KobunText,
  warn: (msg: string) => void = (m) => console.warn(m),
): ReadingTest {
  const out: ReadingQ[] = [];
  (raw.questions ?? []).forEach((q, i) => {
    const tag = `[readingTest] ${text.id} 問${q.no ?? i + 1}`;
    const s = text.sentences.find((x) => x.id === q.sentenceId);
    if (!s) return warn(`${tag}: 文 ${q.sentenceId} が本文にありません`);
    const kind = KINDS.includes(q.kind as ReadingKind) ? (q.kind as ReadingKind) : null;
    if (!kind) return warn(`${tag}: kind「${q.kind}」は使えません`);
    const [a, b] = Array.isArray(q.span) ? q.span : [NaN, NaN];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b > s.originalText.length || a >= b)
      return warn(`${tag}: 傍線の範囲 ${JSON.stringify(q.span)} が文の外です`);
    const actual = s.originalText.slice(a, b);
    if (q.spanText !== actual) return warn(`${tag}: spanText「${q.spanText}」が本文「${actual}」と一致しません`);
    const choices = (q.choices ?? []).map((c) => String(c));
    if (choices.length < 2 || new Set(choices).size !== choices.length) return warn(`${tag}: 選択肢が足りないか重複しています`);
    if (!Number.isInteger(q.answerIndex) || q.answerIndex! < 0 || q.answerIndex! >= choices.length)
      return warn(`${tag}: answerIndex ${q.answerIndex} が選択肢の範囲外です`);
    if (!q.prompt) return warn(`${tag}: 問い文がありません`);
    out.push({
      no: out.length + 1,
      kind,
      sentenceId: s.id,
      span: [a, b],
      spanText: actual,
      tokenIds: s.tokens.filter((t) => t.start < b && t.end > a).map((t) => t.id),
      prompt: q.prompt.replace(/傍線部[①-⑳]/, () => `傍線部${circled(out.length + 1)}`),
      choices,
      answerIndex: q.answerIndex!,
      explain: { text: q.explain },
    });
  });
  return { source: "manual", title: raw.title || text.title, lead: raw.lead || autoLead(text), questions: out };
}

/**
 * 手書きの問題ファイル（public/reading-tests/<textId>.json）を読む。無い・読めない・有効な問題が0なら null（自動問題を使う）。
 * 呼ぶのは画面だけ（テストでは parseManualTest を直接使う）
 */
export async function fetchManualTest(textId: string, text: KobunText): Promise<ReadingTest | null> {
  const r = await fetchJsonAsset<ManualReadingFile>(`/reading-tests/${textId}.json`);
  if (!r.ok || !r.data || !Array.isArray(r.data.questions)) return null;
  const t = parseManualTest(r.data, text);
  return t.questions.length ? t : null;
}

// ---------------------------------------------------------------------------
// 答え合わせ（ChatFeedback に渡す吹き出し）

export function readingThread(
  q: ReadingQ,
  chosen: number,
  opts: { teacher: TeacherId; voice: boolean },
): ChatBubble[] {
  const lines: TeacherLines = opts.voice ? (TEACHER_LINES[opts.teacher] ?? TEACHER_LINES.sei) : NEUTRAL_LINES;
  const ok = chosen === q.answerIndex;
  const correct = q.choices[q.answerIndex];
  const key: keyof TeacherLines = ok ? "correct" : "wrong";
  const say = fillTemplate(pickVariant(lines[key], `read:${q.sentenceId}:${q.no}:${key}`), {
    語: q.lemma ?? q.target ?? q.spanText,
    正解: correct,
  });
  const bubbles: ChatBubble[] = [
    { side: "me", kind: "answer", text: q.choices[chosen] ?? "（無回答）" },
    { side: "teacher", kind: "verdict", text: say, verdict: ok ? "ok" : "ng" },
  ];
  const ex = q.explain;
  if (ex.text) bubbles.push({ side: "teacher", kind: "text", text: ex.text });
  if (q.kind === "vocab" && q.lemma && ex.core) {
    bubbles.push({
      side: "teacher",
      kind: "core",
      lead: fillTemplate(pickVariant(lines.coreLead, `read:${q.no}:coreLead`), { 語: q.lemma, 正解: correct }),
      lemma: q.lemma,
      core: ex.core,
      trapModern: ex.trap?.modern,
    });
  } else if (ex.core) {
    bubbles.push({ side: "teacher", kind: "text", text: ex.core });
  }
  if (ex.decider?.summary) bubbles.push({ side: "teacher", kind: "text", text: `🔑 この箇所では：${ex.decider.summary}` });
  if (q.kind === "vocab" && q.lemma && q.qid) {
    const items = sensesOf(q.lemma).map((s) => {
      const w = kobunWordByQid(s.qid);
      return { label: w ? vocabChoiceLabel(w) : s.senseNorm ?? s.sense ?? "", current: s.qid === q.qid || (!!w && !!kobunWordByQid(q.qid!) && isSameMeaning(w, kobunWordByQid(q.qid!)!)) };
    });
    if (items.length >= 2) bubbles.push({ side: "teacher", kind: "senses", items });
  }
  return bubbles;
}

/** 正答数・かかった時間の表示 */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
