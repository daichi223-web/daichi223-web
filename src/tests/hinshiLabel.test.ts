import { describe, it, expect } from 'vitest';
import { hinshiLabel, toCells } from '../lib/kobun/hinshiLabel';
import type { Token } from '../lib/kobun/types';
import hana from '../../public/texts-v3/acc9bf4496.json';

const tok = (text: string, grammarTag: Record<string, string>, layer = 0): Token =>
  ({ id: text, text, start: 0, end: text.length, layer, grammarTag } as unknown as Token);

describe('hinshiLabel', () => {
  it('動詞は活用の種類・活用形・終止形', () => {
    const l = hinshiLabel(tok('知ら', { pos: '動詞', conjugationType: 'ラ四', conjugationForm: '未', baseForm: 'しる' }));
    expect(l).toEqual({ top: 'ラ四', bottom: '未', base: 'しる', kind: 'yo' });
  });

  it('助動詞は意味・活用形', () => {
    expect(hinshiLabel(tok('ぬ', { pos: '助動詞', conjugationForm: '終', meaning: '強意' }))).toMatchObject({ top: '強意', bottom: '終', kind: 'jd' });
  });

  it('助詞は種類の略称・はたらき', () => {
    expect(hinshiLabel(tok('かは', { pos: '係助詞', meaning: '反語' }))).toMatchObject({ top: '係助', bottom: '反語', kind: 'js' });
  });

  it('敬語は種類を下段に足し、色は敬語', () => {
    const l = hinshiLabel(tok('まかれ', { pos: '動詞', conjugationType: 'ラ四', conjugationForm: '已', baseForm: 'まかる', honorific: '謙譲' }));
    expect(l).toEqual({ top: 'ラ四', bottom: '已・謙譲', base: 'まかる', kind: 'kei' });
  });

  it('品詞が空の語にはラベルを付けない（推測で埋めない）', () => {
    expect(hinshiLabel(tok('花', { pos: '' }))).toEqual({ top: '', bottom: '', base: null, kind: 'none' });
  });

  it('終止形が表記と同じなら出さない', () => {
    expect(hinshiLabel(tok('見る', { pos: '動詞', conjugationType: 'マ上一', conjugationForm: '体', baseForm: '見る' })).base).toBeNull();
  });
});

describe('toCells', () => {
  it('句読点は前の語に、開き括弧は次の語に付く', () => {
    const cells = toCells([tok('も', { pos: '係助詞' }), tok('、', { pos: '' }), tok('「', { pos: '' }), tok('花見', { pos: '' })]);
    expect(cells.map((c) => [c.pre, c.text, c.punct])).toEqual([['', 'も', '、'], ['「', '花見', '']]);
  });

  it('花は盛りにの全文で、セルをつなぐと本文に戻る', () => {
    for (const s of (hana as { sentences: { originalText: string; tokens: Token[] }[] }).sentences) {
      const joined = toCells(s.tokens).map((c) => c.pre + c.text + c.punct).join('');
      expect(joined).toBe(s.originalText);
    }
  });
});
