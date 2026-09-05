import { describe, it, expect } from 'vitest';
import { classify, pickQuestions, type ItemStat } from '../lib/quizSelector';

type Item = { qid: string; group: number };
const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ qid: `${i + 1}-1`, group: i + 1 }));
const key = (t: Item) => t.qid;
const order = (t: Item) => t.group;
// 決定的な乱数（テスト用）
const seeded = (seed = 1) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const now = new Date('2026-09-05T10:00:00Z');

describe('classify', () => {
  it('記録なし → new', () => expect(classify(undefined)).toBe('new'));
  it('2回中1回以上誤答 → weak', () => expect(classify({ correct: 1, incorrect: 1 })).toBe('weak'));
  it('1回だけ誤答（試行不足）→ mid', () => expect(classify({ correct: 0, incorrect: 1 })).toBe('mid'));
  it('3回以上で誤答率20%以下 → strong', () => expect(classify({ correct: 4, incorrect: 1 })).toBe('strong'));
  it('SRS箱4以上 → strong（誤答が少なければ）', () => expect(classify({ correct: 1, incorrect: 0 }, 4)).toBe('strong'));
  it('箱が高くても誤答率が高ければ weak', () => expect(classify({ correct: 1, incorrect: 2 }, 5)).toBe('weak'));
});

describe('pickQuestions', () => {
  it('苦手を優先し、未着手を番号順に進め、得意は出さない', () => {
    const all = items(30);
    const stats: Record<string, ItemStat> = {};
    // 1-5: 苦手（誤答多い）
    for (let i = 1; i <= 5; i++) stats[`${i}-1`] = { correct: 1, incorrect: 3, lastSeen: '2026-09-01T00:00:00Z' };
    // 6-10: 得意
    for (let i = 6; i <= 10; i++) stats[`${i}-1`] = { correct: 8, incorrect: 0, lastSeen: '2026-09-01T00:00:00Z' };
    // 11-15: 途中
    for (let i = 11; i <= 15; i++) stats[`${i}-1`] = { correct: 2, incorrect: 1, lastSeen: '2026-09-01T00:00:00Z' };
    // 16-30: 未着手
    const r = pickQuestions({ items: all, key, order, stats, n: 10, now, rng: seeded() });
    expect(r.picked).toHaveLength(10);
    expect(r.composition.weak).toBe(4);   // ceil(10*0.4)
    expect(r.composition.new).toBe(3);    // ceil(10*0.3)
    expect(r.composition.strong).toBe(0); // 他で足りるので得意は出ない
    const newOnes = r.picked.filter((t) => !stats[t.qid]).map((t) => t.group).sort((a, b) => a - b);
    expect(newOnes).toEqual([16, 17, 18]); // 番号順に進める
    const weakOnes = r.picked.filter((t) => stats[t.qid]?.incorrect === 3);
    expect(weakOnes.length).toBe(4);
    // 重複なし
    expect(new Set(r.picked.map(key)).size).toBe(10);
  });

  it('全部得意でも n 問埋まる（得意は最後の砦）', () => {
    const all = items(8);
    const stats: Record<string, ItemStat> = {};
    for (const t of all) stats[t.qid] = { correct: 9, incorrect: 0 };
    const r = pickQuestions({ items: all, key, order, stats, n: 5, now, rng: seeded() });
    expect(r.picked).toHaveLength(5);
    expect(r.composition.strong).toBe(5);
  });

  it('記録がまったく無ければ番号順の先頭から', () => {
    const r = pickQuestions({ items: items(20), key, order, stats: {}, n: 4, now, rng: seeded() });
    expect(r.picked.map(order).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('候補が n より少なければ全部返す', () => {
    const r = pickQuestions({ items: items(3), key, order, stats: {}, n: 10, now, rng: seeded() });
    expect(r.picked).toHaveLength(3);
  });

  it('最初の1問は得意ではない', () => {
    const all = items(6);
    const stats: Record<string, ItemStat> = {};
    for (let i = 1; i <= 5; i++) stats[`${i}-1`] = { correct: 9, incorrect: 0 };
    // 6 だけ未着手
    for (let s = 1; s < 20; s++) {
      const r = pickQuestions({ items: all, key, order, stats, n: 6, now, rng: seeded(s) });
      expect(r.picked[0].qid).toBe('6-1');
    }
  });
});
