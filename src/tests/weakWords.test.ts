import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  stats: [] as { qid: string; correct: number; incorrect: number }[],
  srs: [] as { qid: string; box: number }[],
  error: null as null | { message: string },
}));
vi.mock('../lib/anonAuth', () => ({ currentAuthUid: async () => 'test-user' }));
vi.mock('../lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    let allowed: string[] | undefined;
    let box: number | undefined;
    const query = {
      select: () => query,
      eq: (key: string, value: string | number) => { if (key === 'box') box = Number(value); return query; },
      in: (_key: string, ids: string[]) => { allowed = ids; return query; },
      then: (resolve: (result: unknown) => unknown) => resolve({
        data: (table === 'word_stats' ? db.stats : db.srs.filter(r => box == null || r.box === box))
          .filter(r => !allowed || allowed.includes(r.qid)),
        error: db.error,
      }),
    };
    return query;
  },
} }));
import { getWeakWords } from '../lib/wordStats';

describe('DBの履歴と復習状態から苦手を抽出', () => {
  beforeEach(() => { db.stats = []; db.srs = []; db.error = null; });
  it('初回に間違えた意味を拾う', async () => {
    db.stats = [{ qid: '1-1', correct: 0, incorrect: 1 }];
    expect(await getWeakWords()).toEqual(['1-1']);
  });
  it('以前得意だった意味も箱1へ戻ったら拾う', async () => {
    db.stats = [{ qid: '1-1', correct: 20, incorrect: 1 }];
    db.srs = [{ qid: '1-1', box: 1 }];
    expect(await getWeakWords()).toEqual(['1-1']);
  });
  it('単語の対象qidを指定すると文法が混ざらず、重複も除く', async () => {
    db.stats = [{ qid: '1-1', correct: 0, incorrect: 1 }, { qid: 'grammar', correct: 0, incorrect: 1 }];
    db.srs = [{ qid: '1-1', box: 1 }, { qid: 'grammar', box: 1 }];
    expect(await getWeakWords(undefined, undefined, ['1-1'])).toEqual(['1-1']);
  });
  it('取得エラーを「苦手なし」と誤表示させない', async () => {
    db.error = { message: 'offline' };
    await expect(getWeakWords()).rejects.toEqual(db.error);
  });
});
