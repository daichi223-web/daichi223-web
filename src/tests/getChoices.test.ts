import { describe, it, expect, vi } from 'vitest';

// API ハンドラが読み込むサーバ用の接続は、純粋関数の検査には要らない
vi.mock('../../api/_supabaseAdmin.js', () => ({ supabaseAdmin: {} }));

import { buildChoices, type QRow } from '../../api/getChoices';
import { indexByLemma } from '../lib/senseEquivalence';
import slimJson from '../data/kobunQ.v2.slim.json';

const slim = slimJson as unknown as (QRow & { group: number })[];
const qmap = new Map<string, QRow>(slim.map((w) => [w.qid, w]));
const byLemma = indexByLemma(slim);
const seeded = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const build = (w: QRow, mode: string, rng: () => number) =>
  buildChoices({ correct: w, qmap, candidateRows: [], traps: [], excludeQids: [], mode, rng }).choices;

describe('buildChoices（API の選択肢）', () => {
  it('意味が2つ以上ある語は、全件で4つそろう（word-meaning）', () => {
    const rng = seeded(11);
    for (const [, meanings] of byLemma) {
      if (meanings.length < 2) continue;
      for (const w of meanings) expect(build(w, 'word-meaning', rng), w.qid).toHaveLength(4);
    }
  });

  // 意味が2つ以上ある語は「この語の意味を選ぶ」でも例文を最初から出す（WordQuizContent の contextRequired）ので、
  // どちらの形式でも同じ語の別の意味を1つ入れて、例文で区別させる
  it('word-meaning・sentence-meaning とも、同じ語の別の意味を1つ入れる', () => {
    const w = qmap.get('1-1')!; // おどろく（気づく／目を覚ます）
    for (const mode of ['word-meaning', 'sentence-meaning']) {
      const choices = build(w, mode, seeded(12));
      expect(choices.some((c) => c.qid !== w.qid && c.lemma === w.lemma), mode).toBe(true);
    }
  });

  it('ランダム枠は番号が前後10以内の語から先に選ぶ', () => {
    const rng = seeded(13);
    for (const w of slim.filter((_, i) => i % 7 === 0)) {
      for (const c of build(w, 'word-reverse', rng)) {
        expect(Math.abs((qmap.get(c.qid) as unknown as { group: number }).group - w.group), `${w.qid}→${c.qid}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('正解の位置がほぼ均等（偏ったシャッフルを使っていない）', () => {
    const rng = seeded(14);
    const w = qmap.get('50-1')!;
    const counts = [0, 0, 0, 0];
    const N = 4000;
    for (let i = 0; i < N; i++) counts[build(w, 'word-meaning', rng).findIndex((c) => c.qid === w.qid)]++;
    for (const c of counts) expect(Math.abs(c / N - 0.25)).toBeLessThan(0.04);
  });
});
