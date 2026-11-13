import { describe, it, expect } from 'vitest';
import { TEACHER_IDS } from '../lib/teachers';
import { PROMOTION_KEYS, TEACHER_PROMOTIONS, celebrationFrom, pickPromotion, promotionKeyFor, rankFullName } from '../lib/teacherPromotions';
import { STAGES } from '../lib/nobleData';

describe('昇進のお祝いの台詞（teacherPromotions）', () => {
  it('位の略記を読める形に直す', () => {
    expect(rankFullName('従五下')).toBe('従五位下');
    expect(rankFullName('正一')).toBe('正一位');
    expect(rankFullName('従三')).toBe('従三位');
    expect(rankFullName('八位')).toBe('八位');
    expect(rankFullName('無位')).toBe('無位');
  });

  it('祝う段：新しく上がった一番上の段。はじめての記録（第1階を含む）と何も無いときは祝わない', () => {
    expect(celebrationFrom([])).toBeNull();
    expect(celebrationFrom([{ n: 1, rank: '無位' }, { n: 2, rank: '八位' }])).toBeNull();
    expect(celebrationFrom([{ n: 8, rank: '従五下' }])).toEqual({ n: 8, rank: '従五下' });
    expect(celebrationFrom([{ n: 7, rank: '正六上' }, { n: 8, rank: '従五下' }, { n: 9, rank: '従五上' }])).toEqual({ n: 9, rank: '従五上' });
  });

  it('第 n 階 → 台詞の種類（節目は殿上人＝8・公卿＝16・極位＝21）', () => {
    expect(promotionKeyFor(2)).toBe('jige');
    expect(promotionKeyFor(7)).toBe('jige');
    expect(promotionKeyFor(8)).toBe('tenjoFirst');
    expect(promotionKeyFor(15)).toBe('tenjo');
    expect(promotionKeyFor(16)).toBe('kugyoFirst');
    expect(promotionKeyFor(20)).toBe('kugyo');
    expect(promotionKeyFor(21)).toBe('kyokui');
  });

  it('10人とも6種類に台詞があり、{位} を入れると { } が残らない', () => {
    expect(Object.keys(TEACHER_PROMOTIONS).sort()).toEqual([...TEACHER_IDS].sort());
    for (const id of TEACHER_IDS) {
      for (const k of PROMOTION_KEYS) {
        expect(TEACHER_PROMOTIONS[id]![k].length, `${id}.${k}`).toBeGreaterThanOrEqual(3);
      }
      for (const s of STAGES.slice(1)) {
        const line = pickPromotion({ teacher: id, n: s.n, rank: s.rank });
        expect(line, `${id} 第${s.n}階`).toBeTruthy();
        expect(line!, `${id} 第${s.n}階`).not.toMatch(/[{}]/);
      }
    }
  });
});
