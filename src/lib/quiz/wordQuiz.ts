/**
 * 単語クイズ（単語モード）の出題の組み立て（純粋関数。DOM・fetch・DB に触れない）。
 *
 * 2026-11-16 に src/App.tsx の setupWordQuiz から切り出した。出す規則は変えていない。
 *   出す語を決める → 例文を決める → 問い方を決める → 選択肢を作る → 例文ごとの手当て
 * 変えたのは選択肢の作り方の「場所」だけ：1問ごとに /api/getChoices を呼ぶのをやめ、
 * 同じ関数（./choices の buildChoices）をブラウザの中で呼ぶ。
 *
 * 材料（成績・箱・期限・空欄の例文・実戦例文・例文ごとの手当て）は呼ぶ側が渡す（./wordQuizData）。
 */
import type { Word, WordQuizType } from '../../types';
import type { BlankEntry } from '../blanksLoader';
import { pickQuestions, type Bucket, type ItemStat } from '../quizSelector';
import {
  buildFallbackOptions,
  canUseAsDistractor,
  clashesWithTranslation,
  indexByLemma,
  nearbyFirst,
  repairDistractors,
} from '../senseEquivalence';
import { lookupExampleContext, type ExampleContext, type ExampleContextMap } from '../exampleContext';
import { exampleFittedLabels } from './optionForms';
import { buildChoices, type QRow } from './choices';

/** おまかせ以外の「実際に出題される形式」 */
export type ResolvedWordQuizType = Exclude<WordQuizType, 'auto'>;

/** 教材の実戦例文。mark = 問われている語の位置 [[開始, 長さ], …]（あるものだけ。無ければ画面で活用照合） */
export type CorpusExample = { jp: string; translation: string; mark?: [number, number][] };

export interface QuizQuestion {
  correct: Word;
  options: Word[];
  exampleIndex?: number;
  exampleKobun?: string;
  exampleModern?: string;
  senseCount?: number; // 同一 lemma の意味数（多義語は例文を最初から表示）
  srsBox?: number; // 単語レベル（SRS箱 1-5）
  corpusExample?: boolean; // 例文が教材実文（箱3以上で切替）
  resolvedType?: ResolvedWordQuizType; // おまかせ時: この問題の実出題形式
  jpBlank?: string; // blank-fill: 〔　　　〕入りの例文 (Excel原本の手作業空欄)
  exampleMark?: [number, number][]; // 実戦例文に付いてきた対象語の位置（exampleKobun に対する）
  exampleContext?: ExampleContext; // 例文1文で意味が決まらないときの前後の本文・補足（sentence-meaning で表示）
  optionLabels?: Record<string, string>; // 選択肢の文字を例文の訳の活用に合わせたもの（qid → 文字。lib/quiz/optionForms）
  retry?: boolean; // セッションの最後の「もう一度」（lib/quiz/retryRound。SRS・正答数は進めない）
}

/** 学習の記録。取れなかったものは null（stats・boxes）か空（due） */
export type WordQuizRecords = {
  stats: Record<string, ItemStat> | null;
  boxes: Record<string, number> | null;
  /** 期限が来た語（古い順） */
  due: string[];
};

export type WordQuizInput = {
  /** 出題の候補（範囲・カテゴリ・qid の絞り込みを済ませたもの。順序固定のときはその順） */
  targetWords: Word[];
  allWords: Word[];
  quizType: WordQuizType;
  numQuestions: number;
  /** 出す語をおまかせで選ぶか（qid の絞り込みが無く、選び方が「おまかせ」のとき） */
  autoPick: boolean;
  /** targetWords の並び順どおりに出す（復習＝期限の古い順、おかえり＝ウォームアップを先頭） */
  sequential?: boolean;
  /** 第1問に引き継ぐ語（モード切替のとき） */
  seedLemma?: string;
  /** 空欄の例文（qid → 。空欄・おまかせで使う） */
  blanks: Record<string, BlankEntry[]>;
  records: WordQuizRecords;
  /** 実戦例文（qid → ） */
  corpus: Record<string, CorpusExample[]>;
  exampleContexts: ExampleContextMap;
  /** 見出し語の現代語の罠（data/modern_traps.json。./modernTraps） */
  trapsOf: (lemma: string) => string[];
  /** 直前までの出題で使った選択肢（続けて同じ誤答を出さない） */
  recentChoices: string[];
  /** その意味の例文（単語帳の基本例文） */
  examplesOf: (w: Word) => { kobun: string[]; modern: string[] };
  rng?: () => number;
};

export type WordQuizResult =
  | { ok: false; reason: 'empty' }
  | {
      ok: true;
      questions: QuizQuestion[];
      /** おまかせで選んだときの内訳（「前回の内訳」に出す）。おまかせでなければ null */
      composition: Record<Bucket, number> | null;
      /** 今回出した選択肢の qid（呼ぶ側が「最近使った選択肢」に足す） */
      usedChoiceQids: string[];
    };

type Prep = {
  correctWord: Word;
  exampleIndex: number;
  exampleKobun: string;
  exampleModern: string;
  srsBox: number;
  corpusExample: boolean;
  resolvedType: ResolvedWordQuizType;
  jpBlank?: string;
  exampleMark?: [number, number][];
};

export function buildWordQuiz(input: WordQuizInput): WordQuizResult {
  const { allWords, quizType, blanks, records, corpus, exampleContexts } = input;
  const rng = input.rng ?? Math.random;
  const pickIndex = (n: number) => Math.floor(rng() * n);
  let targetWords = input.targetWords;

  // 空欄は Excel 原本の手作業空欄（jpBlank）のある語だけ
  if (quizType === 'blank-fill') {
    targetWords = targetWords.filter((w) => (blanks[w.qid]?.length ?? 0) > 0);
  }
  // 記述式は1単語以上でOK、選択式も1単語以上（前後の単語から選択肢を選ぶ）
  if (targetWords.length < 1) return { ok: false, reason: 'empty' };

  // おまかせ選択。成績か箱が取れなかったときは下のランダムで出す
  let composition: Record<Bucket, number> | null = null;
  let autoPicked = false;
  if (input.autoPick && records.stats && records.boxes) {
    // 期限が来た語（古い順）を先に出す（2026-11-06。出す語の決め方を箱と期限にそろえる）
    const r = pickQuestions({
      items: targetWords,
      key: (w) => w.qid,
      order: (w) => w.group * 100 + (w.meaning_idx ?? 0),
      group: (w) => w.group, // 未着手は各語の1つめの意味から（範囲の語がまんべんなく出る）
      stats: records.stats,
      boxes: records.boxes,
      due: records.due,
      n: input.numQuestions,
    });
    if (r.picked.length > 0) {
      targetWords = r.picked;
      autoPicked = true;
      composition = r.composition;
    }
  }

  const used = new Set<string>();
  const maxQuestions = new Set(targetWords.map((w) => w.qid)).size;
  const actualNumQuestions = Math.min(input.numQuestions, maxQuestions);

  // 出す語と、単語帳の基本例文
  const preps: Prep[] = [];
  for (let i = 0; i < actualNumQuestions; i++) {
    let idx = -1;
    // 第1問: seedLemma が範囲内にあれば優先採用（モード切替時の語引継ぎ）
    if (i === 0 && input.seedLemma) {
      idx = targetWords.findIndex((w) => w.lemma === input.seedLemma && !used.has(w.qid));
    }
    if (idx < 0 && (input.sequential || autoPicked)) {
      // 順序固定: 未使用の先頭を取る
      idx = targetWords.findIndex((w) => !used.has(w.qid));
    }
    if (idx < 0) {
      do {
        idx = pickIndex(targetWords.length);
      } while (used.has(targetWords[idx].qid));
    }
    const correctWord = targetWords[idx];
    used.add(correctWord.qid);

    const examples = input.examplesOf(correctWord);
    const exampleIndex = examples.kobun.length > 0 ? pickIndex(examples.kobun.length) : 0;
    preps.push({
      correctWord,
      exampleIndex,
      exampleKobun: examples.kobun[exampleIndex] || '',
      exampleModern: examples.modern[exampleIndex] || '',
      srsBox: 1,
      corpusExample: false,
      resolvedType: 'word-meaning',
    });
  }

  // 単語レベル（SRS箱）が3以上に育った語は、単語帳の基本例文 → 教材の実戦例文に差し替える。
  // 暗記した例文の再認ではなく、初見の実文で意味が取れるか（転移）を試すため。
  // 箱が取れなかったときは基本例文のまま出す
  if (records.boxes) {
    for (const prep of preps) {
      prep.srsBox = records.boxes[prep.correctWord.qid] ?? 1;
      const pool = corpus[prep.correctWord.qid];
      if (prep.srsBox >= 3 && pool && pool.length > 0) {
        const e = pool[pickIndex(pool.length)];
        prep.exampleKobun = e.jp;
        prep.exampleModern = e.translation;
        prep.exampleMark = e.mark;
        prep.corpusExample = true;
      }
    }
  }

  // 出題形式の解決:
  //   おまかせ = SRS箱に応じて問い方を昇格 (箱1 再認 → 箱2-3 例文 → 箱4 空欄 → 箱5 記述)。
  //   blank-fill / おまかせの箱4 は Excel 原本の空欄テキストに差し替える。
  for (const prep of preps) {
    let qType: ResolvedWordQuizType;
    if (quizType === 'auto') {
      const box = prep.srsBox ?? 1;
      const hasBlank = (blanks[prep.correctWord.qid]?.length ?? 0) > 0;
      if (box <= 1) qType = 'word-meaning';
      else if (box <= 3) qType = 'sentence-meaning';
      else if (box === 4) qType = hasBlank ? 'blank-fill' : 'sentence-meaning';
      else qType = 'meaning-writing';
    } else {
      qType = quizType;
    }
    prep.resolvedType = qType;

    if (qType === 'blank-fill') {
      const pool = blanks[prep.correctWord.qid] ?? [];
      if (pool.length > 0) {
        const b = pool[pickIndex(pool.length)];
        prep.jpBlank = b.jpBlank;
        prep.exampleKobun = b.jp;
        prep.exampleModern = b.translation;
        prep.exampleMark = undefined; // 実戦例文の位置は、差し替えた空欄の例文には当てはまらない
        prep.corpusExample = false;
      } else {
        prep.resolvedType = 'sentence-meaning'; // 空欄なし語のフォールバック
      }
    }
  }

  // 選択肢（記述以外）。今回出す語と、最近使った選択肢は誤答に出さない
  const wordByQid = new Map(allWords.map((w) => [w.qid, w]));
  const qmap = wordByQid as unknown as Map<string, QRow>;
  const excludeQids = [...used, ...input.recentChoices];
  const senseCountOf = new Map<string, number>();
  for (const w of allWords) senseCountOf.set(w.lemma, (senseCountOf.get(w.lemma) ?? 0) + 1);
  const usedChoiceQids: string[] = [];
  const byLemma = indexByLemma(allWords);

  // 出せない誤答（isBad）を外して代わりを入れる。代わりは、まず前後の単語から作った選択肢（今までと同じ）。
  // それで足りないときだけ、別の語の意味を前後の単語から足す。
  // （足さないと、同じ語のほかの意味がすべて「出さない意味」の語で、選択肢が3つになることがあった。2026-11-16）
  const replaceBad = (
    options: Word[],
    correct: Word,
    qType: 'word-meaning' | 'sentence-meaning',
    isBad: (o: Word) => boolean
  ): Word[] => {
    if (!options.some((o) => o.qid !== correct.qid && isBad(o))) return options;
    const base = buildFallbackOptions(correct, allWords, qType, rng, byLemma).filter((w) => w.qid !== correct.qid);
    const kept = options.filter((o) => o.qid !== correct.qid && !isBad(o));
    const spare: Word[] = [];
    const others = allWords.filter((w) => w.qid !== correct.qid && w.lemma !== correct.lemma && !excludeQids.includes(w.qid));
    for (const w of nearbyFirst(others, correct.group, rng)) {
      if (spare.length >= 3) break;
      if (!isBad(w) && canUseAsDistractor(w, correct, [...kept, ...base, ...spare], 'sense', byLemma)) spare.push(w);
    }
    return repairDistractors(options, correct, isBad, [...base, ...spare]);
  };

  const questions: QuizQuestion[] = [];
  for (const prep of preps) {
    const qType = prep.resolvedType;
    let options: Word[] = [];
    if (qType !== 'meaning-writing') {
      const { choices } = buildChoices({
        correct: prep.correctWord as unknown as QRow,
        qmap,
        candidateRows: [],
        traps: input.trapsOf(prep.correctWord.lemma),
        excludeQids,
        // 空欄は選択肢が語（見出し語）なので、同じ語の別の意味・現代語の罠は入れない
        mode: qType === 'blank-fill' ? 'word-reverse' : qType,
        rng,
      });
      if (choices.length >= 4) {
        for (const c of choices) usedChoiceQids.push(c.qid);
        // 選択肢は辞書の形（senseNorm）で出すので単語データの行に置き換える（罠の疑似選択肢はそのまま）
        options = choices.map((c) => wordByQid.get(c.qid) ?? (c as unknown as Word));
      }
      // 4つそろわなかったら前後の単語から作る。
      // 正解と同じ意味・同じ語の表記ちがいは誤答に入れない（選び方は lib/senseEquivalence）
      if (options.length < 4) {
        options = buildFallbackOptions(prep.correctWord, allWords, qType, rng, byLemma);
      }
    }
    const ctx = lookupExampleContext(exampleContexts, prep.correctWord.qid, prep.exampleKobun);
    if (qType === 'word-meaning' || qType === 'sentence-meaning') {
      // 例文の訳の穴と同じ言葉の誤答は、訳どおりに選んだ生徒を×にするので入れ替える（2026-11-04。lib/senseEquivalence）
      options = replaceBad(options, prep.correctWord, qType, (o) => clashesWithTranslation(o, prep.exampleModern));
      // この例文では紛れる意味（同じ語の近い意味）を誤答に出さない（2026-11-05。lib/exampleContext）
      if (ctx?.avoid?.length) {
        const avoid = new Set(ctx.avoid);
        options = replaceBad(options, prep.correctWord, qType, (o) => avoid.has(o.qid));
      }
    }

    questions.push({
      correct: prep.correctWord,
      options,
      exampleIndex: prep.exampleIndex,
      exampleKobun: prep.exampleKobun,
      exampleModern: prep.exampleModern,
      senseCount: senseCountOf.get(prep.correctWord.lemma) ?? 0,
      srsBox: prep.srsBox,
      corpusExample: prep.corpusExample,
      resolvedType: qType,
      jpBlank: prep.jpBlank,
      exampleMark: prep.exampleMark,
      exampleContext: qType === 'sentence-meaning' && ctx && (ctx.before || ctx.after || ctx.note) ? ctx : undefined,
      // 例文から意味を選ぶ: 選択肢は訳なので例文の訳の活用に合わせる（正解＝訳の穴の言葉、誤答＝同じ活用形。助動詞の訳は足さない）
      optionLabels:
        qType === 'sentence-meaning' ? exampleFittedLabels(options, prep.correctWord, prep.exampleModern) : undefined,
    });
  }

  return { ok: true, questions, composition, usedChoiceQids };
}
