import { describe, expect, it } from 'vitest';
import { KANSHOKU_STAGE_POSTS, ZURYO_POSTS } from '../lib/kanshokuData';
import { KEITO, cellPosts, keitoOf, keitoSpan, postsAt } from '../lib/kanniKeito';

const STAGE_NS = Object.keys(KANSHOKU_STAGE_POSTS).map(Number);

describe('位階表の系統（kanniKeito）', () => {
  it('位階表に出る官職は、すべて系統の表に書いてある（書き忘れを止める）', () => {
    const all = new Set<string>([
      ...Object.values(KANSHOKU_STAGE_POSTS).flatMap((ps) => ps.map((p) => p.name)),
      ...ZURYO_POSTS.map((z) => `${z.grade}${z.post}`),
    ]);
    const listed = new Set(KEITO.flatMap((k) => k.posts));
    expect([...all].filter((p) => !listed.has(p))).toEqual([]);
  });

  it('1つの官職は1つの系統だけ', () => {
    const names = KEITO.flatMap((k) => k.posts);
    expect(names.length).toBe(new Set(names).size);
  });

  it('同じ段の官職は、どれかの系統のマスに必ず入る（取りこぼしなし）', () => {
    for (const n of STAGE_NS) {
      const inCells = KEITO.flatMap((k) => cellPosts(n, k.id)).sort();
      expect(inCells, `段${n}`).toEqual([...postsAt(n)].sort());
    }
  });

  it('近衛は 少将（正五位下）→ 中将（従四位下）→ 大将（従三位・正三位）の縦の並び', () => {
    expect(cellPosts(10, 'konoe')).toEqual(['近衛少将']);
    expect(cellPosts(12, 'konoe')).toEqual(['近衛中将']);
    expect(cellPosts(16, 'konoe')).toEqual(['近衛大将']);
    expect(keitoSpan('konoe', STAGE_NS)).toEqual({ min: 10, max: 17 });
  });

  it('受領は国司の列（大国守＝従五位上）', () => {
    expect(keitoOf('大国守')).toBe('kokushi');
    expect(cellPosts(9, 'kokushi')).toContain('大国守');
  });
});
