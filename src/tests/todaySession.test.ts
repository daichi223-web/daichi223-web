import { describe, it, expect } from 'vitest';
import { composeTodaySet, estimateToday, countGrowth, growthLine, TODAY_SIZE } from '../lib/todaySession';
import type { ItemStat } from '../lib/quizSelector';

type Item = { qid: string; group: number };
const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ qid: `${i + 1}-1`, group: i + 1 }));
const key = (t: Item) => t.qid;
const order = (t: Item) => t.group;
const seeded = (seed = 1) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const now = new Date('2026-09-06T10:00:00Z');

describe('composeTodaySet', () => {
  it('復習が無ければ範囲から10問を補充する', () => {
    const r = composeTodaySet({ warmup: [], due: [], pool: items(30), key, order, stats: {}, now, rng: seeded() });
    expect(r.qids).toHaveLength(TODAY_SIZE);
    expect(r.parts).toMatchObject({ warmup: 0, review: 0, fresh: 10 });
    // 未着手は番号順に進む（並びはおまかせ側がシャッフルするので集合で比較）
    expect([...r.qids].sort()).toEqual(items(10).map(key).sort());
  });

  it('おかえり → 復習 → 補充 の順で並び、合計10問', () => {
    const r = composeTodaySet({
      warmup: ['20-1', '21-1'],
      due: ['3-1', '4-1', '5-1'],
      pool: items(30), key, order, stats: {}, now, rng: seeded(),
    });
    expect(r.qids.slice(0, 5)).toEqual(['20-1', '21-1', '3-1', '4-1', '5-1']);
    expect(r.qids).toHaveLength(10);
    expect(r.parts).toMatchObject({ warmup: 2, review: 3, fresh: 5 });
    // 補充は既出を避ける
    expect(new Set(r.qids).size).toBe(10);
  });

  it('復習が溜まっていても新しい語を3語入れる（復習は上限で切り、合計10問）', () => {
    const due = items(12).map(key);
    const r = composeTodaySet({ warmup: ['30-1'], due, pool: items(30), key, order, stats: {}, now });
    expect(r.qids).toHaveLength(10);
    expect(r.parts).toMatchObject({ warmup: 1, review: 6, fresh: 3 });
    expect(r.parts.freshComposition?.new).toBe(3);
    // 新しい語は未着手のうち番号の小さい順（復習・おかえりの語は除く）
    expect(r.qids.slice(7)).toEqual(['13-1', '14-1', '15-1']);
  });

  it('範囲に未着手の語が残っていなければ、復習で10問を埋める', () => {
    const pool = items(12);
    const stats: Record<string, ItemStat> = Object.fromEntries(pool.map((t) => [t.qid, { correct: 1, incorrect: 0 }]));
    const r = composeTodaySet({ warmup: [], due: pool.map(key), pool, key, order, stats, now });
    expect(r.parts).toMatchObject({ warmup: 0, review: 10, fresh: 0 });
  });

  it('復習が少なければ従来どおり補充で10問にする', () => {
    const r = composeTodaySet({ warmup: [], due: ['5-1', '6-1'], pool: items(30), key, order, stats: {}, now, rng: seeded() });
    expect(r.qids).toHaveLength(10);
    expect(r.parts).toMatchObject({ review: 2, fresh: 8 });
  });

  it('重複 qid は先勝ちで数える', () => {
    const r = composeTodaySet({ warmup: ['1-1'], due: ['1-1', '2-1'], pool: [], key, order, stats: {}, now });
    expect(r.qids).toEqual(['1-1', '2-1']);
    expect(r.parts).toMatchObject({ warmup: 1, review: 1, fresh: 0 });
  });

  it('補充は苦手を優先する', () => {
    const stats: Record<string, ItemStat> = { '25-1': { correct: 0, incorrect: 3 }, '26-1': { correct: 1, incorrect: 2 } };
    const r = composeTodaySet({ warmup: [], due: [], pool: items(30), key, order, stats, now, rng: seeded() });
    expect(r.qids).toContain('25-1');
    expect(r.qids).toContain('26-1');
    expect(r.parts.freshComposition?.weak).toBe(2);
  });
});

describe('estimateToday', () => {
  it('復習は 10−新しい語の枠−おかえり まで、残りが新しい語', () => {
    expect(estimateToday(0, 0)).toEqual({ review: 0, fresh: 10 });
    expect(estimateToday(0, 3)).toEqual({ review: 3, fresh: 7 });
    expect(estimateToday(0, 50)).toEqual({ review: 7, fresh: 3 });
    expect(estimateToday(5, 3)).toEqual({ review: 2, fresh: 3 });
    expect(estimateToday(5, 10)).toEqual({ review: 2, fresh: 3 });
  });
});

describe('countGrowth / growthLine', () => {
  it('箱の上下と箱5の増減を数える', () => {
    const qids = ['a', 'b', 'c', 'd'];
    const before = { a: 1, b: 4, c: 5, d: 2 };
    const after = { a: 2, b: 5, c: 1, d: 2 };
    expect(countGrowth(qids, before, after)).toEqual({ promoted: 2, demoted: 1, topDelta: 0, started: 0 });
  });
  it('初出は昇格に数えず started にする（初回セッションで「全部一段上へ」と出さない）', () => {
    expect(countGrowth(['x', 'y'], {}, { x: 1, y: 1 })).toEqual({
      promoted: 0, demoted: 0, topDelta: 0, started: 2,
    });
  });
  it('何も変わらず連続も無ければ null', () => {
    expect(growthLine({ promoted: 0, demoted: 0, topDelta: 0, started: 0 }, 1)).toBeNull();
  });
  it('初出だけのときは「はじめての語」', () => {
    expect(growthLine({ promoted: 0, demoted: 0, topDelta: 0, started: 10 }, 1)).toBe('はじめての語 10');
  });
  it('文言は「・」区切り', () => {
    expect(growthLine({ promoted: 7, demoted: 0, topDelta: 2, started: 0 }, 3)).toBe('🔥 3日連続・7語が一段上へ・覚えた語 +2');
  });
});
