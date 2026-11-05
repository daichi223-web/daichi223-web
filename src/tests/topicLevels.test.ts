import { describe, expect, it } from 'vitest';
import { initialLevel, levelKey, MASTERY_PCT } from '../lib/kobun/topicLevels';

const p = (pct: number) => ({ masteryPct: pct });

describe('単元ページ：到達度のキーと、開いたときのレベル', () => {
  it('キーは Lv1 が単元ID、Lv2 以降が 単元ID@レベル（今までの記録と同じ形）', () => {
    expect(levelKey('jodoshi-mu', 1)).toBe('jodoshi-mu');
    expect(levelKey('jodoshi-mu', 3)).toBe('jodoshi-mu@3');
  });
  it('まだ ✅（85%以上）が付いていない、いちばん下のレベルを選ぶ', () => {
    expect(MASTERY_PCT).toBe(85);
    expect(initialLevel([1, 2, 3], {}, 't')).toBe(1);
    expect(initialLevel([1, 2, 3], { t: p(85) }, 't')).toBe(2);
    expect(initialLevel([1, 2, 3], { t: p(100), 't@2': p(84) }, 't')).toBe(2);
    expect(initialLevel([1, 2, 3], { t: p(100), 't@2': p(90) }, 't')).toBe(3);
  });
  it('下を飛ばして上だけ ✅ のときは、✅ でない下のレベルに戻る', () => {
    expect(initialLevel([1, 2, 3], { 't@2': p(100) }, 't')).toBe(1);
  });
  it('全部 ✅ ならいちばん上', () => {
    expect(initialLevel([1, 2, 3], { t: p(85), 't@2': p(85), 't@3': p(100) }, 't')).toBe(3);
  });
  it('Lv1 が無い単元は、あるレベルの中で決める。ドリルが無い単元は 1', () => {
    expect(initialLevel([2, 4], {}, 't')).toBe(2);
    expect(initialLevel([2, 4], { 't@2': p(90) }, 't')).toBe(4);
    expect(initialLevel([], {}, 't')).toBe(1);
  });
  it('ほかの単元の到達度は見ない', () => {
    expect(initialLevel([1, 2], { other: p(100), 'other@2': p(100) }, 't')).toBe(1);
  });
});
