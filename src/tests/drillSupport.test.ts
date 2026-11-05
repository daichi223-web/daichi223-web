import { describe, expect, it } from 'vitest';
import {
  applyFollowUp, chooseSupport, fillFromUpperLevel, hasSupportCandidate, insertSupport, nextStepLabel, planFollowUp,
  SUPPORT_LIMIT, type DrillStep,
} from '../lib/kobun/drillSupport';
import type { GrammarDrill, GrammarDrillKind } from '../lib/kobun/types';

const drill = (id: string, kind: GrammarDrillKind, sort: number, topicId = 'jodoshi-mu'): GrammarDrill => ({
  id, kind, sort, topicId, prompt: '確認', choices: ['a', 'b'], answer: 'a', explanation: '解説',
});
const main = drill('main', 'imi', 200);
const connection = drill('connection', 'setsuzoku', 100);
const form = drill('form', 'katsuyo-fill', 0);
describe('手前の問題で確認する', () => {
  it('振り返りに応じて同単元の下位問題を選ぶ', () => {
    expect(chooseSupport(main, [form, connection], new Set(), 'connection')?.id).toBe('connection');
    expect(chooseSupport(main, [form, connection], new Set(), 'form')?.id).toBe('form');
  });
  it('別単元・同難度・出題済みは選ばない', () => {
    const pool = [drill('other', 'setsuzoku', 0, 'jodoshi-zu'), drill('same', 'setsuzoku', 200), connection];
    expect(chooseSupport(main, pool, new Set(['connection']))).toBeNull();
  });
  it('基礎段階に下位問題がなければ補助を捏造しない', () => {
    expect(chooseSupport(form, [connection], new Set())).toBeNull();
  });
  it('同じ段階なら履歴上の苦手を確認する', () => {
    const second = drill('second', 'setsuzoku', 100);
    expect(chooseSupport(main, [connection, second], new Set(), 'auto', {
      connection: { correct: 10, incorrect: 0 }, second: { correct: 0, incorrect: 2 },
    })?.id).toBe('second');
  });
  it('最初の本問をすべて解いてから、補助→再挑戦へ進む', () => {
    const last = drill('last', 'imi', 200);
    const queue: DrillStep[] = [{ drill: main, role: 'main' }, { drill: last, role: 'main' }];
    const result = insertSupport(queue, 0, connection);
    expect(result.map(s => s.drill.id)).toEqual(['main', 'last', 'connection', 'main']);
    expect(result.map(s => s.role)).toEqual(['main', 'main', 'support', 'retry']);
    expect(queue).toHaveLength(2);
  });
  it('補助でもつまずいた場合はさらに下位を確認して戻る', () => {
    const queue: DrillStep[] = [{ drill: connection, role: 'support' }, { drill: main, role: 'retry' }];
    expect(insertSupport(queue, 0, form).map(s => s.drill.id)).toEqual(['connection', 'form', 'connection', 'main']);
  });
  it('選択肢がない問題を選ばない', () => {
    expect(chooseSupport(main, [{ ...connection, choices: [] }], new Set())).toBeNull();
  });
});

// 2026-11-06 文法道場の見直し ④：手前の問題が無いときは、間違えた本問を最後に1回だけ「もう一度」
describe('間違えたあとに足すもの', () => {
  const q = (...steps: DrillStep[]) => steps;
  const mainStep = (d: GrammarDrill): DrillStep => ({ drill: d, role: 'main' });

  it('手前の問題があれば、今までどおり「手前→再挑戦」', () => {
    const queue = q(mainStep(main), mainStep(drill('last', 'imi', 200)));
    const f = planFollowUp(queue, 0, [main, connection, form]);
    expect(f).toEqual({ type: 'support', drill: connection });
    const next = applyFollowUp(queue, 0, f);
    expect(next.map(s => `${s.role}:${s.drill.id}`)).toEqual(['main:main', 'main:last', 'support:connection', 'retry:main']);
    expect(next[3].plain).toBeUndefined();
    expect(queue).toHaveLength(2);
  });
  it('手前の問題が無い本問（Lv1 など）は、最後に1回だけ「もう一度」を足す', () => {
    const second = drill('second', 'katsuyo-fill', 10);
    const queue = q(mainStep(form), mainStep(second));
    expect(hasSupportCandidate(form, [form, second], new Set(['form', 'second']))).toBe(false);
    const f = planFollowUp(queue, 0, [form, second]);
    expect(f).toEqual({ type: 'retry' });
    const next = applyFollowUp(queue, 0, f);
    expect(next.map(s => `${s.role}:${s.drill.id}`)).toEqual(['main:form', 'main:second', 'retry:form']);
    expect(next[2].plain).toBe(true);
    expect(queue).toHaveLength(2);
  });
  it('「もう一度」を間違えても、もう足さない（1回だけ）', () => {
    const queue = q(mainStep(form), { drill: form, role: 'retry', plain: true });
    expect(planFollowUp(queue, 1, [form])).toBeNull();
    expect(applyFollowUp(queue, 1, null)).toBe(queue);
  });
  it('迷った所の種類に合う手前が無いときも、本問は「もう一度」に回る', () => {
    const queue = q(mainStep(main));
    expect(hasSupportCandidate(main, [main, form], new Set(['main']))).toBe(true);
    expect(planFollowUp(queue, 0, [main, form], 'connection')).toEqual({ type: 'retry' });
    expect(planFollowUp(queue, 0, [main, form], 'form')).toEqual({ type: 'support', drill: form });
  });
  it('手前の問題を間違えて、さらに下が無いときは何も足さない（元の問題の再挑戦がもう並んでいる）', () => {
    const queue = q(mainStep(main), { drill: form, role: 'support' }, { drill: main, role: 'retry' });
    expect(planFollowUp(queue, 1, [main, form])).toBeNull();
  });
  it('足せる合計は今までと同じ（6問まで）。「もう一度」だけなら6問まで', () => {
    const mains = Array.from({ length: 8 }, (_, i) => drill(`m${i}`, 'katsuyo-fill', i));
    let queue: DrillStep[] = mains.map(mainStep);
    for (let i = 0; i < 8; i++) queue = applyFollowUp(queue, i, planFollowUp(queue, i, mains));
    expect(queue.filter(s => s.role !== 'main')).toHaveLength(SUPPORT_LIMIT);
    expect(queue.slice(8).map(s => s.drill.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
  });
  it('あと1問しか足せないときは、手前（2問ぶん）を諦めて「もう一度」。満杯なら何も足さない', () => {
    // 5問足した状態。手前の問題（connection）はあるが、2問ぶんの空きが無い
    const five: DrillStep[] = [mainStep(main), { drill: form, role: 'support' }, { drill: main, role: 'retry' },
      { drill: drill('s2', 'setsuzoku', 0), role: 'support' }, { drill: main, role: 'retry' }, { drill: main, role: 'retry', plain: true }];
    expect(planFollowUp(five, 0, [main, connection])).toEqual({ type: 'retry' });
    const full: DrillStep[] = [...five, { drill: main, role: 'retry', plain: true }];
    expect(planFollowUp(full, 0, [main, connection])).toBeNull();
  });
});

// 2026-11-06 見直し ⑩：最後の本問のあとは、前の問題の手前が先に並んでいることがある
describe('「つぎへ」のボタンの文字', () => {
  const m: DrillStep = { drill: main, role: 'main' };
  const s: DrillStep = { drill: connection, role: 'support' };
  const r: DrillStep = { drill: main, role: 'retry' };
  it('次の問題の役から決める', () => {
    expect(nextStepLabel(m, m)).toBe('つぎへ');
    expect(nextStepLabel(m, s)).toBe('確認の問題へ →');
    expect(nextStepLabel(m, { ...r, plain: true })).toBe('もう一度の問題へ →');
    expect(nextStepLabel(s, s)).toBe('一段手前を確認する →');
    expect(nextStepLabel(s, r)).toBe('つぎへ');
    expect(nextStepLabel(r, s)).toBe('つぎへ');
    expect(nextStepLabel(r, undefined)).toBe('けっか');
    expect(nextStepLabel(m, undefined)).toBe('けっか');
  });
});

// 2026-11-06 見直し ④：8問に足りないレベルは、1つ上のレベルの易しい順から足す
describe('8問に足りないときの補い', () => {
  const lv1 = [drill('a1', 'katsuyo-type', 1), drill('a2', 'katsuyo-type', 2)];
  const lv2 = [drill('b3', 'katsuyo-fill', 130), drill('b1', 'katsuyo-fill', 101), drill('b2', 'katsuyo-fill', 110)];
  const lv3 = [drill('c1', 'imi', 201)];
  const bank = [...lv1, ...lv2, ...lv3];
  const ids = (ds: GrammarDrill[]) => ds.map(d => d.id);

  it('足りない分を、1つ上のレベルの sort の小さい順に後ろへ足す', () => {
    expect(ids(fillFromUpperLevel([lv1[1], lv1[0]], bank, 1, 4))).toEqual(['a2', 'a1', 'b1', 'b2']);
  });
  it('上のレベルを足しても足りなければ、あるだけ（2つ上からは取らない）', () => {
    expect(ids(fillFromUpperLevel(lv1, bank, 1, 8))).toEqual(['a1', 'a2', 'b1', 'b2', 'b3']);
  });
  it('もう足りているときは何も足さない（同じ配列を返す）', () => {
    expect(fillFromUpperLevel(lv1, bank, 1, 2)).toBe(lv1);
  });
  it('上のレベルが無ければそのまま', () => {
    expect(fillFromUpperLevel(lv3, bank, 3, 8)).toBe(lv3);
  });
  it('間のレベルが無い単元は、その単元にあるすぐ上のレベルから足す', () => {
    expect(ids(fillFromUpperLevel(lv1, [...lv1, ...lv3], 1, 8))).toEqual(['a1', 'a2', 'c1']);
  });
  it('選択肢が無い問題・もう入っている問題は足さない。入力は変えない', () => {
    const picked = [lv1[0]];
    const out = fillFromUpperLevel(picked, [...lv1, { ...lv2[1], choices: [] }, lv2[2]], 1, 8);
    expect(ids(out)).toEqual(['a1', 'b2']);
    expect(picked).toHaveLength(1);
  });
});
