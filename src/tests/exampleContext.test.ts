import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { exampleContextKey, lookupExampleContext, normExampleText } from '../lib/exampleContext';
import { repairDistractors } from '../lib/senseEquivalence';
import slim from '../data/kobunQ.v2.slim.json';

describe('例文の照合キー', () => {
  it('空白と末尾の（出典）を外す', () => {
    expect(normExampleText('雨など降るも をかし。（枕草子）')).toBe('雨など降るもをかし。');
    expect(normExampleText('浪の下にも都のさぶらふぞ。(平家物語)')).toBe('浪の下にも都のさぶらふぞ。');
  });

  it('lookup は qid と例文の両方が合うときだけ返す', () => {
    const map = { [exampleContextKey('15-2', 'A（徒然草）')]: { avoid: ['15-1'] } };
    expect(lookupExampleContext(map, '15-2', 'A（徒然草）')?.avoid).toEqual(['15-1']);
    expect(lookupExampleContext(map, '15-1', 'A（徒然草）')).toBeUndefined();
    expect(lookupExampleContext(map, '15-2', undefined)).toBeUndefined();
  });

  it('生成スクリプトのキーと同じ作り方である', () => {
    // スクリプトは実行すると書き出すので import しない。関数の本体を文字列で突き合わせる
    const src = fs.readFileSync(path.resolve(__dirname, '../../scripts/build-example-context.mjs'), 'utf8');
    expect(src).toContain(".replace(/\\s+/g, '')");
    expect(src).toContain(".replace(/[（(][^（）()]*[）)]$/, '')");
  });
});

describe('誤答に出さない意味の入れ替え', () => {
  const correct = { qid: '15-2', lemma: 'をかし', sense: '〔 おもしろく 〕' };
  const near = { qid: '15-1', lemma: 'をかし', sense: '〔 趣がある 〕' };
  const a = { qid: '1-1', lemma: 'おどろく', sense: '〔 目を覚まし 〕' };
  const b = { qid: '2-1', lemma: 'ののしる', sense: '〔 大騒ぎする 〕' };
  const spare = { qid: '3-1', lemma: 'ねんず', sense: '〔 我慢する 〕' };

  it('avoid の意味を外し、同じ位置に代わりを入れる', () => {
    const out = repairDistractors([a, near, correct, b], correct, (o) => o.qid === '15-1', [near, spare]);
    expect(out.map((o) => o.qid)).toEqual(['1-1', '3-1', '15-2', '2-1']);
  });
});

describe('public/example-context.json（生成物）', () => {
  const p = path.resolve(__dirname, '../../public/example-context.json');
  const exists = fs.existsSync(p);
  it.runIf(exists)('すべてのキーが単語データの qid と例文に当たる', () => {
    const map = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, { avoid?: string[] }>;
    const byQid = new Map((slim as Array<{ qid: string; examples?: { jp: string }[] }>).map((w) => [String(w.qid), w]));
    for (const key of Object.keys(map)) {
      const [qid, jp] = key.split('|');
      const w = byQid.get(qid);
      expect(w, key).toBeTruthy();
      expect((w!.examples ?? []).some((e) => normExampleText(e.jp) === jp), key).toBe(true);
      for (const q of map[key].avoid ?? []) expect(byQid.has(q), `${key} avoid ${q}`).toBe(true);
    }
  });
});
