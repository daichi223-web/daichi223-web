import { describe, expect, it } from 'vitest';
import { drillAnswerLabel, drillFeedbackWord, drillThread, isDrillAnswerCorrect, DRILL_NO_ANSWER } from '../lib/kobun/drillThread';
import { TEACHER_IDS } from '../lib/teachers';
import type { GrammarDrill } from '../lib/kobun/types';

const drill: GrammarDrill = {
  id: 'jodoshi-mu-01', topicId: 'jodoshi-mu', kind: 'imi', sort: 210,
  context: '《我》行か【む】。', prompt: '【 】の意味は？',
  choices: ['推量', '意志', '勧誘', '婉曲'], answer: '意志',
  explanation: '主語が一人称なので意志。',
};
const neutral = { teacher: 'sei' as const, voice: false };

// 文法ドリルの答え合わせ（ChatFeedback に渡す吹き出し。2026-11-06 文法道場の見直し ⑤）
describe('文法ドリルの答え合わせの吹き出し', () => {
  it('正解：自分の答え → 「正解。」→ 解説の3つ', () => {
    const b = drillThread(drill, '意志', neutral);
    expect(b).toEqual([
      { side: 'me', kind: 'answer', text: '意志' },
      { side: 'teacher', kind: 'verdict', text: '正解。', verdict: 'ok' },
      { side: 'teacher', kind: 'text', text: '主語が一人称なので意志。' },
    ]);
  });
  it('不正解：判定は「正しくは「〜」。」で、正解を言う', () => {
    const b = drillThread(drill, '推量', neutral);
    expect(b[0]).toEqual({ side: 'me', kind: 'answer', text: '推量' });
    expect(b[1]).toEqual({ side: 'teacher', kind: 'verdict', text: '正しくは「意志」。', verdict: 'ng' });
    expect(b[2]).toEqual({ side: 'teacher', kind: 'text', text: '主語が一人称なので意志。' });
    expect(b).toHaveLength(3);
  });
  it('解説が空の問題は、解説の吹き出しを出さない', () => {
    expect(drillThread({ ...drill, explanation: '  ' }, '意志', neutral)).toHaveLength(2);
  });
  it('答えていないときは（無回答）で不正解', () => {
    const b = drillThread(drill, null, neutral);
    expect(b[0]).toEqual({ side: 'me', kind: 'answer', text: DRILL_NO_ANSWER });
    expect(b[1]).toMatchObject({ verdict: 'ng' });
  });
  it('正解が複数ある問題は、どれを選んでも正解。判定には選択肢に出ているものを並べる', () => {
    const multi: GrammarDrill = { ...drill, answer: ['意志', '推量', '適当'] };
    expect(isDrillAnswerCorrect(multi, '推量')).toBe(true);
    expect(isDrillAnswerCorrect(multi, '勧誘')).toBe(false);
    expect(drillAnswerLabel(multi)).toBe('意志／推量');
    expect(drillThread(multi, '勧誘', neutral)[1]).toMatchObject({ text: '正しくは「意志／推量」。', verdict: 'ng' });
  });
  it('先生の口調を使う設定でも、3種類の吹き出しのまま（どの先生でも判定の文が空にならず、{ } が残らない）', () => {
    for (const teacher of TEACHER_IDS) {
      for (const chosen of ['意志', '推量']) {
        const b = drillThread(drill, chosen, { teacher, voice: true });
        expect(b.map((x) => x.kind)).toEqual(['answer', 'verdict', 'text']);
        const verdict = b[1];
        if (verdict.kind !== 'verdict') throw new Error('判定の吹き出しが無い');
        expect(verdict.text.length).toBeGreaterThan(0);
        expect(verdict.text).not.toMatch(/[{}]/);
        if (chosen === '推量') expect(verdict.text).toContain('意志');
      }
    }
  });
  it('同じ問題・同じ答えなら、いつも同じ吹き出し', () => {
    expect(drillThread(drill, '推量', neutral)).toEqual(drillThread(drill, '推量', neutral));
  });
  it('ChatFeedback に渡す仮の語は、問題の ID と【 】の中の語', () => {
    expect(drillFeedbackWord(drill)).toMatchObject({ qid: 'jodoshi-mu-01', lemma: 'む', examples: [] });
    expect(drillFeedbackWord({ ...drill, context: undefined }).lemma).toBe('');
  });
});
