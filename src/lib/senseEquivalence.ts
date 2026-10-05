/**
 * 出題の「正解が2つになる」のを防ぐための同義判定と、それに沿った誤答の選び方。
 *
 * 2つの意味（qid）が「同じ意味として紛れる」とは:
 *   (a) 訳の穴の断片（sense の 〔 〕 の中身）が、括弧の注記を外して正規化すると一致する
 *   (b) 辞書形（senseNorm）を「どれか1つでよい言い方」に分けた（expandNorm）どれかが正規化後に一致する
 * 「（本動詞）」「（活用違い）」「（尊敬）」など括弧の注記だけの違いは同じ意味とみなす。
 *
 * 「同じ語の表記ちがい」の見出し語とは、見出し語を分解した語形（「・」「/」の併記、「～」以降の
 * 「打消」等の注記、括弧を外す）が交わるもの。加えて、形容詞の「〜し」と連用形「〜く」、
 * 形容動詞の「〜なり」と語幹も同じ語とみなす（あいなし⇔あいなく、わりなし⇔わりなく、
 * いたし⇔いたく、あながちなり⇔あながち）。品詞は「〜し」「〜なり」側の語で見る
 * （連体詞の「ありし・ありつる」を動詞「ありく」と同じにしないため）。
 *
 * 純粋関数。クライアント（src/App.tsx）と API（api/getChoices.ts）の両方から使う。
 * API は Node の ESM で動くので、import には拡張子 .js を付ける。
 */
import { expandNorm, normalizeAnswer } from './writingJudge.js';

/** 判定に使う1つの意味（Word / kobun_q の1行と同じ形の一部） */
export interface SenseLike {
  qid: string;
  lemma: string;
  /** 訳の穴埋め断片。例: "〔 気づい 〕" */
  sense?: string;
  /** 辞書形の意味。例: "意地が悪い・ひどい" "いらっしゃる（本動詞）" */
  senseNorm?: string;
  /** 品詞。表記ちがいの判定（形容詞・形容動詞）に使う */
  pos?: string;
}

/** 選択肢が「意味」か「見出し語」か */
export type ChoiceMode = 'sense' | 'lemma';

// 全角・半角どちらの括弧も注記として外す
const PAREN = /[（(][^）)]*[）)]/g;
const SEPARATOR = /[・/]/;

/** 〔 〕 の中身。無ければ全体 */
const senseInner = (sense?: string): string[] => {
  const inner = [...(sense ?? '').matchAll(/〔\s*(.+?)\s*〕/g)].map((m) => m[1]);
  return inner.length ? inner : [sense ?? ''];
};

/** 意味の比較キー（正規化済み）。(a) sense の断片と (b) senseNorm の言い方 */
export function senseKeys(w: Pick<SenseLike, 'sense' | 'senseNorm'>): string[] {
  const keys = new Set<string>();
  for (const s of senseInner(w.sense)) {
    const k = normalizeAnswer(s.normalize('NFKC').replace(PAREN, ''));
    if (k) keys.add(k);
  }
  for (const p of expandNorm(w.senseNorm)) {
    const k = normalizeAnswer(p);
    if (k) keys.add(k);
  }
  return [...keys];
}

/** 画面に出る意味（〔 〕 を外したもの）の比較キー。選択肢の表示が重ならないことの確認用 */
export function senseDisplayKey(w: Pick<SenseLike, 'sense'>): string {
  return normalizeAnswer(senseInner(w.sense).join(''));
}

/** 2つの意味が「同じ意味として紛れる」か */
export function isSameMeaning(
  a: Pick<SenseLike, 'qid' | 'sense' | 'senseNorm'>,
  b: Pick<SenseLike, 'qid' | 'sense' | 'senseNorm'>
): boolean {
  if (a.qid === b.qid) return true;
  const kb = senseKeys(b);
  return senseKeys(a).some((k) => kb.includes(k));
}

/**
 * 見出し語を語形に分解する。
 * "え～打消" → ["え"]、"きこゆ・きこえさす" → ["きこゆ", "きこえさす"]、"～あへず" → ["あへず"]、
 * "ゆめ・ゆめゆめ～打消・禁止" → ["ゆめ", "ゆめゆめ"]（「～」以降は注記）。
 * 品詞が形容詞なら「〜し」に「〜く」を、形容動詞なら「〜なり」に語幹を足す。
 */
export function lemmaForms(lemma: string, pos?: string): string[] {
  let s = lemma.normalize('NFKC').replace(PAREN, '').trim().replace(/^[~～]/, '');
  const tilde = s.search(/[~～]/);
  if (tilde >= 0) s = s.slice(0, tilde);
  const forms = s.split(SEPARATOR).map((x) => x.trim()).filter(Boolean);
  const out = new Set(forms);
  for (const f of forms) {
    if (pos?.includes('形容動詞')) {
      if (f.endsWith('なり') && f.length >= 4) out.add(f.slice(0, -2));
    } else if (pos?.includes('形容詞')) {
      if (f.endsWith('し') && f.length >= 3) out.add(f.slice(0, -1) + 'く');
    }
  }
  return [...out];
}

/** 2つの見出し語が同じ語（同一か表記ちがい）か */
export function isSameLemma(a: Pick<SenseLike, 'lemma' | 'pos'>, b: Pick<SenseLike, 'lemma' | 'pos'>): boolean {
  if (a.lemma === b.lemma) return true;
  const fb = lemmaForms(b.lemma, b.pos);
  return lemmaForms(a.lemma, a.pos).some((f) => fb.includes(f));
}

/**
 * 現代語の罠の文字列が、正解の意味と同じになってしまうか。
 * 「よい」⇔ 罠「よい」のような一致のほか、「〜ている」⇔ 罠「いる（存在する）」のように
 * 片方がもう片方を含む（2文字以上）場合も同じとみなす（安全側。罠は入れずにランダム枠で埋める）。
 */
export function trapOverlapsSense(trap: string, w: Pick<SenseLike, 'sense' | 'senseNorm'>): boolean {
  const keys = senseKeys(w);
  const trapKeys = trap
    .normalize('NFKC')
    .replace(PAREN, '')
    .split(SEPARATOR)
    .map((x) => normalizeAnswer(x))
    .filter(Boolean);
  return trapKeys.some((t) =>
    keys.some((k) => t === k || (t.length >= 2 && k.length >= 2 && (t.includes(k) || k.includes(t))))
  );
}

/** 見出し語 → その語の意味一覧 */
export function indexByLemma<T extends SenseLike>(words: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const w of words) {
    const list = m.get(w.lemma);
    if (list) list.push(w);
    else m.set(w.lemma, [w]);
  }
  return m;
}

/**
 * 候補 c を誤答に使ってよいか。
 *   意味が選択肢のとき: 正解と同じ意味でない・正解の表記ちがいの語でない・
 *                      既に選んだ誤答と同じ意味でなく表示も重ならない
 *   見出し語が選択肢のとき: 正解と同じ語（表記ちがい含む）でない・
 *                      正解と同じ意味の qid を持つ語でない（例文に当てはまるか機械では決められないので安全側）・
 *                      既に選んだ誤答と同じ語でない
 */
export function canUseAsDistractor<T extends SenseLike>(
  c: T,
  correct: T,
  picked: T[],
  mode: ChoiceMode,
  byLemma: Map<string, T[]>
): boolean {
  if (c.qid === correct.qid) return false;
  if (mode === 'lemma') {
    if (isSameLemma(c, correct)) return false;
    if ((byLemma.get(c.lemma) ?? []).some((w) => isSameMeaning(w, correct))) return false;
    return !picked.some((p) => isSameLemma(c, p));
  }
  if (isSameMeaning(c, correct)) return false;
  if (c.lemma !== correct.lemma && isSameLemma(c, correct)) return false;
  const display = senseDisplayKey(c);
  if (display === senseDisplayKey(correct)) return false;
  return !picked.some((p) => isSameMeaning(c, p) || senseDisplayKey(p) === display);
}

type FallbackQuizType = 'word-meaning' | 'word-reverse' | 'sentence-meaning' | 'blank-fill';

/**
 * API が使えないときの選択肢（src/App.tsx のフォールバック）。
 * 前後10単語（group番号±10）から選び、足りなければ全単語から試行上限つきで補う。
 * 例文つき（sentence-meaning）は同じ語の別の意味を先に最大2つ入れる。
 * 戻り値は正解を含めてシャッフル済み。誤答が3つ集まらないこともある（呼び出し側は長さで判断する）。
 */
export function buildFallbackOptions<T extends SenseLike & { group: number }>(
  correct: T,
  allWords: T[],
  qType: FallbackQuizType,
  rng: () => number = Math.random,
  byLemma: Map<string, T[]> = indexByLemma(allWords)
): T[] {
  const mode: ChoiceMode = qType === 'word-reverse' || qType === 'blank-fill' ? 'lemma' : 'sense';
  const incorrect: T[] = [];
  const usable = (w: T | undefined): w is T =>
    !!w && !!w.lemma && !!w.sense && canUseAsDistractor(w, correct, incorrect, mode, byLemma);

  const nearbyWords = allWords.filter((w) => Math.abs(w.group - correct.group) <= 10 && w.qid !== correct.qid);
  const MAX_ATTEMPTS = 200;

  if (qType === 'sentence-meaning') {
    for (const m of nearbyWords) {
      if (incorrect.length >= 2) break;
      if (m.lemma === correct.lemma && usable(m)) incorrect.push(m);
    }
    for (const w of [...nearbyWords].sort(() => rng() - 0.5)) {
      if (incorrect.length >= 3) break;
      if (w.lemma !== correct.lemma && usable(w)) incorrect.push(w);
    }
    for (let attempts = 0; incorrect.length < 3 && attempts < MAX_ATTEMPTS; attempts++) {
      const w = allWords[Math.floor(rng() * allWords.length)];
      if (w && w.lemma !== correct.lemma && usable(w)) incorrect.push(w);
    }
  } else {
    for (const w of [...nearbyWords].sort(() => rng() - 0.5)) {
      if (incorrect.length >= 3) break;
      if (usable(w)) incorrect.push(w);
    }
    for (let attempts = 0; incorrect.length < 3 && attempts < MAX_ATTEMPTS; attempts++) {
      const w = allWords[Math.floor(rng() * allWords.length)];
      if (usable(w)) incorrect.push(w);
    }
  }

  return [correct, ...incorrect].sort(() => rng() - 0.5);
}

/**
 * ○×（true-false）の「誤りの意味」を選ぶ。
 * 半々で、同じ見出し語の別の意味（正しい意味と紛れるものを除く）か、別の見出し語の意味
 * （表記ちがいの語と、正しい意味と紛れるものを除く）。同じ語に候補が無ければ別の語から選ぶ。
 * 試行上限内で見つからなければ null。
 */
export function pickTrueFalseWrongMeaning<T extends SenseLike>(
  target: T,
  groupMeanings: T[],
  allWords: T[],
  rng: () => number = Math.random,
  maxAttempts = 50
): T | null {
  const sameGroup = groupMeanings.filter((m) => m.qid !== target.qid && !isSameMeaning(m, target));
  if (rng() < 0.5 && sameGroup.length > 0) {
    return sameGroup[Math.floor(rng() * sameGroup.length)];
  }
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const c = allWords[Math.floor(rng() * allWords.length)];
    if (!c || !c.lemma || !c.sense) continue;
    if (c.lemma !== target.lemma && !isSameLemma(c, target) && !isSameMeaning(c, target)) return c;
  }
  return null;
}
