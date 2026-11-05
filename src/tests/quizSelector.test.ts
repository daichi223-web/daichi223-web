import { describe, it, expect } from 'vitest';
import { classify, compositionLine, pickQuestions, type ItemStat } from '../lib/quizSelector';

type Item = { qid: string; group: number };
const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ qid: `${i + 1}-1`, group: i + 1 }));
const key = (t: Item) => t.qid;
const order = (t: Item) => t.group;
// 決定的な乱数（テスト用）
const seeded = (seed = 1) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const now = new Date('2026-09-05T10:00:00Z');

describe('classify', () => {
  it('記録なし → new', () => expect(classify(undefined)).toBe('new'));
  it('2回中1回以上誤答 → weak', () => expect(classify({ correct: 1, incorrect: 1 })).toBe('weak'));
  it('初回の誤答から復習対象にする', () => expect(classify({ correct: 0, incorrect: 1 })).toBe('weak'));
  it('累計正答率が高くても箱1なら苦手に戻す', () => expect(classify({ correct: 20, incorrect: 1 }, 1)).toBe('weak'));
  it('短時間に正解を重ねても箱2なら未定着のまま', () => expect(classify({ correct: 20, incorrect: 0 }, 2)).toBe('mid'));
  it('3回以上で誤答率20%以下 → strong', () => expect(classify({ correct: 4, incorrect: 1 })).toBe('strong'));
  it('SRS箱4以上 → strong（誤答が少なければ）', () => expect(classify({ correct: 1, incorrect: 0 }, 4)).toBe('strong'));
  // 2026-11-06 箱の記録があるときは箱だけで決める（以前は誤答率を先に見て、箱5でも苦手に入り続けた）
  it('箱4以上なら、昔の誤答が多くても得意', () => {
    expect(classify({ correct: 1, incorrect: 2 }, 5)).toBe('strong');
    expect(classify({ correct: 2, incorrect: 8 }, 4)).toBe('strong');
  });
  it('箱1なら、正答が多くても苦手', () => expect(classify({ correct: 9, incorrect: 0 }, 1)).toBe('weak'));
  it('箱2〜3なら、誤答率が高くても途中', () => {
    expect(classify({ correct: 1, incorrect: 3 }, 2)).toBe('mid');
    expect(classify({ correct: 0, incorrect: 5 }, 3)).toBe('mid');
  });
  it('箱の記録があれば、正誤の記録が無くても箱で決める', () => {
    expect(classify(undefined, 1)).toBe('weak');
    expect(classify(undefined, 3)).toBe('mid');
    expect(classify({ correct: 0, incorrect: 0 }, 4)).toBe('strong');
  });
  it('箱の記録が無いときは、今までどおり正誤の累計で決める', () => {
    expect(classify({ correct: 3, incorrect: 2 })).toBe('weak');   // 誤答率40%
    expect(classify({ correct: 2, incorrect: 1 })).toBe('mid');    // 33%
    expect(classify({ correct: 2, incorrect: 0 })).toBe('mid');    // 2回ではまだ得意にしない
    expect(classify({ correct: 0, incorrect: 0 })).toBe('new');
  });
});

describe('compositionLine（前回の内訳）', () => {
  it('期限が来た語が無ければ、今までと同じ文', () => {
    expect(compositionLine({ due: 0, weak: 4, new: 3, mid: 3, strong: 0 })).toBe('前回の内訳: 苦手 4・未着手 3・途中 3');
    expect(compositionLine({ due: 0, weak: 0, new: 0, mid: 2, strong: 3 })).toBe('前回の内訳: 苦手 0・未着手 0・途中 2・得意 3');
  });
  it('期限が来た語があるときだけ「復習 N」を足す', () => {
    expect(compositionLine({ due: 4, weak: 0, new: 3, mid: 3, strong: 0 })).toBe('前回の内訳: 復習 4・苦手 0・未着手 3・途中 3');
  });
});

describe('pickQuestions', () => {
  it('苦手を優先し、未着手を番号順に進め、得意は出さない', () => {
    const all = items(30);
    const stats: Record<string, ItemStat> = {};
    // 1-5: 苦手（誤答多い）
    for (let i = 1; i <= 5; i++) stats[`${i}-1`] = { correct: 1, incorrect: 3, lastSeen: '2026-09-01T00:00:00Z' };
    // 6-10: 得意
    for (let i = 6; i <= 10; i++) stats[`${i}-1`] = { correct: 8, incorrect: 0, lastSeen: '2026-09-01T00:00:00Z' };
    // 11-15: 途中
    for (let i = 11; i <= 15; i++) stats[`${i}-1`] = { correct: 2, incorrect: 1, lastSeen: '2026-09-01T00:00:00Z' };
    // 16-30: 未着手
    const r = pickQuestions({ items: all, key, order, stats, n: 10, now, rng: seeded() });
    expect(r.picked).toHaveLength(10);
    expect(r.composition.weak).toBe(4);   // ceil(10*0.4)
    expect(r.composition.new).toBe(3);    // ceil(10*0.3)
    expect(r.composition.strong).toBe(0); // 他で足りるので得意は出ない
    const newOnes = r.picked.filter((t) => !stats[t.qid]).map((t) => t.group).sort((a, b) => a - b);
    expect(newOnes).toEqual([16, 17, 18]); // 番号順に進める
    const weakOnes = r.picked.filter((t) => stats[t.qid]?.incorrect === 3);
    expect(weakOnes.length).toBe(4);
    // 重複なし
    expect(new Set(r.picked.map(key)).size).toBe(10);
  });

  it('全部得意でも n 問埋まる（得意は最後の砦）', () => {
    const all = items(8);
    const stats: Record<string, ItemStat> = {};
    for (const t of all) stats[t.qid] = { correct: 9, incorrect: 0 };
    const r = pickQuestions({ items: all, key, order, stats, n: 5, now, rng: seeded() });
    expect(r.picked).toHaveLength(5);
    expect(r.composition.strong).toBe(5);
  });

  it('記録がまったく無ければ番号順の先頭から', () => {
    const r = pickQuestions({ items: items(20), key, order, stats: {}, n: 4, now, rng: seeded() });
    expect(r.picked.map(order).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('候補が n より少なければ全部返す', () => {
    const r = pickQuestions({ items: items(3), key, order, stats: {}, n: 10, now, rng: seeded() });
    expect(r.picked).toHaveLength(3);
  });

  it('最初の1問は得意ではない', () => {
    const all = items(6);
    const stats: Record<string, ItemStat> = {};
    for (let i = 1; i <= 5; i++) stats[`${i}-1`] = { correct: 9, incorrect: 0 };
    // 6 だけ未着手
    for (let s = 1; s < 20; s++) {
      const r = pickQuestions({ items: all, key, order, stats, n: 6, now, rng: seeded(s) });
      expect(r.picked[0].qid).toBe('6-1');
    }
  });
});

// 2026-11-06 出す語の決め方を箱と期限にそろえる（docs/state-transition-review.md の案 D）
describe('pickQuestions：期限が来た語（due）', () => {
  // 1-5: 苦手（箱なし・誤答多い）／6-10: 得意／11-15: 途中／16-30: 未着手
  const baseStats = (): Record<string, ItemStat> => {
    const stats: Record<string, ItemStat> = {};
    for (let i = 1; i <= 5; i++) stats[`${i}-1`] = { correct: 1, incorrect: 3, lastSeen: '2026-09-01T00:00:00Z' };
    for (let i = 6; i <= 10; i++) stats[`${i}-1`] = { correct: 8, incorrect: 0, lastSeen: '2026-09-01T00:00:00Z' };
    for (let i = 11; i <= 15; i++) stats[`${i}-1`] = { correct: 2, incorrect: 1, lastSeen: '2026-09-01T00:00:00Z' };
    return stats;
  };
  const qids = (r: { picked: Item[] }) => r.picked.map(key);

  it('due を渡さない・空のときは、直す前とまったく同じ語が同じ順で出る', () => {
    // 直す前のコードで写し取った結果（同じ記録・同じ乱数）。文法道場はこの形（due も箱も渡さない）で使っている
    const stats = baseStats();
    stats['3-1'].lastSeen = '2026-09-05T09:30:00Z';
    const before: Array<[number, number, string]> = [
      [10, 1, '3-1,4-1,2-1,11-1,5-1,15-1,17-1,16-1,18-1,14-1'],
      [10, 7, '1-1,11-1,18-1,4-1,13-1,16-1,5-1,2-1,17-1,14-1'],
      [5, 3, '17-1,15-1,2-1,16-1,1-1'],
      // 1問のときに2語返るのは直す前からの動き（40%と30%の切り上げが両方1になる）。呼び出し側が問題数で切る
      [1, 2, '16-1,1-1'],
      [30, 4, '23-1,10-1,29-1,25-1,18-1,8-1,1-1,9-1,28-1,16-1,6-1,22-1,4-1,14-1,15-1,3-1,5-1,17-1,20-1,12-1,13-1,2-1,24-1,30-1,19-1,21-1,26-1,7-1,27-1,11-1'],
    ];
    for (const [n, seed, expected] of before) {
      const none = pickQuestions({ items: items(30), key, order, stats, n, now, rng: seeded(seed) });
      expect(qids(none).join(',')).toBe(expected);
      expect(none.composition.due).toBe(0);
      const empty = pickQuestions({ items: items(30), key, order, stats, due: [], n, now, rng: seeded(seed) });
      expect(qids(empty).join(',')).toBe(expected);
      // 範囲の外の語だけが期限のときも、期限を見ない配分のまま
      const outside = pickQuestions({ items: items(30), key, order, stats, due: ['999-1'], n, now, rng: seeded(seed) });
      expect(qids(outside).join(',')).toBe(expected);
    }
    const r = pickQuestions({ items: items(30), key, order, stats, n: 10, now, rng: seeded(1) });
    expect(r.composition).toEqual({ due: 0, weak: 4, new: 3, mid: 3, strong: 0 });
  });

  it('期限が来た語を古い順に最大40%入れ、苦手30%・新しい語30%（番号順）と続ける', () => {
    const stats = baseStats();
    // 期限が来た語（古い順）。得意・途中の語も、期限が来ていれば先に出す
    const due = ['8-1', '12-1', '6-1', '13-1', '7-1', '14-1'];
    const r = pickQuestions({ items: items(30), key, order, stats, due, n: 10, now, rng: seeded() });
    expect(r.picked).toHaveLength(10);
    expect(new Set(qids(r)).size).toBe(10);
    expect(r.composition).toEqual({ due: 4, weak: 3, new: 3, mid: 0, strong: 0 });
    // 古い順の先頭4語が入り、残り2語は入らない
    for (const q of ['8-1', '12-1', '6-1', '13-1']) expect(qids(r)).toContain(q);
    for (const q of ['7-1', '14-1']) expect(qids(r)).not.toContain(q);
    const newOnes = r.picked.filter((t) => !stats[t.qid]).map((t) => t.group).sort((a, b) => a - b);
    expect(newOnes).toEqual([16, 17, 18]);
  });

  it('期限が来た語が少なければ、残りを途中の語で埋める', () => {
    const stats = baseStats();
    const r = pickQuestions({ items: items(30), key, order, stats, due: ['9-1'], n: 10, now, rng: seeded() });
    expect(r.composition).toEqual({ due: 1, weak: 3, new: 3, mid: 3, strong: 0 });
    expect(qids(r)).toContain('9-1');
  });

  it('ほかが足りないときは、期限が来た語の残りを先に足す（得意は最後）', () => {
    // 8語：1〜6 が期限（箱3）、7・8 が得意（箱5・期限前）。苦手・新しい語・途中は無い
    const all = items(8);
    const stats: Record<string, ItemStat> = {};
    const boxes: Record<string, number> = {};
    for (const t of all) { stats[t.qid] = { correct: 5, incorrect: 0 }; boxes[t.qid] = t.group <= 6 ? 3 : 5; }
    const due = ['3-1', '1-1', '2-1', '6-1', '5-1', '4-1'];
    const r = pickQuestions({ items: all, key, order, stats, boxes, due, n: 7, now, rng: seeded() });
    expect(r.picked).toHaveLength(7);
    expect(r.composition).toEqual({ due: 6, weak: 0, new: 0, mid: 0, strong: 1 });
  });

  it('直近1時間に解いた語は、期限が来た語の中で後ろへ回す', () => {
    const all = items(10);
    const stats: Record<string, ItemStat> = {};
    for (const t of all) stats[t.qid] = { correct: 1, incorrect: 1, lastSeen: '2026-09-01T00:00:00Z' };
    // いちばん古い 1-1 は、ついさっき間違えた語（箱1は間違えた時刻が期限になる）
    stats['1-1'].lastSeen = '2026-09-05T09:50:00Z';
    const boxes: Record<string, number> = {};
    for (const t of all) boxes[t.qid] = 2;
    const due = ['1-1', '2-1', '3-1', '4-1', '5-1'];
    const r = pickQuestions({ items: all, key, order, stats, boxes, due, n: 5, now, rng: seeded() });
    expect(r.composition.due).toBe(2); // ceil(5*0.4)
    expect(qids(r)).toContain('2-1');
    expect(qids(r)).toContain('3-1');
    expect(qids(r)).not.toContain('1-1');
  });

  it('問題数が少なくても、枠の合計が問題数を超えない', () => {
    const stats = baseStats();
    const due = ['8-1', '12-1', '6-1'];
    for (const n of [1, 2, 3, 5]) {
      const r = pickQuestions({ items: items(30), key, order, stats, due, n, now, rng: seeded(n) });
      expect(r.picked).toHaveLength(n);
      const c = r.composition;
      expect(c.due + c.weak + c.new + c.mid + c.strong).toBe(n);
      expect(c.due).toBe(Math.min(3, Math.ceil(n * 0.4)));
    }
  });

  it('1問目は 期限が来た語・苦手・新しい語 のどれか', () => {
    // 6語：1-1 だけ期限（箱4＝期限が無ければ得意）、ほかは得意
    const all = items(6);
    const stats: Record<string, ItemStat> = {};
    const boxes: Record<string, number> = {};
    for (const t of all) { stats[t.qid] = { correct: 9, incorrect: 0 }; boxes[t.qid] = 4; }
    for (let s = 1; s < 20; s++) {
      const r = pickQuestions({ items: all, key, order, stats, boxes, due: ['1-1'], n: 6, now, rng: seeded(s) });
      expect(r.picked[0].qid).toBe('1-1');
    }
  });
});
