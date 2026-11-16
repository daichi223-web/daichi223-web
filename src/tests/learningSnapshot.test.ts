import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB の代わり。表ごとの行と、問い合わせの回数を持つ
const db = vi.hoisted(() => ({
  rows: { word_stats: [] as Record<string, unknown>[], srs_state: [] as Record<string, unknown>[] },
  calls: [] as string[],
  fail: false,
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: 'word_stats' | 'srs_state') => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: async (from: number, to: number) => {
          db.calls.push(`${table}:${from}`);
          if (db.fail) return { data: null, error: new Error('down') };
          return { data: db.rows[table].slice(from, to + 1), error: null };
        },
      };
      return q;
    },
  },
}));
vi.mock('../lib/wordStats', () => ({ getUserId: async () => 'user-1' }));

import {
  loadLearningSnapshot,
  statsMapOf,
  boxesOf,
  dueAmongOf,
  weakWordsOf,
  todayReviewOf,
  lastActivityOf,
  warmupWordsOf,
  type LearningSnapshot,
} from '../lib/learningSnapshot';
import { bumpLearningVersion } from '../lib/learningVersion';

const now = new Date('2026-11-16T03:00:00.000Z'); // 日本時間 12:00
const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
const later = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();

const snap: LearningSnapshot = {
  stats: [
    { qid: '1-1', correct: 9, incorrect: 1, lastSeen: ago(1) }, // 誤答率 10%
    { qid: '2-1', correct: 3, incorrect: 2, lastSeen: ago(50) }, // 40% ＝ 苦手
    { qid: '3-1', correct: 0, incorrect: 4, lastSeen: ago(80) }, // 100% ＝ 苦手
    { qid: 'drill:x', correct: 0, incorrect: 5, lastSeen: ago(3) }, // 文法ドリル（単語ではない）
  ],
  srs: [
    { qid: '1-1', box: 5, nextReview: later(200), lastReview: ago(1) },
    { qid: '2-1', box: 1, nextReview: ago(60), lastReview: ago(50) }, // 箱1・期限到来
    { qid: '3-1', box: 2, nextReview: ago(90), lastReview: ago(80) }, // いちばん古い期限
    { qid: '4-1', box: 4, nextReview: ago(2), lastReview: ago(1) }, // 期限到来だが今日もう解いた
    { qid: '5-1', box: 4, nextReview: later(5), lastReview: ago(30) }, // まだ期限前
    { qid: '6-1', box: 3, nextReview: null, lastReview: null }, // 日付が無い行
    { qid: 'drill:x', box: 1, nextReview: ago(100), lastReview: ago(0.5) },
  ],
};
const words = ['1-1', '2-1', '3-1', '4-1', '5-1', '6-1', '7-1'];

describe('まとめ読みからの計算（今までの問い合わせと同じ決め方）', () => {
  it('成績と箱の形', () => {
    expect(statsMapOf(snap)['2-1']).toEqual({ correct: 3, incorrect: 2, lastSeen: ago(50) });
    expect(boxesOf(snap, ['1-1', '5-1', '7-1'])).toEqual({ '1-1': 5, '5-1': 4 }); // 未学習の語は入らない
    expect(Object.keys(boxesOf(snap))).toHaveLength(7);
  });

  it('苦手：箱1を先頭に、続けて誤答率40%以上。単語だけ・重ならない', () => {
    expect(weakWordsOf(snap, words)).toEqual(['2-1', '3-1']);
    expect(weakWordsOf(snap, ['3-1'])).toEqual(['3-1']);
    expect(weakWordsOf(snap, [])).toEqual([]);
  });

  it('期限が来た語：古い順。日付の無い行・期限前の語は入らない', () => {
    expect(dueAmongOf(snap, words, now)).toEqual(['3-1', '2-1', '4-1']);
  });

  it('今日の復習：期限の古い順・今日すでに解いた語は除く・上限まで・単語だけ', () => {
    expect(todayReviewOf(snap, words, now)).toEqual(['3-1', '2-1']); // 4-1 は今日解いたので除く
    expect(todayReviewOf(snap, words, now, 1)).toEqual(['3-1']);
    // 一度も復習していない語（last_review が無い）は、期限が来ていれば入る
    const s2: LearningSnapshot = { stats: [], srs: [{ qid: '7-1', box: 1, nextReview: ago(1), lastReview: null }] };
    expect(todayReviewOf(s2, words, now)).toEqual(['7-1']);
  });

  it('最後に解いた日時：文法ドリルも含めた全部の行のいちばん新しいもの', () => {
    expect(lastActivityOf(snap)?.toISOString()).toBe(ago(0.5));
    expect(lastActivityOf({ stats: [], srs: [] })).toBeNull();
    expect(lastActivityOf({ stats: [], srs: [{ qid: 'a', box: 1, nextReview: null, lastReview: null }] })).toBeNull();
  });

  it('おかえりの語：箱4以上の単語から n 語', () => {
    const got = warmupWordsOf(snap, words, 5, () => 0.3);
    expect([...got].sort()).toEqual(['1-1', '4-1', '5-1']);
    expect(warmupWordsOf(snap, words, 2, () => 0.3)).toHaveLength(2);
    expect(warmupWordsOf(snap, ['2-1'], 5)).toEqual([]);
  });
});

describe('loadLearningSnapshot（読み込みと覚え方）', () => {
  beforeEach(() => {
    db.rows.word_stats = [{ qid: '1-1', correct: 1, incorrect: 0, last_seen: ago(1) }];
    db.rows.srs_state = [{ qid: '1-1', box: 2, next_review: later(1), last_review: ago(1) }];
    db.calls.length = 0;
    db.fail = false;
    bumpLearningVersion(); // 前のテストで覚えた中身を捨てる
  });

  it('同時に来た呼び出しは1回の読み込み（表ごとに1回）にまとまり、次からは覚えた中身を返す', async () => {
    const [a, b, c] = await Promise.all([loadLearningSnapshot(), loadLearningSnapshot(), loadLearningSnapshot()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(db.calls.sort()).toEqual(['srs_state:0', 'word_stats:0']);
    expect(a.srs).toEqual([{ qid: '1-1', box: 2, nextReview: later(1), lastReview: ago(1) }]);
    await loadLearningSnapshot();
    expect(db.calls).toHaveLength(2); // 取り直していない
  });

  it('回答を記録したら（目印が進んだら）取り直す', async () => {
    await loadLearningSnapshot();
    db.rows.srs_state = [{ qid: '1-1', box: 3, next_review: later(3), last_review: ago(0) }];
    bumpLearningVersion();
    const s = await loadLearningSnapshot();
    expect(s.srs[0].box).toBe(3);
    expect(db.calls).toHaveLength(4);
  });

  it('1,000行を超える分は続きを取る', async () => {
    db.rows.srs_state = Array.from({ length: 1500 }, (_, i) => ({ qid: `q${i}`, box: 1, next_review: null, last_review: null }));
    const s = await loadLearningSnapshot();
    expect(s.srs).toHaveLength(1500);
    expect(db.calls.filter((c) => c.startsWith('srs_state')).sort()).toEqual(['srs_state:0', 'srs_state:1000']);
  });

  it('取れなければ投げ、失敗は覚えない（次の呼び出しで取り直す）', async () => {
    db.fail = true;
    await expect(loadLearningSnapshot()).rejects.toThrow();
    db.fail = false;
    const s = await loadLearningSnapshot();
    expect(s.stats).toHaveLength(1);
  });
});
