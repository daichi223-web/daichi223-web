import { describe, it, expect } from 'vitest';
import { buildRetryRound, countScored } from '../lib/quiz/retryRound';
import { shuffle } from '../lib/shuffle';

type Q = { correct: { qid: string }; options: string[]; retry?: boolean };
const q = (qid: string, retry = false): Q => ({ correct: { qid }, options: [qid, 'a', 'b', 'c'], retry });

describe('buildRetryRound', () => {
  it('間違えた語だけを出題順に、retry 付きで返す（重複は1回）', () => {
    const qs = [q('1-1'), q('2-1'), q('3-1'), q('2-1')];
    const r = buildRetryRound(qs, new Set(['3-1', '2-1']));
    expect(r.map((x) => x.correct.qid)).toEqual(['2-1', '3-1']);
    expect(r.every((x) => x.retry)).toBe(true);
    // 元の問題は変えない
    expect(qs.some((x) => x.retry)).toBe(false);
  });

  it('既に再出題の問題は再出題しない（もう一度は1回だけ）', () => {
    const r = buildRetryRound([q('1-1'), q('1-1', true)], new Set(['1-1']));
    expect(r).toHaveLength(1);
    expect(buildRetryRound([q('1-1', true)], new Set(['1-1']))).toHaveLength(0);
  });

  it('選択肢の中身は同じ（並びだけ混ぜ直す）', () => {
    const [r] = buildRetryRound([q('5-2')], new Set(['5-2']), () => 0.3);
    expect([...r.options].sort()).toEqual(['5-2', 'a', 'b', 'c'].sort());
  });

  it('間違いが無ければ空', () => {
    expect(buildRetryRound([q('1-1')], new Set())).toEqual([]);
  });
});

describe('countScored', () => {
  it('再出題は採点の分母に入れない', () => {
    expect(countScored([q('1-1'), q('2-1'), q('2-1', true)])).toBe(2);
  });
});

describe('shuffle', () => {
  it('元の配列を変えず、要素は同じ', () => {
    const a = [1, 2, 3, 4];
    const b = shuffle(a);
    expect(a).toEqual([1, 2, 3, 4]);
    expect([...b].sort()).toEqual([1, 2, 3, 4]);
  });

  it('4択の正解（先頭）の位置がほぼ均等になる', () => {
    let seed = 7;
    const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const counts = [0, 0, 0, 0];
    const N = 40000;
    for (let i = 0; i < N; i++) counts[shuffle(['正', 'a', 'b', 'c'], rng).indexOf('正')]++;
    for (const c of counts) expect(Math.abs(c / N - 0.25)).toBeLessThan(0.02);
  });
});
