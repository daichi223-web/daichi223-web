import { describe, it, expect } from 'vitest';
import { nextWordRange, nextRangeLabel } from '../lib/quiz/nextRange';

describe('nextWordRange（終わったあとの「次の範囲」）', () => {
  it('同じ幅で、すぐ後ろへ送る', () => {
    expect(nextWordRange({ from: 1, to: 10 })).toEqual({ from: 11, to: 20 });
    expect(nextWordRange({ from: 1, to: 50 })).toEqual({ from: 51, to: 100 });
    expect(nextWordRange({ from: 101, to: 101 })).toEqual({ from: 102, to: 102 });
  });

  it('最後は 330 で止め、最後まで来たら出さない', () => {
    expect(nextWordRange({ from: 301, to: 320 })).toEqual({ from: 321, to: 330 });
    expect(nextWordRange({ from: 321, to: 330 })).toBeNull();
  });

  it('範囲が全部・未指定・壊れているときは出さない', () => {
    expect(nextWordRange({ from: 1, to: 330 })).toBeNull();
    expect(nextWordRange({})).toBeNull();
    expect(nextWordRange({ from: 5 })).toBeNull();
    expect(nextWordRange({ from: 20, to: 10 })).toBeNull();
  });

  it('ボタンの文字', () => {
    expect(nextRangeLabel({ from: 11, to: 20 })).toBe('次の10語へ（11〜20）');
    expect(nextRangeLabel({ from: 51, to: 100 })).toBe('次の範囲へ（51〜100）');
  });
});
