import { describe, it, expect } from 'vitest';
import { daysUntil, quizRangeHeadline, type QuizRange } from '../lib/quizRange';

const now = new Date(2026, 8, 6); // 2026-09-06 ローカル
const range = (over: Partial<QuizRange> = {}): QuizRange => ({
  cohort: 'default',
  label: '金曜の小テスト',
  from: 101,
  to: 150,
  dueDate: '2026-09-11',
  note: null,
  ...over,
});

describe('daysUntil', () => {
  it('先の日付は正の日数', () => expect(daysUntil('2026-09-11', now)).toBe(5));
  it('当日は 0', () => expect(daysUntil('2026-09-06', now)).toBe(0));
  it('過ぎていれば負', () => expect(daysUntil('2026-09-04', now)).toBe(-2));
  it('日付なし・不正は null', () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil('9/11', now)).toBeNull();
  });
});

describe('quizRangeHeadline', () => {
  it('あとN日', () => expect(quizRangeHeadline(range(), now)).toBe('金曜の小テスト・あと5日'));
  it('明日・今日', () => {
    expect(quizRangeHeadline(range({ dueDate: '2026-09-07' }), now)).toBe('金曜の小テスト・明日');
    expect(quizRangeHeadline(range({ dueDate: '2026-09-06' }), now)).toBe('金曜の小テスト・今日');
  });
  it('日付が無ければ名前だけ', () => {
    expect(quizRangeHeadline(range({ dueDate: null }), now)).toBe('金曜の小テスト');
  });
  it('ラベルが空なら「小テスト」', () => {
    expect(quizRangeHeadline(range({ label: null, dueDate: null }), now)).toBe('小テスト');
  });
  it('過ぎた範囲は出さない', () => {
    expect(quizRangeHeadline(range({ dueDate: '2026-09-05' }), now)).toBeNull();
  });
});
