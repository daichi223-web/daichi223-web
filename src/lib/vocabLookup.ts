/**
 * lemma + pos からクイズ qid を逆引き、および詳細解説の有無判定。
 * 複数画面 (TextReader / GrammarPopover / Result / VocabPage / Stats / Search)
 * で再利用するため、ここに集約。
 */
import bundledKobunQ from '@/data/kobunQ.json';
import bundledVocabIndex from '@/data/vocabIndex.json';

type KobunQEntry = { qid: string; lemma: string; pos?: string; sense?: string };
type VocabIndexEntry = { slug: string; title: string; pos: string; category: string };

const kobunQ = bundledKobunQ as KobunQEntry[];
const vocabIndex = bundledVocabIndex as Record<string, VocabIndexEntry>;

// ===== クイズ qid 逆引き =====

let lemmaPosToQids: Record<string, string[]> | null = null;
let lemmaToQids: Record<string, string[]> | null = null;

function buildIndexes() {
  if (lemmaPosToQids && lemmaToQids) return;
  const byLemmaPos: Record<string, string[]> = {};
  const byLemma: Record<string, string[]> = {};
  for (const w of kobunQ) {
    if (!w?.qid || !w?.lemma) continue;
    (byLemma[w.lemma] ??= []).push(w.qid);
    if (w.pos) {
      const k = `${w.lemma}:${w.pos}`;
      (byLemmaPos[k] ??= []).push(w.qid);
    }
  }
  lemmaPosToQids = byLemmaPos;
  lemmaToQids = byLemma;
}

/**
 * lemma (基本形) と pos (品詞) から、対応するクイズ qid のリストを返す。
 * pos 一致を優先、ヒットしなければ lemma だけで再検索 (フォールバック)。
 */
export function getQuizQidsForLemma(lemma: string, pos?: string): string[] {
  if (!lemma) return [];
  buildIndexes();
  if (pos) {
    const exact = lemmaPosToQids![`${lemma}:${pos}`];
    if (exact && exact.length > 0) return exact;
  }
  return lemmaToQids![lemma] ?? [];
}

/**
 * lemma + pos でクイズが存在するかどうか (有無のみ)。
 */
export function hasQuizForLemma(lemma: string, pos?: string): boolean {
  return getQuizQidsForLemma(lemma, pos).length > 0;
}

// ===== 詳細解説 (vocabIndex) 判定 =====

let vocabIndexKeys: Set<string> | null = null;
function ensureVocabKeys() {
  if (!vocabIndexKeys) vocabIndexKeys = new Set(Object.keys(vocabIndex));
}

/**
 * lemma に対応する詳細解説 HTML が存在するかどうか。
 * vocabIndex のキー一致 (1 lemma 1 entry の単純判定)。
 */
export function hasVocabExplanation(lemma: string): boolean {
  ensureVocabKeys();
  return vocabIndexKeys!.has(lemma);
}

/**
 * トークン (token.text + grammarTag) から、クイズ・解説の有無と
 * 関連 qid をまとめて返す。
 */
export type VocabStatus = {
  hasQuiz: boolean;
  hasExplanation: boolean;
  quizQids: string[];
  // 「解説で開ける lemma」(baseForm 優先、なければ token.text)
  explanationLemma: string | null;
};

export function lookupVocabStatus(
  tokenText: string,
  baseForm?: string,
  pos?: string,
): VocabStatus {
  const candidates = [baseForm, tokenText].filter(Boolean) as string[];
  let qids: string[] = [];
  for (const c of candidates) {
    qids = getQuizQidsForLemma(c, pos);
    if (qids.length > 0) break;
  }
  let explLemma: string | null = null;
  for (const c of candidates) {
    if (hasVocabExplanation(c)) {
      explLemma = c;
      break;
    }
  }
  return {
    hasQuiz: qids.length > 0,
    hasExplanation: explLemma !== null,
    quizQids: qids,
    explanationLemma: explLemma,
  };
}
