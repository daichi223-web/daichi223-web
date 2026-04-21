/**
 * 採点エンジン matchSense.ts
 * Ver. 5.0 (完全安全版)
 *
 * 思想:
 * 1. 語幹（lemma）が合っているかを最重要事項として判定
 * 2. 付属語（aux）のニュアンスをどれだけ正確に再現できているかを評価
 * 3. TDZ回避: export function、入力検証、遅延評価
 */

import { normalizeSense } from "./normalizeSense";
import { morphKey } from "./morphTokenizer";
import { isSimilarButWrong as checkSimilar, normalizeVariation } from "./synonymLoader";

export interface SenseCandidate {
  surface: string; // 例: "〔 思はれ 〕"
  norm: string;    // normalizeSense(surface)
}

export interface LearnedCandidate {
  answerNorm: string;
  freq: number;
  avgScore: number;
}

export interface MatchResult {
  ok: boolean;
  reason: "perfect" | "lemma_only" | "connection_missing" | "extra_interpretation" | "essential_missing" | "synonym_error" | "context_mismatch" | "invalid_input" | "learned_accept" | "partial_match";
  matchedSurface?: string;
  score: number; // 0, 60, 65, 70, 75, 85, 90, 100
  detail?: string; // 詳細な評価理由
}

/**
 * 語幹が類義語関係にあるかチェック（synonymLoaderに委譲）
 */
function isSimilarButWrong(ansLemma: string, correctLemma: string): boolean {
  if (!ansLemma || !correctLemma) return false;

  try {
    // 表記揺れを正規化してからチェック
    const ansNorm = normalizeVariation(normalizeSense(ansLemma));
    const correctNorm = normalizeVariation(normalizeSense(correctLemma));

    return checkSimilar(ansNorm, correctNorm);
  } catch (e) {
    console.warn("isSimilarButWrong error:", e);
    return false;
  }
}

/**
 * 複合タグをSetに展開
 * 例: ["完了-存続", "過去"] → Set {"完了", "存続", "過去"}
 */
function createTagSet(tags: string[]): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(tags)) return set;

  for (const tag of tags) {
    if (typeof tag === 'string') {
      tag.split('-').forEach(t => {
        const trimmed = t.trim();
        if (trimmed) set.add(trimmed);
      });
    }
  }
  return set;
}

/**
 * る・らる助動詞の等価タグセット
 * 「る・らる」はオペークタグとして受身/可能/自発/尊敬のいずれとも一致する
 */
const RARU_EQUIVALENTS = new Set(["受身", "可能", "自発", "尊敬", "る・らる"]);

/**
 * タグ同士のファジーマッチ
 * る・らる系のタグは相互に一致とみなす
 */
function tagsMatch(ansTag: string, correctTag: string): boolean {
  if (ansTag === correctTag) return true;
  if (RARU_EQUIVALENTS.has(ansTag) && RARU_EQUIVALENTS.has(correctTag)) return true;
  return false;
}

/**
 * 安全な文字列正規化（括弧・記号除去）
 */
function safeStrip(s: string): string {
  if (!s || typeof s !== 'string') return '';
  try {
    return s.normalize("NFKC").replace(/[〔〕（）\(\)「」『』"'\s]/g, "");
  } catch (e) {
    console.warn("safeStrip error:", e);
    return s.replace(/[〔〕（）\(\)「」『』"'\s]/g, "");
  }
}

/**
 * 生徒解答を candidates (同一qidの正解sense群) と照合
 *
 * 採点アルゴリズム:
 * 1. 入力検証（空文字・不正値をガード）
 * 2. 学習済み正解候補とのマッチング（Firestore集計データ）
 * 3. 語幹（lemma）の一致度を評価
 * 4. 付属語（aux）の一致度を評価
 * 5. 総合的なスコアを算出（0, 60, 65, 75, 85, 90, 100）
 */
export function matchSense(
  answer: string,
  candidates: SenseCandidate[],
  learnedCandidates?: LearnedCandidate[]
): MatchResult {
  // 入力防御
  if (!answer || typeof answer !== 'string') {
    return {
      ok: false,
      reason: "invalid_input",
      score: 0,
      detail: "解答が空または不正です"
    };
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      ok: false,
      reason: "context_mismatch",
      score: 0,
      detail: "候補が空です"
    };
  }

  const ansStripped = safeStrip(answer);
  if (!ansStripped) {
    return {
      ok: false,
      reason: "invalid_input",
      score: 0,
      detail: "解答が実質空です"
    };
  }

  // ステップ2: 学習済み正解候補とのマッチング（優先）
  if (learnedCandidates && learnedCandidates.length > 0) {
    const answerNorm = normalizeSense(ansStripped);

    for (const learned of learnedCandidates) {
      if (normalizeSense(learned.answerNorm) === answerNorm) {
        // 過去に正解とされた回答パターン
        return {
          ok: true,
          reason: "learned_accept",
          score: 100,
          detail: `学習済み正解パターン（過去${learned.freq}回、平均${learned.avgScore}点）`
        };
      }
    }
  }

  // 最良の候補を見つけるために全候補を評価
  let bestResult: MatchResult = {
    ok: false,
    reason: "context_mismatch",
    score: 0
  };

  for (const c of candidates) {
    if (!c || !c.surface) continue;

    const cStripped = safeStrip(c.surface);
    if (!cStripped) continue;

    // --- 形態素解析フェーズ（安全に実行） ---
    let ansMorph, correctMorph;
    try {
      ansMorph = morphKey(ansStripped);
      correctMorph = morphKey(cStripped);
    } catch (e) {
      console.warn("morphKey error:", e);
      continue;
    }

    if (!ansMorph || !ansMorph.content || !correctMorph || !correctMorph.content) {
      continue;
    }

    const ansLemma = ansMorph.content.lemma || '';
    const correctLemma = correctMorph.content.lemma || '';

    if (!ansLemma || !correctLemma) continue;

    const ansTags = createTagSet(ansMorph.aux || []);
    const correctTags = createTagSet(correctMorph.aux || []);

    // --- 評価フェーズ ---

    // ステップ1: 語幹 (lemma) の評価
    let ansLemmaNorm = '', correctLemmaNorm = '';
    try {
      ansLemmaNorm = normalizeSense(ansLemma);
      correctLemmaNorm = normalizeSense(correctLemma);
    } catch (e) {
      console.warn("normalizeSense error:", e);
      continue;
    }

    const lemmaMatches = ansLemmaNorm === correctLemmaNorm;

    if (!lemmaMatches) {
      // 60点評価: 類義語の誤用
      if (isSimilarButWrong(ansLemma, correctLemma)) {
        const result: MatchResult = {
          ok: true,
          reason: "synonym_error",
          matchedSurface: c.surface,
          score: 60,
          detail: `意味的に近いが、文脈に合わない単語を使用（${ansLemma} ≠ ${correctLemma}）`
        };
        if (result.score > bestResult.score) bestResult = result;
        continue;
      } else {
        // 0点評価: 文脈違い
        const result: MatchResult = {
          ok: false,
          reason: "context_mismatch",
          matchedSurface: c.surface,
          score: 0,
          detail: `語幹が文脈に合っていない（${ansLemma} ≠ ${correctLemma}）`
        };
        if (result.score > bestResult.score) bestResult = result;
        continue;
      }
    }

    // ステップ2: 付属語 (aux) の評価 (語幹が一致していることが前提)

    // 差分集合の計算（る・らる系タグのファジーマッチを適用）
    const missingTags = new Set([...correctTags].filter(t => ![...ansTags].some(a => tagsMatch(a, t))));
    const extraTags = new Set([...ansTags].filter(t => ![...correctTags].some(c => tagsMatch(t, c))));

    // 90点評価: 語幹のみ正解（両方に付属語なし）
    if (ansTags.size === 0 && correctTags.size === 0) {
      return {
        ok: true,
        reason: "lemma_only" as const,
        matchedSurface: c.surface,
        score: 90,
        detail: "語幹のみ正解"
      };
    }

    // 100点評価: 完全に一致する場合（付属語も一致）
    if (missingTags.size === 0 && extraTags.size === 0) {
      return {
        ok: true,
        reason: "perfect",
        matchedSurface: c.surface,
        score: 100,
        detail: "完全一致"
      };
    }

    // 85点評価: 接続部分の欠落
    if (missingTags.size === 1 && missingTags.has("接続")) {
      const result: MatchResult = {
        ok: true,
        reason: "connection_missing",
        matchedSurface: c.surface,
        score: 85,
        detail: "接続部分（〜て、〜で）のみ訳し忘れ"
      };
      if (result.score > bestResult.score) bestResult = result;
      continue;
    }

    // 75点評価: 過剰な解釈 (必須要素は満たしている)
    if (missingTags.size === 0 && extraTags.size > 0) {
      const result: MatchResult = {
        ok: true,
        reason: "extra_interpretation",
        matchedSurface: c.surface,
        score: 75,
        detail: `余分な意味を付け加えている（${Array.from(extraTags).join(", ")}）`
      };
      if (result.score > bestResult.score) bestResult = result;
      continue;
    }

    // 65点評価: 必須要素の欠落
    const result: MatchResult = {
      ok: true,
      reason: "essential_missing",
      matchedSurface: c.surface,
      score: 65,
      detail: `必須要素が欠落（${Array.from(missingTags).join(", ")}）`
    };
    if (result.score > bestResult.score) bestResult = result;
  }

  // どの候補とも一致しなかった場合、正規化後の部分一致でフォールバック
  if (bestResult.score === 0 && bestResult.reason === "context_mismatch") {
    // フォールバック: 正規化後の部分一致チェック（活用形の違いを救済）
    const answerNorm = normalizeSense(ansStripped);

    for (const c of candidates) {
      if (!c || !c.surface) continue;
      const cStripped = safeStrip(c.surface);
      if (!cStripped) continue;

      const correctNorm = normalizeSense(cStripped);

      // 部分一致チェック（短い方が長い方に含まれる）
      if (answerNorm.length >= 2 && correctNorm.length >= 2) {
        if (answerNorm.includes(correctNorm) || correctNorm.includes(answerNorm)) {
          return {
            ok: true,
            reason: "partial_match",
            matchedSurface: c.surface,
            score: 70,
            detail: "活用形の違い（部分一致）"
          };
        }
      }
    }

    return {
      ok: false,
      reason: "context_mismatch",
      score: 0,
      detail: "意味が異なります"
    };
  }

  return bestResult;
}
