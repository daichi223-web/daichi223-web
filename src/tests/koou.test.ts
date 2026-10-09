import { describe, it, expect } from 'vitest';
import { findKoou, koouMarks } from '../lib/kobun/koou';
import type { Token } from '../lib/kobun/types';

let n = 0;
const t = (text: string, pos = '', extra: Record<string, string> = {}): Token =>
  ({ id: `t${n++}`, text, start: 0, end: 0, layer: 0, grammarTag: { pos, ...extra } } as unknown as Token);

describe('findKoou', () => {
  it('ぞ…連体形の係り結び', () => {
    const toks = [t('鹿'), t('なむ', '係助詞'), t('鳴き', '動詞', { conjugationForm: '用' }), t('ける', '助動詞', { conjugationForm: '体', meaning: '過去' }), t('。')];
    const k = findKoou(toks);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ kind: '係り結び', toId: toks[3].id, note: 'なむ…ける（係り結び：連体形）' });
    expect(koouMarks(k).get(toks[1].id)).toEqual(['係①']);
    expect(koouMarks(k).get(toks[3].id)).toEqual(['結①']);
  });

  it('こそ…已然形', () => {
    const toks = [t('始め終はり'), t('こそ', '係助詞'), t('をかしけれ', '形容詞', { conjugationForm: '已' }), t('。')];
    expect(findKoou(toks)[0].note).toBe('こそ…をかしけれ（係り結び：已然形）');
  });

  it('係助詞のあとの読点は文末ではない（こそ、…已然形）', () => {
    const toks = [t('庭'), t('こそ', '係助詞'), t('、'), t('見どころ'), t('多けれ', '形容詞', { conjugationForm: '已' }), t('。')];
    expect(findKoou(toks)[0].toId).toBe(toks[4].id);
  });

  it('散文では連体修飾を結びと取り違えない', () => {
    const toks = [t('月'), t('ぞ', '係助詞'), t('見る', '動詞', { conjugationForm: '体' }), t('人'), t('、'), t('ありける', '動詞', { conjugationForm: '体' }), t('。')];
    expect(findKoou(toks)[0].toId).toBe(toks[5].id);
  });

  it('和歌は句切れの名詞が続いても結びを取る', () => {
    const toks = [t('秋風'), t('ぞ', '係助詞'), t('吹く', '動詞', { conjugationForm: '体' }), t('白河の関')];
    expect(findKoou(toks)[0].toId).toBe(toks[2].id);
  });

  it('文末の「かは」と引用の「〜やと」は結びを取らない', () => {
    expect(findKoou([t('見る'), t('ものかは', '係助詞'), t('。')])).toHaveLength(0);
    expect(findKoou([t('見る'), t('かは', '係助詞'), t('。')])).toHaveLength(0);
    expect(findKoou([t('見ゆ', '動詞', { conjugationForm: '終' }), t('や', '係助詞'), t('と', '格助詞')])).toHaveLength(0);
  });

  it('結びが見つからないときは推測せず「本文で確かめる」と書く', () => {
    const k = findKoou([t('などか'), t('ぞ', '係助詞'), t('思ひ', '動詞', { conjugationForm: '用' }), t('て', '接続助詞'), t('、')]);
    expect(k[0]).toMatchObject({ toId: null, note: 'ぞ（結びの省略・流れ。本文で確かめる）' });
  });

  it('断定「に」＋あり、にや（あらむ）の省略', () => {
    const a = [t('子'), t('に', '助動詞', { meaning: '断定' }), t('も', '係助詞'), t('あら', '補助動詞'), t('ず', '助動詞', { meaning: '打消' }), t('。')];
    expect(findKoou(a)[0].note).toBe('に…あら（断定「に」＋「あり」＝〜である）');
    const b = [t('こと'), t('に', '助動詞', { meaning: '断定' }), t('や', '係助詞'), t('。')];
    expect(findKoou(b)[0].note).toBe('にや（断定「に」＋「や」：下に「あらむ」などが省略）');
  });

  it('呼応の副詞', () => {
    expect(findKoou([t('え', '副詞'), t('参ら', '動詞'), t('ぬ', '助動詞', { meaning: '打消' })])[0].note).toBe('え…ぬ（呼応：え〜打消＝〜できない）');
    expect(findKoou([t('な', '副詞'), t('のたまひ', '動詞'), t('そ', '終助詞', { meaning: '禁止' })])[0].note).toBe('な…そ（呼応：な〜そ＝〜するな）');
  });
});
