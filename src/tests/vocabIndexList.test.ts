import { describe, it, expect } from 'vitest';
import bundledKobunQ from '../data/kobunQ.v2.slim.json';
import {
  distinguishRows,
  kanaRowOf,
  compareKana,
  numberBandOf,
  OTHER_ROW,
  ruleShowsMeaning,
  type DistinguishSense,
} from '../lib/kobun/vocabIndexList';

const ALL = bundledKobunQ as unknown as (DistinguishSense & { lemma: string })[];
const sensesOf = (lemma: string) => ALL.filter((s) => s.lemma === lemma);

describe('distinguishRows（見分け方）', () => {
  it('多義語は意味の並び順に、データの決め手の文をそのまま出す', () => {
    const rows = distinguishRows(sensesOf('おどろく'));
    expect(rows.map((r) => r.label)).toEqual(['気づく', '目を覚ます']);
    const src = sensesOf('おどろく').find((s) => s.qid === rows[1].qid)!;
    expect(rows[1].rule).toBe(src.decider!.rule);
    expect(rows[1].clue).toBe(src.decider!.clue);
  });

  it('意味が1つの語には出さない（決め手があっても）', () => {
    expect(sensesOf('ゆかし')).toHaveLength(1);
    expect(distinguishRows(sensesOf('ゆかし'))).toEqual([]);
  });

  it('決め手の無い意味は行にしない。2つ未満なら出さない', () => {
    const s: DistinguishSense[] = [
      { qid: 'x-1', sense: '〔 a 〕', meaning_idx: 1, decider: { rule: 'A なら a' } },
      { qid: 'x-2', sense: '〔 b 〕', meaning_idx: 2 },
    ];
    expect(distinguishRows(s)).toEqual([]);
  });

  it('実データ：意味が2つ以上の語はすべて見分け方が出る', () => {
    const by = new Map<string, DistinguishSense[]>();
    for (const r of ALL) by.set(r.lemma, [...(by.get(r.lemma) ?? []), r]);
    const multi = [...by.entries()].filter(([, a]) => a.length > 1);
    expect(multi.length).toBeGreaterThan(200);
    for (const [lemma, a] of multi) expect(distinguishRows(a).length, lemma).toBe(a.length);
  });
});

describe('決め手の型の札（見本）', () => {
  it('札の付いた qid は単語データにあり、型は定義された12のどれか（2026-11-15 に場面を5つに分けた）', async () => {
    const dt = (await import('../data/decider-types.json')).default as {
      types: Record<string, string>; senses: Record<string, string>;
    };
    expect(Object.keys(dt.types)).toHaveLength(12);
    const qids = new Set(ALL.map((s) => s.qid));
    for (const [qid, t] of Object.entries(dt.senses)) {
      expect(qids.has(qid), qid).toBe(true);
      expect(t in dt.types, `${qid}:${t}`).toBe(true);
    }
  });

  it('見分け方の行に札が載る（2026-11-15 に全多義語へ広げた）', () => {
    expect(distinguishRows(sensesOf('かたはらいたし')).map((r) => r.type).slice(0, 3)).toEqual(['視点', '視点', '視点']);
    expect(distinguishRows(sensesOf('ゆめ・ゆめゆめ～打消・禁止')).map((r) => r.type)).toEqual(['呼応', '呼応']);
  });

  it('実データ：多義語の見分け方の行はすべて札が付く', () => {
    const by = new Map<string, DistinguishSense[]>();
    for (const r of ALL) by.set(r.lemma, [...(by.get(r.lemma) ?? []), r]);
    const rows = [...by.values()].filter((a) => a.length > 1).flatMap((a) => distinguishRows(a));
    const missing = rows.filter((r) => !r.type).map((r) => r.qid);
    expect(missing).toEqual([]);
  });
});

describe('ruleShowsMeaning（意味の名前を出すか）', () => {
  it('〈 〉で意味を書いた決め手は名前を出さない。書いていない決め手は名前を出す', () => {
    expect(ruleShowsMeaning('眠っている状況が前提なら〈目を覚ます〉')).toBe(true);
    expect(ruleShowsMeaning('たまふる・たまふれ の形は必ず下二段〈ております〉')).toBe(true);
    expect(ruleShowsMeaning('同上（仰せ給ふ・仰せける）')).toBe(false);
    expect(ruleShowsMeaning(undefined)).toBe(false);
  });

  it('実データ：多義語の決め手のうち〈 〉の無いものは少数（名前を出す行）', () => {
    const by = new Map<string, DistinguishSense[]>();
    for (const r of ALL) by.set(r.lemma, [...(by.get(r.lemma) ?? []), r]);
    const rows = [...by.values()].filter((a) => a.length > 1).flatMap((a) => distinguishRows(a));
    const noMeaning = rows.filter((r) => !ruleShowsMeaning(r.rule));
    expect(rows.length).toBeGreaterThan(600);
    expect(noMeaning.length).toBeLessThan(30);
  });
});

describe('索引', () => {
  it('五十音の行（濁音・先頭の～・カタカナ）', () => {
    expect(kanaRowOf('おどろく')).toBe('あ');
    expect(kanaRowOf('げに')).toBe('か');
    expect(kanaRowOf('ぞ')).toBe('さ');
    expect(kanaRowOf('～あへず')).toBe('あ');
    expect(kanaRowOf('ヲ')).toBe('わ');
    expect(kanaRowOf('行幸・行啓・御幸')).toBe(OTHER_ROW);
  });

  it('五十音順に並ぶ', () => {
    const list = ['ののしる', 'あくがる', '～あへず', 'かしこし'].sort(compareKana);
    expect(list).toEqual(['あくがる', '～あへず', 'かしこし', 'ののしる']);
  });

  it('番号の帯は50語ごと', () => {
    expect(numberBandOf(1)).toBe('1–50');
    expect(numberBandOf(50)).toBe('1–50');
    expect(numberBandOf(51)).toBe('51–100');
    expect(numberBandOf(9999)).toBe('追加');
  });
});
