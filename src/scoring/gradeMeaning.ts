/**
 * kuromoji.jsベースの意味採点エンジン
 * 生成AIなし・フロントのみで堅く採点
 */
import moji from "moji";
import kuromoji from "kuromoji.js";
import { SYN_NOUN, SYN_ADJ, ANT_ADJ } from "../data/synonyms";

export type Morpheme = {
  surface: string;
  base: string;
  pos0: string;      // 大分類: 名詞/動詞/形容詞/助詞/助動詞…
  pos1?: string;     // pos_detail_1（必要なら）
  pos4?: string;     // 活用型（例: 五段-カ行, シク活用 など）
  pos5?: string;     // 活用形（例: 連体形-一般, 已然形-一般 など）
};

export function toM(t: kuromoji.IpadicFeatures): Morpheme {
  return {
    surface: t.surface_form,
    base: t.basic_form === "*" ? t.surface_form : t.basic_form,
    pos0: t.pos,
    pos1: t.pos_detail_1,
    pos4: t.conjugated_type || undefined,
    pos5: t.conjugated_form || undefined,
  };
}

export type GradeConfig = {
  weights: { concept: number; predicate: number; pattern: number; ant_penalty: number };
  allow: {
    adj_end_equiv: boolean;       // 形容詞の 終止/連体 を同値扱い
    subj_particle_equiv: boolean; // が/の を同値扱い
    ignore_copula: boolean;       // だ/です/である を無視
  };
};

export type GradeResult = {
  score: number;
  breakdown: { concept: number; predicate: number; pattern: number; penalty: number };
  feedback: string[];
  tags?: {
    gold: { completed: boolean; negated: boolean; past: boolean; conditional: boolean };
    answer: { completed: boolean; negated: boolean; past: boolean; conditional: boolean };
  };
};

const DEFAULT_CONFIG: GradeConfig = {
  weights: { concept: 60, predicate: 30, pattern: 10, ant_penalty: 50 },
  allow: { adj_end_equiv: true, subj_particle_equiv: true, ignore_copula: true },
};

// ---- tokenizer (singleton) ----
// kuromoji.js の Tokenizer は型引数を取らないので、こちらの型に寄せてから保持する
type KuromojiTokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;
let _tokenizerPromise: Promise<KuromojiTokenizer> | null = null;
export function getTokenizer() {
  if (!_tokenizerPromise) {
    const builder = kuromoji.builder({ dicPath: "/kuromoji/dict" });
    _tokenizerPromise = new Promise<KuromojiTokenizer>((resolve, reject) => {
      builder.build((err, tk) =>
        err ? reject(err) : resolve(tk as unknown as KuromojiTokenizer),
      );
    });
  }
  return _tokenizerPromise!;
}

// ---- utils ----
function normalize(s: string): string {
  return moji(s)
    .convert("ZE", "HE")
    .convert("ZS", "HS")
    .toString()
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

function isParticle(m: Morpheme): boolean {
  return m.pos0 === "助詞";
}

function isCopula(m: Morpheme): boolean {
  return m.base === "だ" || m.base === "です" || m.base === "である" || m.base === "なり";
}

function isNoun(m: Morpheme): boolean {
  return m.pos0 === "名詞";
}

function isAdj(m: Morpheme): boolean {
  return m.pos0 === "形容詞";
}

function isVerb(m: Morpheme): boolean {
  return m.pos0 === "動詞";
}

function isAux(m: Morpheme): boolean {
  return m.pos0 === "助動詞";
}

// ---- 助動詞タグ検知 ----
type SentenceTags = {
  completed: boolean;  // 完了: ぬ, つ, たり, り, た
  negated: boolean;    // 否定: ず, ない, ぬ（打消）
  past: boolean;       // 過去: けり, き, たり
  conditional: boolean; // 条件: ば, たら, なら
};

function detectTags(ms: Morpheme[]): SentenceTags {
  const tags: SentenceTags = {
    completed: false,
    negated: false,
    past: false,
    conditional: false
  };

  for (const m of ms) {
    const base = m.base;

    // 完了助動詞: ぬ, つ, たり, り, た
    if (isAux(m) && ["ぬ", "つ", "たり", "り", "た"].includes(base)) {
      tags.completed = true;
    }

    // 否定助動詞: ず, ない（打消の「ぬ」は文脈依存なので除外）
    if (isAux(m) && ["ず", "ない", "ん"].includes(base)) {
      tags.negated = true;
    }

    // 過去助動詞: けり, き
    if (isAux(m) && ["けり", "き"].includes(base)) {
      tags.past = true;
    }

    // 条件助詞: ば, たら, なら
    if (isParticle(m) && ["ば", "たら", "なら"].includes(base)) {
      tags.conditional = true;
    }
  }

  return tags;
}

function eqWithSyn(a: string, b: string, dict: Record<string,string[]>): boolean {
  return a === b || new Set([a, ...(dict[a] || [])]).has(b);
}

const ADJ_END_EQ = new Set(["終止形", "連体形"]); // 形態素の値が "連体形-一般" などの場合、`includes` で判定

// ---- 抽出: 名詞 + （が/の） + 形容詞（or 述語形）----
function extractNPAdj(ms: Morpheme[], cfg: GradeConfig) {
  const xs = cfg.allow.ignore_copula ? ms.filter(m => !isCopula(m)) : ms.slice();

  // 名詞 + 助詞(が|の) + 形容詞
  for (let i = 0; i < xs.length - 2; i++) {
    const a = xs[i], b = xs[i+1], c = xs[i+2];
    if (isNoun(a) && isParticle(b) && (b.base === "が" || b.base === "の") && isAdj(c)) {
      return { noun: a.base, particle: b.base, pred: c, predType: "ADJ" as const };
    }
  }
  // 述語文: 名詞 + が + （…）+ 形容詞
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i+1];
    if (isNoun(a) && isParticle(b) && b.base === "が") {
      const pred = xs.slice(i+2).find(isAdj);
      if (pred) return { noun: a.base, particle: "が", pred, predType: "ADJ" as const };
    }
  }
  // 名詞 + の + 形容詞（連体）
  for (let i = 0; i < xs.length - 2; i++) {
    const a = xs[i], b = xs[i+1], c = xs[i+2];
    if (isNoun(a) && isParticle(b) && b.base === "の" && isAdj(c)) {
      return { noun: a.base, particle: "の", pred: c, predType: "ADJ" as const };
    }
  }
  // （将来）名詞 + が + 動詞/形容動詞にも拡張可
  return null;
}

// ---- 抽出: 動詞パターン ----
type VerbPattern = {
  verb: Morpheme;
  auxiliaries: Morpheme[];  // 助動詞列
  inflectionForm: string;   // 活用形
};

function extractVerb(ms: Morpheme[]): VerbPattern | null {
  // 動詞を探す
  const verbIdx = ms.findIndex(isVerb);
  if (verbIdx === -1) return null;

  const verb = ms[verbIdx];
  const tail = ms.slice(verbIdx + 1);
  const auxiliaries = tail.filter(isAux);
  const inflectionForm = verb.pos5 || "";

  return { verb, auxiliaries, inflectionForm };
}

// 動詞の語幹を取得（活用を除去）
function getVerbStem(base: string): string {
  // 基本形から「る」「う」などを除去して語幹を取得
  // 簡易実装: 最後の文字を除去
  if (base.endsWith("る") || base.endsWith("う")) {
    return base.slice(0, -1);
  }
  return base;
}

// 受動態・可能態の検知
function detectVoice(auxiliaries: Morpheme[]): { passive: boolean; potential: boolean } {
  const auxBases = auxiliaries.map(a => a.base);
  return {
    passive: auxBases.includes("れる") || auxBases.includes("られる"),
    potential: auxBases.includes("れる") || auxBases.includes("られる") // 文脈で判断が必要
  };
}

// ---- 述語の正規化 ----
function normalizePredicate(pred: Morpheme, tail: Morpheme[], cfg: GradeConfig) {
  if (pred.pos0 === "形容詞") {
    const form = pred.pos5 || "";
    if (cfg.allow.adj_end_equiv && (ADJ_END_EQ.has(form.split("-")[0] || form))) {
      return `ADJ:${pred.base}`; // 終止/連体は同値
    }
    return `ADJ:${pred.base}+${form}`;
  }
  if (pred.pos0 === "動詞") {
    let tag = `VERB:${pred.base}`;
    const aux = tail.filter(isAux).map(a => a.base);
    if (aux.some(a => ["つ","ぬ","たり","り"].includes(a))) tag += "+PERF"; // 完了/存続
    if (aux.some(a => a === "ず"))                 tag += "+NEG";  // 打消
    return tag;
  }
  return `${pred.pos0}:${pred.base}`;
}

function particleClass(p: string, cfg: GradeConfig) {
  if (cfg.allow.subj_particle_equiv && (p === "が" || p === "の")) return "SUBJLIKE";
  return p;
}

// ---- 動詞採点 ----
function gradeVerb(
  goldVerb: VerbPattern,
  answerVerb: VerbPattern,
  goldTags: SentenceTags,
  answerTags: SentenceTags
): GradeResult {
  const breakdown = { concept: 0, predicate: 0, pattern: 0, penalty: 0 };
  const fb: string[] = [];
  let score = 0;

  // 1) 語幹一致チェック (60点)
  const goldStem = getVerbStem(goldVerb.verb.base);
  const answerStem = getVerbStem(answerVerb.verb.base);

  if (goldVerb.verb.base === answerVerb.verb.base || goldStem === answerStem) {
    breakdown.concept = 60;
    score += 60;
    fb.push("動詞の語幹一致");
  } else {
    fb.push(`動詞不一致: 期待「${goldVerb.verb.base}」/ 回答「${answerVerb.verb.base}」`);
    return { score: 0, breakdown, feedback: fb, tags: { gold: goldTags, answer: answerTags } };
  }

  // 2) 活用形チェック (20点)
  const goldForm = goldVerb.inflectionForm.split("-")[0] || goldVerb.inflectionForm;
  const answerForm = answerVerb.inflectionForm.split("-")[0] || answerVerb.inflectionForm;

  // 連用形・終止形は柔軟に許容
  const flexibleForms = ["連用形", "終止形", "連体形"];
  if (goldForm === answerForm ||
      (flexibleForms.includes(goldForm) && flexibleForms.includes(answerForm))) {
    breakdown.predicate = 20;
    score += 20;
  } else {
    breakdown.penalty -= 10;
    score = Math.max(0, score - 10);
    fb.push(`活用形の違い: 期待「${goldForm}」/ 回答「${answerForm}」`);
  }

  // 3) 受動態・可能態チェック (20点)
  const goldVoice = detectVoice(goldVerb.auxiliaries);
  const answerVoice = detectVoice(answerVerb.auxiliaries);

  if (goldVoice.passive === answerVoice.passive) {
    breakdown.pattern = 20;
    score += 20;
  } else {
    breakdown.penalty -= 20;
    score = Math.max(0, score - 20);
    fb.push(goldVoice.passive
      ? "受動態が欠けています（〜れる・〜られる）"
      : "受動態は不要です");
  }

  // 4) 完了・否定チェック
  if (goldTags.completed && !answerTags.completed) {
    breakdown.penalty -= 15;
    score = Math.max(0, score - 15);
    fb.push("完了の意味が欠けています");
  }

  if (goldTags.negated !== answerTags.negated) {
    breakdown.penalty -= 20;
    score = Math.max(0, score - 20);
    fb.push(goldTags.negated ? "否定を見落としています" : "否定ではありません");
  }

  if (score >= 90) fb.push("動詞採点: ほぼ完璧");
  return { score, breakdown, feedback: fb, tags: { gold: goldTags, answer: answerTags } };
}

// ---- 採点本体 ----
export async function gradeMeaningTS(
  gold: string,   // 例: 「身分が低い」
  answer: string, // 例: 「身分の低い」
  cfg: GradeConfig = DEFAULT_CONFIG
): Promise<GradeResult> {
  const tk = await getTokenizer();
  const G = tk.tokenize(normalize(gold)).map(toM);
  const A = tk.tokenize(normalize(answer)).map(toM);

  // タグ検知
  const goldTags = detectTags(G);
  const answerTags = detectTags(A);

  // まず動詞パターンを試す
  const gVerb = extractVerb(G);
  const aVerb = extractVerb(A);

  if (gVerb && aVerb) {
    return gradeVerb(gVerb, aVerb, goldTags, answerTags);
  }

  // 動詞パターンがなければ形容詞パターンへ
  const g = extractNPAdj(G, cfg);
  const a = extractNPAdj(A, cfg);

  const breakdown = { concept: 0, predicate: 0, pattern: 0, penalty: 0 };
  const fb: string[] = [];
  let score = 0;

  if (!g) {
    // 最低限のフォールバック：完全一致のみ
    const exact = normalize(gold) === normalize(answer);
    return {
      score: exact ? 100 : 0,
      breakdown,
      feedback: [exact ? "完全一致" : "比較パターン抽出に失敗（辞書/ルールを拡張してください）"],
      tags: { gold: goldTags, answer: answerTags }
    };
  }
  if (!a) {
    return {
      score: 0, breakdown,
      feedback: ["回答から『名詞＋（が/の）＋形容詞』パターンを抽出できませんでした。表現を簡潔に。"],
      tags: { gold: goldTags, answer: answerTags }
    };
  }

  // 1) 概念（名詞）
  if (g.noun === a.noun || eqWithSyn(g.noun, a.noun, SYN_NOUN)) {
    breakdown.concept = cfg.weights.concept; score += breakdown.concept;
  } else {
    fb.push(`名詞が不一致：期待「${g.noun}」/ 回答「${a.noun}」`);
  }

  // 2) 述語（形容詞）— 同値化（終止/連体）＋同義/反義
  const gPredNorm = normalizePredicate(g.pred, G.slice(G.indexOf(g.pred)+1), cfg);
  const aPredNorm = normalizePredicate(a.pred, A.slice(A.indexOf(a.pred)+1), cfg);

  const gBase = g.pred.base, aBase = a.pred.base;
  if (gBase === aBase || eqWithSyn(gBase, aBase, SYN_ADJ)) {
    breakdown.predicate = cfg.weights.predicate; score += breakdown.predicate;
  } else if ((ANT_ADJ[gBase] || []).includes(aBase)) {
    breakdown.penalty -= cfg.weights.ant_penalty;
    score = Math.max(0, score - cfg.weights.ant_penalty);
    fb.push(`反義の可能性：期待「${gBase}」↔ 回答「${aBase}」`);
  } else {
    fb.push(`形容詞が不一致：期待「${gBase}」/ 回答「${aBase}」`);
  }

  // 3) 構文（助詞ゆれ）
  const pOK =
    particleClass(g.particle, cfg) === particleClass(a.particle, cfg);
  if (pOK) {
    breakdown.pattern = cfg.weights.pattern; score += breakdown.pattern;
  } else {
    fb.push(`助詞の違い：期待「${g.particle}」/ 回答「${a.particle}」`);
  }

  // 4) 完了・否定の意味方向チェック
  if (goldTags.completed && !answerTags.completed) {
    breakdown.penalty -= 20;
    score = Math.max(0, score - 20);
    fb.push("完了の意味が欠けています（ぬ・つ・たり・り など）");
  }

  if (goldTags.negated !== answerTags.negated) {
    breakdown.penalty -= 30;
    score = Math.max(0, score - 30);
    fb.push(goldTags.negated
      ? "否定の意味を見落としています（ず・ない など）"
      : "否定ではありません");
  }

  if (score === 100) fb.push("助詞（が/の）のゆれを許容：満点");
  return { score, breakdown, feedback: fb, tags: { gold: goldTags, answer: answerTags } };
}

// ---- 指示書仕様に合わせたエイリアス ----
export async function gradeMeaning(
  goldText: string,
  studentAnswer: string,
  opts?: {
    allow?: {
      adjEndEquiv?: boolean;
      subjParticleEquiv?: boolean;
      ignoreCopula?: boolean;
    };
    weights?: { concept: number; predicate: number; pattern: number; antPenalty: number };
    ba_condition?: "" | "確定" | "仮定";
  }
): Promise<GradeResult> {
  const cfg: GradeConfig = {
    weights: {
      concept: opts?.weights?.concept ?? DEFAULT_CONFIG.weights.concept,
      predicate: opts?.weights?.predicate ?? DEFAULT_CONFIG.weights.predicate,
      pattern: opts?.weights?.pattern ?? DEFAULT_CONFIG.weights.pattern,
      ant_penalty: opts?.weights?.antPenalty ?? DEFAULT_CONFIG.weights.ant_penalty,
    },
    allow: {
      adj_end_equiv: opts?.allow?.adjEndEquiv ?? DEFAULT_CONFIG.allow.adj_end_equiv,
      subj_particle_equiv: opts?.allow?.subjParticleEquiv ?? DEFAULT_CONFIG.allow.subj_particle_equiv,
      ignore_copula: opts?.allow?.ignoreCopula ?? DEFAULT_CONFIG.allow.ignore_copula,
    },
  };

  const result = await gradeMeaningTS(goldText, studentAnswer, cfg);

  // ba_condition判定
  if (opts?.ba_condition === "仮定" && result.tags?.answer.conditional) {
    // 仮定条件で「〜なら・〜たら」を含む場合は正解扱い
    // 既に高得点なら変更不要
  } else if (opts?.ba_condition === "確定" && result.tags?.answer.conditional) {
    // 確定条件なのに「〜なら・〜たら」がある場合は減点
    result.breakdown.penalty -= 20;
    result.score = Math.max(0, result.score - 20);
    result.feedback.push("確定条件です。「〜なら」「〜たら」は不適切です");
  }

  return result;
}
