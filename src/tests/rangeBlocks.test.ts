import { describe, it, expect } from 'vitest';
import { blocksFor, initialWidth } from '../lib/quiz/rangeBlocks';

describe('rangeBlocks（範囲選びの区切り）', () => {
  it('幅で区切り、最後は 330 で止める', () => {
    const b10 = blocksFor(10);
    expect(b10).toHaveLength(33);
    expect(b10[0]).toEqual({ from: 1, to: 10 });
    expect(b10[32]).toEqual({ from: 321, to: 330 });
    const b50 = blocksFor(50);
    expect(b50).toHaveLength(7);
    expect(b50[6]).toEqual({ from: 301, to: 330 });
    expect(blocksFor(20)[16]).toEqual({ from: 321, to: 330 });
  });

  it('開いたときの幅は、今の範囲の幅（10・20・50）か、全部か、10', () => {
    expect(initialWidth({ from: 51, to: 100 })).toBe(50);
    expect(initialWidth({ from: 11, to: 20 })).toBe(10);
    expect(initialWidth({ from: 1, to: 330 })).toBe('all');
    expect(initialWidth({ from: 3, to: 9 })).toBe(10);
    expect(initialWidth({})).toBe(10);
  });

  it('おかしな幅は空', () => {
    expect(blocksFor(0)).toEqual([]);
  });
});
