import { describe, expect, it } from 'vitest';
import { chooseSupport, insertSupport, type DrillStep } from '../lib/kobun/drillSupport';
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
