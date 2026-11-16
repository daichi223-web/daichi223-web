import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// API ハンドラが読み込むサーバ用の接続は、純粋関数の検査には要らない
vi.mock('../../api/_supabaseAdmin.js', () => ({ supabaseAdmin: {} }));

import { buildChoices as apiBuildChoices } from '../../api/getChoices';
import { buildChoices, type QRow } from '../lib/quiz/choices';
import { buildWordQuiz, type CorpusExample, type WordQuizInput } from '../lib/quiz/wordQuiz';
import { trapsOf } from '../lib/quiz/modernTraps';
import { dataParser } from '../utils/dataParser';
import slimJson from '../data/kobunQ.v2.slim.json';
import type { Word } from '../types';
import type { BlankEntry } from '../lib/blanksLoader';
import { exampleContextKey, type ExampleContextMap } from '../lib/exampleContext';

const root = path.resolve(__dirname, '../..');
const readJson = <T,>(rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) as T;

const seeded = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let allWords: Word[] = [];
const blanks = readJson<Record<string, BlankEntry[]>>('public/kobun-blanks.json');
const corpus = readJson<Record<string, CorpusExample[]>>('public/corpus-examples.json');
const exampleContexts = readJson<ExampleContextMap>('public/example-context.json');

beforeAll(async () => {
  await dataParser.loadData();
  allWords = dataParser.getAllWords();
});

const inRange = (from: number, to: number) => allWords.filter((w) => w.group >= from && w.group <= to);
const input = (over: Partial<WordQuizInput>): WordQuizInput => ({
  targetWords: inRange(1, 50),
  allWords,
  quizType: 'word-meaning',
  numQuestions: 10,
  autoPick: false,
  blanks,
  records: { stats: null, boxes: null, due: [] },
  corpus,
  exampleContexts,
  trapsOf,
  recentChoices: [],
  examplesOf: (w) => dataParser.getExamplesForSense(w, w.qid, dataParser.getWordByLemma(w.lemma)),
  rng: seeded(1),
  ...over,
});
const questionsOf = (over: Partial<WordQuizInput>) => {
  const r = buildWordQuiz(input(over));
  if (!r.ok) throw new Error('出題が作れなかった');
  return r;
};

describe('選択肢：API と同じ関数・同じ結果（2026-11-16 ブラウザの中で作るようにした）', () => {
  it('API が使う関数は lib/quiz/choices の buildChoices そのもの', () => {
    expect(apiBuildChoices).toBe(buildChoices);
  });

  it('API の単語データ（data/kobun_q.jsonl.txt＋slim）とブラウザの単語データで、同じ種なら全語・全形式で同じ選択肢になる', () => {
    // API 側の組み立て（api/getChoices.ts の loadQuestionsOnce と同じ）
    const slim = new Map(
      (slimJson as unknown as Array<{ qid: string; senseNorm?: string; pos?: string }>).map((s) => [
        String(s.qid),
        { senseNorm: s.senseNorm, pos: s.pos },
      ])
    );
    const apiMap = new Map<string, QRow>();
    for (const line of fs.readFileSync(path.join(root, 'data/kobun_q.jsonl.txt'), 'utf8').split(/\r?\n/).filter(Boolean)) {
      const o = JSON.parse(line);
      apiMap.set(String(o.qid), { ...o, ...(slim.get(String(o.qid)) ?? {}) });
    }
    const webMap = new Map(allWords.map((w) => [w.qid, w as unknown as QRow]));
    expect(webMap.size).toBe(apiMap.size);

    let n = 0;
    for (const mode of ['word-meaning', 'sentence-meaning', 'word-reverse']) {
      for (const w of allWords) {
        const args = { candidateRows: [], traps: trapsOf(w.lemma), excludeQids: [], mode };
        const a = buildChoices({ ...args, correct: apiMap.get(w.qid)!, qmap: apiMap, rng: seeded(n) }).choices;
        const b = buildChoices({ ...args, correct: webMap.get(w.qid)!, qmap: webMap, rng: seeded(n) }).choices;
        expect(b.map((c) => `${c.qid}|${c.sense}`), `${w.qid} ${mode}`).toEqual(a.map((c) => `${c.qid}|${c.sense}`));
        n++;
      }
    }
    expect(n).toBeGreaterThan(2000);
  });
});

describe('buildWordQuiz（単語クイズの出題の組み立て）', () => {
  it('通信しない（fetch を呼んだら失敗にする）', () => {
    const spy = vi.fn(() => {
      throw new Error('fetch を呼んだ');
    });
    vi.stubGlobal('fetch', spy);
    try {
      expect(questionsOf({ quizType: 'auto' }).questions).toHaveLength(10);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('意味を選ぶ：問題数ぶん・語は重ならない・選択肢は4つで正解を含み重ならない', () => {
    const { questions, usedChoiceQids, composition } = questionsOf({});
    expect(questions).toHaveLength(10);
    expect(new Set(questions.map((q) => q.correct.qid)).size).toBe(10);
    for (const q of questions) {
      expect(q.resolvedType).toBe('word-meaning');
      expect(q.options, q.correct.qid).toHaveLength(4);
      expect(q.options.some((o) => o.qid === q.correct.qid)).toBe(true);
      expect(new Set(q.options.map((o) => o.qid)).size).toBe(4);
    }
    expect(usedChoiceQids.length).toBe(40);
    expect(composition).toBeNull(); // おまかせで選んでいない
  });

  it('今回出す語と、最近使った選択肢は誤答に出さない', () => {
    const recent = inRange(1, 10).map((w) => w.qid);
    const { questions } = questionsOf({ targetWords: inRange(11, 20), numQuestions: 8, recentChoices: recent });
    const asked = new Set(questions.map((q) => q.correct.qid));
    for (const q of questions) {
      for (const o of q.options) {
        if (o.qid === q.correct.qid) continue;
        expect(asked.has(o.qid), `${q.correct.qid}→${o.qid}`).toBe(false);
        expect(recent.includes(o.qid), `${q.correct.qid}→${o.qid}`).toBe(false);
      }
    }
  });

  it('現代語の罠がある語は、意味を選ぶ形式で罠を1つ入れる', () => {
    const w = allWords.find((x) => x.qid === '1-1')!; // おどろく
    expect(trapsOf(w.lemma).length).toBeGreaterThan(0);
    const { questions } = questionsOf({ targetWords: [w], numQuestions: 1 });
    expect(questions[0].options.some((o) => o.qid === `trap:${w.lemma}`)).toBe(true);
  });

  it('範囲が空なら作らない。問題数は範囲の意味の数まで', () => {
    expect(buildWordQuiz(input({ targetWords: [] }))).toEqual({ ok: false, reason: 'empty' });
    const three = inRange(1, 50).slice(0, 3);
    expect(questionsOf({ targetWords: three, numQuestions: 10 }).questions).toHaveLength(3);
  });

  it('順序固定：渡した順に出す。第1問は引き継いだ語', () => {
    const target = inRange(1, 50).slice(0, 6).reverse();
    const seq = questionsOf({ targetWords: target, numQuestions: 6, sequential: true });
    expect(seq.questions.map((q) => q.correct.qid)).toEqual(target.map((w) => w.qid));
    const seed = inRange(21, 30)[4];
    const seeded1 = questionsOf({ targetWords: inRange(21, 30), seedLemma: seed.lemma });
    expect(seeded1.questions[0].correct.lemma).toBe(seed.lemma);
  });

  it('空欄：空欄の例文がある語だけ出し、空欄入りの例文と語の選択肢を付ける', () => {
    const { questions } = questionsOf({ quizType: 'blank-fill' });
    for (const q of questions) {
      expect(blanks[q.correct.qid]?.length ?? 0, q.correct.qid).toBeGreaterThan(0);
      expect(q.resolvedType).toBe('blank-fill');
      expect(q.jpBlank).toBeTruthy();
      expect(q.options).toHaveLength(4);
      // 選択肢は語なので、同じ語の別の意味・現代語の罠は入らない
      expect(q.options.filter((o) => o.lemma === q.correct.lemma)).toHaveLength(1);
    }
    const none = allWords.filter((w) => !(blanks[w.qid]?.length));
    if (none.length > 0) {
      expect(buildWordQuiz(input({ quizType: 'blank-fill', targetWords: none.slice(0, 5) }))).toEqual({ ok: false, reason: 'empty' });
    }
  });

  it('記述：選択肢は作らない', () => {
    for (const q of questionsOf({ quizType: 'meaning-writing' }).questions) expect(q.options).toEqual([]);
  });

  it('おまかせ：箱で問い方が上がる（1 意味→2〜3 例文→4 空欄→5 記述）。箱3以上は実戦例文', () => {
    const target = inRange(1, 60);
    const withCorpus = target.filter((w) => corpus[w.qid]?.length);
    const withBlank = target.filter((w) => blanks[w.qid]?.length);
    expect(withCorpus.length).toBeGreaterThan(0);
    // 5語とも別の語にする（同じ語だと箱の指定が上書きされる）
    const pick: Word[] = [];
    const add = (from: Word[]) => pick.push(from.find((w) => !pick.some((p) => p.lemma === w.lemma))!);
    add(target);
    add(target);
    add(withCorpus);
    add(withBlank);
    add(target);
    expect(new Set(pick.map((w) => w.qid)).size).toBe(5);
    const boxes: Record<string, number> = {
      [pick[0].qid]: 1,
      [pick[1].qid]: 2,
      [pick[2].qid]: 3,
      [pick[3].qid]: 4,
      [pick[4].qid]: 5,
    };
    const { questions } = questionsOf({
      targetWords: pick,
      numQuestions: 5,
      quizType: 'auto',
      sequential: true,
      records: { stats: null, boxes, due: [] },
    });
    expect(questions.map((q) => q.resolvedType)).toEqual([
      'word-meaning',
      'sentence-meaning',
      'sentence-meaning',
      'blank-fill',
      'meaning-writing',
    ]);
    expect(questions.map((q) => q.srsBox)).toEqual([1, 2, 3, 4, 5]);
    expect(questions[2].corpusExample).toBe(true);
    expect(corpus[pick[2].qid].some((e) => e.jp === questions[2].exampleKobun)).toBe(true);
    expect(questions[3].corpusExample).toBe(false); // 空欄の例文に差し替えたら実戦例文ではない
    expect(questions[3].jpBlank).toBeTruthy();
    expect(questions[4].options).toEqual([]);
    // 例文から意味を選ぶ：選択肢の文字を例文の訳の活用に合わせる
    expect(questions[1].optionLabels).toBeTruthy();
    expect(questions[0].optionLabels).toBeUndefined();
  });

  it('箱が取れなかったら、基本例文のまま・箱1の問い方で出す', () => {
    const { questions } = questionsOf({ quizType: 'auto', records: { stats: {}, boxes: null, due: [] }, autoPick: true });
    for (const q of questions) {
      expect(q.srsBox).toBe(1);
      expect(q.corpusExample).toBe(false);
      expect(q.resolvedType).toBe('word-meaning');
    }
  });

  it('おまかせで選ぶ：内訳を返し、期限が来た語を入れる', () => {
    const target = inRange(1, 50);
    const due = [target[30].qid, target[12].qid];
    const boxes: Record<string, number> = { [due[0]]: 2, [due[1]]: 3 };
    const stats = Object.fromEntries(due.map((q) => [q, { correct: 2, incorrect: 0, lastSeen: null }]));
    const r = questionsOf({ targetWords: target, autoPick: true, records: { stats, boxes, due } });
    expect(r.composition).not.toBeNull();
    expect(r.composition!.due).toBe(2);
    for (const q of due) expect(r.questions.map((x) => x.correct.qid)).toContain(q);
    expect(r.questions).toHaveLength(10);
  });

  it('例文ごとの手当て：誤答に出さない意味（avoid）は選択肢に入らない', () => {
    let checked = 0;
    for (const [key, ctx] of Object.entries(exampleContexts)) {
      if (!ctx.avoid?.length) continue;
      const qid = key.split('|')[0];
      const w = allWords.find((x) => x.qid === qid);
      if (!w) continue;
      const ex = dataParser.getExamplesForSense(w, w.qid, dataParser.getWordByLemma(w.lemma));
      const i = ex.kobun.findIndex((jp) => exampleContextKey(qid, jp) === key);
      if (i < 0) continue; // 実戦例文など、基本例文でない例文の手当て
      for (const quizType of ['word-meaning', 'sentence-meaning'] as const) {
        for (let seed = 0; seed < 5; seed++) {
          const { questions } = questionsOf({
            targetWords: [w],
            numQuestions: 1,
            quizType,
            rng: seeded(seed),
            examplesOf: () => ({ kobun: [ex.kobun[i]], modern: [ex.modern[i] ?? ''] }),
          });
          const got = questions[0].options.map((o) => o.qid);
          for (const bad of ctx.avoid) expect(got, `${key} ${quizType}`).not.toContain(bad);
          expect(got).toHaveLength(4);
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('全範囲・50問でも速い（1回 500ms 未満）', () => {
    const t0 = performance.now();
    const r = questionsOf({ targetWords: allWords, numQuestions: 50, quizType: 'sentence-meaning' });
    const ms = performance.now() - t0;
    expect(r.questions).toHaveLength(50);
    expect(ms).toBeLessThan(500);
  });
});
