import { describe, it, expect } from 'vitest';
import { addAsk, buildCardMenu, isMenuEmpty, type CardAsk, type CardSenseInfo } from '../lib/kobun/vocabCardChat';

// ねんず：意味2つ（祈る＝理由あり・用例2、がまんする＝理由あり・用例2）、現代語の罠あり
const senses: CardSenseInfo[] = [
  { qid: '3-1', label: '祈る', hasReason: true, moreExamples: 2 },
  { qid: '3-2', label: 'がまんする', hasReason: true, moreExamples: 0 },
];

describe('buildCardMenu（単語カードで聞けること）', () => {
  it('最初は、意味が全部と現代語の罠を選べる。理由・用例はまだ出ない', () => {
    const m = buildCardMenu(senses, true, []);
    expect(m.senses.map((s) => s.label)).toEqual(['祈る', 'がまんする']);
    expect(m.followUps).toEqual([]);
    expect(m.trap).toBe(true);
  });

  it('意味はどれからでも選べる。選んだ意味は消え、その意味の理由・用例が選べるようになる', () => {
    const asked = addAsk([], { kind: 'sense', qid: '3-2' });
    const m = buildCardMenu(senses, true, asked);
    expect(m.senses.map((s) => s.label)).toEqual(['祈る']);
    // がまんする は用例が無いので、理由だけ
    expect(m.followUps).toEqual([{ qid: '3-2', label: 'がまんする', reason: true, examples: 0 }]);
  });

  it('理由・用例は選ぶと消える。両方聞いた意味は followUps から外れる', () => {
    let asked: CardAsk[] = [];
    asked = addAsk(asked, { kind: 'sense', qid: '3-1' });
    asked = addAsk(asked, { kind: 'reason', qid: '3-1' });
    expect(buildCardMenu(senses, true, asked).followUps).toEqual([{ qid: '3-1', label: '祈る', reason: false, examples: 2 }]);
    asked = addAsk(asked, { kind: 'examples', qid: '3-1' });
    expect(buildCardMenu(senses, true, asked).followUps).toEqual([]);
  });

  it('現代語の罠は、意味を見る前でも選べる。罠が無い語には出ない', () => {
    const asked = addAsk([], { kind: 'trap' });
    expect(buildCardMenu(senses, true, asked).trap).toBe(false);
    expect(buildCardMenu(senses, false, []).trap).toBe(false);
  });

  it('全部選ぶと、選択肢は空になる', () => {
    let asked: CardAsk[] = [];
    for (const a of [
      { kind: 'sense', qid: '3-1' }, { kind: 'sense', qid: '3-2' },
      { kind: 'reason', qid: '3-1' }, { kind: 'examples', qid: '3-1' }, { kind: 'reason', qid: '3-2' },
      { kind: 'trap' },
    ] as CardAsk[]) asked = addAsk(asked, a);
    expect(asked).toHaveLength(6);
    expect(isMenuEmpty(buildCardMenu(senses, true, asked))).toBe(true);
  });
});

describe('addAsk', () => {
  it('同じものは二度足さない（会話に同じ吹き出しが重ならない）', () => {
    const a = addAsk([], { kind: 'sense', qid: '3-1' });
    expect(addAsk(a, { kind: 'sense', qid: '3-1' })).toBe(a);
  });

  it('意味を見ていないのに、理由・用例は足さない', () => {
    expect(addAsk([], { kind: 'reason', qid: '3-1' })).toEqual([]);
    expect(addAsk([], { kind: 'examples', qid: '3-1' })).toEqual([]);
  });

  it('選んだ順に並ぶ', () => {
    let asked: CardAsk[] = [];
    asked = addAsk(asked, { kind: 'trap' });
    asked = addAsk(asked, { kind: 'sense', qid: '3-2' });
    asked = addAsk(asked, { kind: 'sense', qid: '3-1' });
    expect(asked.map((a) => (a.kind === 'trap' ? 'trap' : a.qid))).toEqual(['trap', '3-2', '3-1']);
  });
});
