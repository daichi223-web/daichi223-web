import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  uid: 'test-user' as string | null,
  inserted: [] as Record<string, unknown>[][],
  error: null as null | { message: string },
  throws: false,
}));
vi.mock('../lib/anonAuth', () => ({ currentAuthUid: async () => db.uid }));
vi.mock('../lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: db.uid ? { access_token: 'tok', user: { id: db.uid } } : null } }) },
  from: (table: string) => ({
    insert: async (rows: Record<string, unknown>[]) => {
      if (db.throws) throw new Error('network');
      if (table === 'learning_events') db.inserted.push(rows);
      return { error: db.error };
    },
  }),
} }));

const load = async () => {
  vi.resetModules();
  return import('../lib/learningEvents');
};
const allRows = () => db.inserted.flat();

describe('学習の出来事の記録', () => {
  beforeEach(() => {
    db.uid = 'test-user'; db.inserted = []; db.error = null; db.throws = false;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T10:00:00Z'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('回答は本人の ID・選んだ選択肢・出題形式・経路つきで1行になる', async () => {
    const { logEvent, flushEvents } = await load();
    logEvent({ area: 'vocab', action: 'answer', targetType: 'word', targetId: '78-4',
      correct: false, chosen: '78-1', format: 'word-meaning', route: 'today', ctx: { choices: ['78-1', '78-4'] } });
    await flushEvents();
    expect(allRows()).toHaveLength(1);
    expect(allRows()[0]).toMatchObject({
      user_id: 'test-user', area: 'vocab', action: 'answer', target_type: 'word', target_id: '78-4',
      correct: false, chosen: '78-1', format: 'word-meaning', route: 'today',
      at: '2026-10-04T10:00:00.000Z', ctx: { choices: ['78-1', '78-4'] },
    });
    expect(allRows()[0].session_id).toBeTruthy();
  });

  it('問いを出してからの応答時間が回答に付く', async () => {
    const { logEvent, flushEvents, markQuestionShown } = await load();
    markQuestionShown();
    vi.advanceTimersByTime(3200);
    logEvent({ area: 'grammar', action: 'answer', targetType: 'drill', targetId: 'jodoshi-mu-01', correct: true, chosen: '推量' });
    await flushEvents();
    expect(allRows()[0].ctx).toEqual({ ms: 3200 });
  });

  it('10分を超えた応答時間は付けない（席を外した分を混ぜない）', async () => {
    const { logEvent, flushEvents, markQuestionShown } = await load();
    markQuestionShown();
    vi.setSystemTime(new Date('2026-10-04T10:11:00Z'));
    logEvent({ area: 'vocab', action: 'answer', targetType: 'word', targetId: '1-1', correct: true });
    await flushEvents();
    expect(allRows()[0].ctx).toBeNull();
  });

  it('閲覧には直前に開いていたものが付き、領域をまたぐ流れをたどれる', async () => {
    const { logEvent, flushEvents } = await load();
    logEvent({ area: 'text', action: 'view', targetType: 'text', targetId: 'azuma-kudari' });
    logEvent({ area: 'vocab', action: 'view', targetType: 'lemma', targetId: 'あはれなり' });
    await flushEvents();
    expect(allRows()[0].ctx).toBeNull();
    expect(allRows()[1].ctx).toEqual({ from: 'text:azuma-kudari' });
  });

  it('同じ閲覧が1秒以内に続いたら1件にまとめるが、回答はまとめない', async () => {
    const { logEvent, flushEvents } = await load();
    const view = { area: 'text', action: 'view', targetType: 'text', targetId: 'a' } as const;
    logEvent(view); logEvent(view);
    vi.advanceTimersByTime(1500);
    logEvent(view);
    const ans = { area: 'vocab', action: 'answer', targetType: 'word', targetId: '1-1', correct: true } as const;
    logEvent(ans); logEvent(ans);
    await flushEvents();
    expect(allRows().filter(r => r.action === 'view')).toHaveLength(2);
    expect(allRows().filter(r => r.action === 'answer')).toHaveLength(2);
  });

  it('10件たまるか5秒たつと自動で送る', async () => {
    const { logEvent } = await load();
    for (let i = 0; i < 10; i++) logEvent({ area: 'vocab', action: 'answer', targetType: 'word', targetId: `${i}-1`, correct: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(allRows()).toHaveLength(10);
    logEvent({ area: 'vocab', action: 'answer', targetType: 'word', targetId: '99-1', correct: true });
    await vi.advanceTimersByTimeAsync(4999);
    expect(allRows()).toHaveLength(10);
    await vi.advanceTimersByTimeAsync(1);
    expect(allRows()).toHaveLength(11);
  });

  it('セッションが無いときは送らず、通信が落ちても例外を外へ出さない', async () => {
    const { logEvent, flushEvents } = await load();
    db.uid = null;
    logEvent({ area: 'vocab', action: 'answer', targetType: 'word', targetId: '1-1', correct: true });
    await flushEvents();
    expect(allRows()).toHaveLength(0);
    db.uid = 'test-user'; db.throws = true;
    logEvent({ area: 'vocab', action: 'answer', targetType: 'word', targetId: '1-2', correct: true });
    await expect(flushEvents()).resolves.toBeUndefined();
  });
});
