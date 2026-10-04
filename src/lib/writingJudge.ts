/**
 * 記述（意味を書く）の判定。点数ではなく「どの意味で読んだか」を返す。
 *
 * 判定するのは語義の核だけ。活用・時制・敬語の形は問わない。
 * 機械で決まらない答えは pending（保留）にして、呼び出し側が自己判定などへ回す。
 * 純粋関数。DB・画面には触れない。
 */

/** 判定に使う1つの意味（kobunQ.v2.slim の1行と同じ形の一部） */
export interface JudgeSense {
  qid: string;
  /** 訳の穴埋め断片。例: "〔 病気がよくなっ 〕" */
  sense?: string;
  /** 辞書形の意味。例: "意地が悪い・ひどい" "（女のもとに）通う" */
  senseNorm?: string;
  examples?: Array<{ translation?: string }>;
  trap?: { modern?: string };
}

export type WritingVerdict =
  | 'correct'      // この文脈の意味で書けた
  | 'other_sense'  // 同じ語の別の意味を書いた
  | 'modern_trap'  // 現代語の意味で読んだ
  | 'blank'        // 無回答・1文字
  | 'pending';     // 機械では決まらない

export interface WritingJudgeResult {
  verdict: WritingVerdict;
  /** other_sense のとき、書いてしまった意味の qid */
  matchedQid?: string;
  /** 正解の言い方の一部だけ合っている（保留のうち「惜しい」候補） */
  partial?: boolean;
  /** 別義の言い方にも当たっていた（意味が重なる語。正解として扱う） */
  overlap?: boolean;
}

export interface WritingJudgeInput {
  answer: string;
  target: JudgeSense;
  /** 同じ見出し語の他の意味 */
  siblings?: JudgeSense[];
  /** 教員が正解と認めた言い方（qid ごと） */
  accepted?: string[];
  /** 読み（かな）へ直す関数。渡せば漢字とかなの表記ちがいを吸収する */
  toReading?: (s: string) => string;
}

const STRIP = /[〔〕（）()「」『』"'\s、。,.・〜~…ー\-‐–—―?？!！]/g;

/** 比較用の正規化: NFKC・記号除去・カタカナ→ひらがな */
export function normalizeAnswer(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .replace(STRIP, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 文末の言い回しを落とす（気づいた→気づい、通っている→通っ） */
const TAIL = /(ている|ていた|ました|ます|です|である|こと|た|て|だ|で)$/;

/** 活用のゆれを吸収する粗い語幹。短くなりすぎる語は削らない */
function stem(s: string): { stem: string; cut: boolean } {
  let x = s;
  const t = x.replace(TAIL, '');
  if (t.length >= 2) x = t;
  if (x.length >= 3 && /[ぁ-ん]$/.test(x)) return { stem: x.slice(0, -1), cut: true };
  return { stem: x, cut: false };
}

/** 打消で終わるか。「音を立てる」と「音を立てず」を同じにしないため */
const isNegative = (s: string): boolean => /(ない|ず|ぬ|ません|なかった|ずに|ないで)$/.test(s);

const brackets = (s?: string): string[] =>
  [...(s ?? '').matchAll(/〔\s*(.+?)\s*〕/g)].map((m) => m[1]);

/**
 * "（女のもとに）通う" → ["通う", "女のもとに通う"]
 * "さっきの（ありつる）" → ["さっきの"]（後ろの括弧は注記として捨てる）
 * "意地が悪い・ひどい" → ["意地が悪い", "ひどい"]
 */
function expandNorm(senseNorm?: string): string[] {
  const src = (senseNorm ?? '').normalize('NFKC');
  if (!src) return [];
  const out: string[] = [];
  const bare = src.replace(/\([^)]*\)/g, '');
  out.push(...bare.split(/[・\/]/));
  const lead = src.match(/^\(([^)]*)\)(.+)$/);
  if (lead && !/[・\/]/.test(lead[1])) {
    out.push(...lead[2].replace(/\([^)]*\)/g, '').split(/[・\/]/).map((p) => lead[1] + p));
  }
  return out;
}

function variantsOf(s: JudgeSense): string[] {
  const v = new Set<string>();
  for (const p of expandNorm(s.senseNorm)) v.add(normalizeAnswer(p));
  for (const b of brackets(s.sense)) v.add(normalizeAnswer(b));
  for (const ex of s.examples ?? []) for (const b of brackets(ex.translation)) v.add(normalizeAnswer(b));
  v.delete('');
  return [...v];
}

function trapVariantsOf(s: JudgeSense): string[] {
  const v = new Set<string>();
  for (const p of (s.trap?.modern ?? '').normalize('NFKC').split(/[・\/()]/)) v.add(normalizeAnswer(p));
  v.delete('');
  return [...v];
}

type Keys = { raw: string; stem: string; cut: boolean; neg: boolean; yomi?: string; yomiStem?: string; yomiCut?: boolean };

function keysOf(s: string, toReading?: (s: string) => string): Keys {
  const st = stem(s);
  const k: Keys = { raw: s, stem: st.stem, cut: st.cut, neg: isNegative(s) };
  if (toReading) {
    k.yomi = normalizeAnswer(toReading(s));
    const ys = stem(k.yomi);
    k.yomiStem = ys.stem;
    k.yomiCut = ys.cut;
  }
  return k;
}

// 語幹どうしの一致は、両方とも語尾を落とした（または両方落としていない）ときだけ認める。
// 「ある」と「歩く→ある」のような、短い語の偶然の一致を避ける。
function same(a: Keys, b: Keys): boolean {
  if (a.raw === b.raw) return true;
  if (a.neg !== b.neg) return false;
  if (a.stem.length >= 2 && a.stem === b.stem && a.cut === b.cut) return true;
  if (a.yomi && b.yomi) {
    if (a.yomi === b.yomi) return true;
    if (a.yomiStem!.length >= 2 && a.yomiStem === b.yomiStem && a.yomiCut === b.yomiCut) return true;
  }
  return false;
}

function contains(a: Keys, b: Keys): boolean {
  if (a.neg !== b.neg) return false;
  const pair = (x?: string, y?: string) =>
    !!x && !!y && x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
  return pair(a.stem, b.stem) || pair(a.yomiStem, b.yomiStem);
}

export function judgeWriting(input: WritingJudgeInput): WritingJudgeResult {
  const { target, siblings = [], accepted = [], toReading } = input;
  const norm = normalizeAnswer(input.answer);
  if (!norm) return { verdict: 'blank' };

  const ans = keysOf(norm, toReading);
  const hit = (vs: string[]) => vs.some((v) => same(ans, keysOf(v, toReading)));

  if (hit(accepted.map(normalizeAnswer).filter(Boolean))) return { verdict: 'correct' };

  const targetVariants = variantsOf(target);
  const onTarget = hit(targetVariants);
  const sibling = siblings.find((s) => s.qid !== target.qid && hit(variantsOf(s)));
  const partial = targetVariants.some((v) => contains(ans, keysOf(v, toReading)));

  if (onTarget) return sibling ? { verdict: 'correct', overlap: true } : { verdict: 'correct' };
  // 別義に当たっても、正解の言い方と重なるなら正解（「いつもの」と「いつものように」）
  if (sibling) return partial ? { verdict: 'correct', overlap: true } : { verdict: 'other_sense', matchedQid: sibling.qid };
  if (hit(trapVariantsOf(target))) return { verdict: 'modern_trap' };

  // 1文字の正解（「縁」「旨」）があるので、照合のあとで無回答を判定する
  if (norm.length <= 1) return { verdict: 'blank' };
  return partial ? { verdict: 'pending', partial: true } : { verdict: 'pending' };
}
