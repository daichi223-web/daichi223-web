import { describe, it, expect } from 'vitest';
import {
  buildFallbackOptions,
  canUseAsDistractor,
  indexByLemma,
  isSameLemma,
  isSameMeaning,
  lemmaForms,
  pickTrueFalseWrongMeaning,
  senseDisplayKey,
  senseKeys,
  trapOverlapsSense,
} from '../lib/senseEquivalence';
import type { Word } from '../types';
import slimJson from '../data/kobunQ.v2.slim.json';

// 実データ（kobunQ.v2.slim）
const slim = slimJson as unknown as Word[];
const byQid = (qid: string): Word => {
  const w = slim.find((x) => x.qid === qid);
  if (!w) throw new Error(`qid ${qid} が slim に無い`);
  return w;
};
const byLemma = indexByLemma(slim);

// 固定種の乱数（mulberry32）。検証を再現できるようにする
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('senseKeys / isSameMeaning', () => {
  it('sense の断片は括弧の注記を外して比べる', () => {
    expect(senseKeys({ sense: '〔 （私から）思われ 〕' })).toEqual(['思われ']);
    expect(senseKeys({ sense: '〔 気づい 〕', senseNorm: '気づく' })).toEqual(['気づい', '気づく']);
    expect(senseKeys({ sense: '〔 いらっしゃっ 〕', senseNorm: 'いらっしゃる（本動詞・活用違い）' })).toEqual([
      'いらっしゃっ', 'いらっしゃる',
    ]);
  });

  it('別の見出し語で意味が一字一句同じ（うし⇔わびし、ふみ⇔せうそこ、まかる⇔まかづ）', () => {
    expect(isSameMeaning(byQid('24-1'), byQid('25-1'))).toBe(true);
    expect(isSameMeaning(byQid('36-1'), byQid('264-1'))).toBe(true);
    expect(isSameMeaning(byQid('171-1'), byQid('172-1'))).toBe(true);
  });

  it('同じ見出し語の中の同じ意味（活用違い・本動詞/補助動詞・注記だけの違い）', () => {
    expect(isSameMeaning(byQid('152-1'), byQid('152-2'))).toBe(true);
    expect(isSameMeaning(byQid('157-1'), byQid('157-2'))).toBe(true);
    expect(isSameMeaning(byQid('157-2'), byQid('157-3'))).toBe(true);
    expect(isSameMeaning(byQid('4-1'), byQid('4-4'))).toBe(true);
    expect(isSameMeaning(byQid('156-1'), byQid('156-3'))).toBe(true);
    expect(isSameMeaning(byQid('151-1'), byQid('151-2'))).toBe(true);
    expect(isSameMeaning(byQid('367-1'), byQid('367-2'))).toBe(true);
  });

  it('senseNorm の言い方のどれかが一致すれば同じ意味（表記ちがいの語どうしも）', () => {
    expect(isSameMeaning(byQid('47-1'), byQid('339-1'))).toBe(true); // できず / 〜できない
    expect(isSameMeaning(byQid('14-2'), byQid('22-1'))).toBe(true); // とてもすばらしかっ / すばらしい
  });

  it('明らかに別の意味は紛れない', () => {
    expect(isSameMeaning(byQid('1-1'), byQid('1-2'))).toBe(false); // 気づい / 目を覚まし
    expect(isSameMeaning(byQid('9-1'), byQid('9-2'))).toBe(false); // 座っ / てい
    expect(isSameMeaning(byQid('24-1'), byQid('1-1'))).toBe(false); // つらい / 気づい
    expect(isSameMeaning(byQid('90-1'), byQid('331-1'))).toBe(false); // 筋違いな / わけもなく
  });

  it('表示キーは 〔 〕 の中身で比べる', () => {
    expect(senseDisplayKey({ sense: '〔 気づい 〕' })).toBe(senseDisplayKey({ sense: '〔気づい〕' }));
    expect(senseDisplayKey({ sense: '〔 思われ 〕' })).not.toBe(senseDisplayKey({ sense: '〔 （私から）思われ 〕' }));
  });
});

describe('lemmaForms / isSameLemma', () => {
  it('見出し語の分解', () => {
    expect(lemmaForms('え～打消')).toEqual(['え']);
    expect(lemmaForms('きこゆ・きこえさす')).toEqual(['きこゆ', 'きこえさす']);
    expect(lemmaForms('～あへず')).toEqual(['あへず']);
    expect(lemmaForms('ゆめ・ゆめゆめ～打消・禁止')).toEqual(['ゆめ', 'ゆめゆめ']);
    expect(lemmaForms('あいなし', '形容詞')).toEqual(['あいなし', 'あいなく']);
    expect(lemmaForms('あながちなり', '形容動詞')).toEqual(['あながちなり', 'あながち']);
    // 品詞が形容詞でなければ「〜し→〜く」はしない
    expect(lemmaForms('ありし・ありつる', '連体詞・連語')).toEqual(['ありし', 'ありつる']);
  });

  it('表記ちがいで別の見出し語になっている9組＋いたし⇔いたく', () => {
    const pairs: Array<[string, string]> = [
      ['47-1', '339-1'], ['138-1', '348-1'], ['49-1', '343-1'], ['317-1', '340-1'], ['50-1', '335-1'],
      ['90-1', '331-1'], ['233-1', '352-1'], ['241-1', '332-1'], ['60-1', '156-1'], ['88-1', '337-1'],
    ];
    for (const [a, b] of pairs) {
      expect(isSameLemma(byQid(a), byQid(b)), `${a} ⇔ ${b}`).toBe(true);
    }
  });

  it('別の語は同じにしない', () => {
    expect(isSameLemma(byQid('10-1'), byQid('145-1'))).toBe(false); // ありく / ありし・ありつる
    expect(isSameLemma(byQid('1-1'), byQid('4-1'))).toBe(false); // おどろく / おぼゆ
    expect(isSameLemma({ lemma: 'あく' }, { lemma: 'あくがる' })).toBe(false);
  });
});

describe('trapOverlapsSense', () => {
  it('罠が正解と同じ・包含なら入れない', () => {
    expect(trapOverlapsSense('よい', byQid('16-1'))).toBe(true); // よし「よい」
    expect(trapOverlapsSense('いる（存在する）', byQid('9-2'))).toBe(true); // ゐる「〜ている（補助）」
  });
  it('別の意味の罠は使える', () => {
    expect(trapOverlapsSense('驚く（びっくりする）', byQid('1-1'))).toBe(false);
    expect(trapOverlapsSense('いる（存在する）', byQid('9-1'))).toBe(false); // 座っ
  });
});

// 全件の回帰検査。2026-10-06 の実測（740 件）。単語データが変わったら数え直す
describe('全件: 紛れる組の数', () => {
  const sameLemmaPairs: string[] = [];
  let diffLemmaPairs = 0;
  for (let i = 0; i < slim.length; i++) {
    for (let j = i + 1; j < slim.length; j++) {
      if (!isSameMeaning(slim[i], slim[j])) continue;
      if (slim[i].lemma === slim[j].lemma) sameLemmaPairs.push(`${slim[i].qid}⇔${slim[j].qid}`);
      else diffLemmaPairs++;
    }
  }

  it('同じ見出し語の中で同じ意味になる組', () => {
    expect(sameLemmaPairs).toEqual([
      '4-1⇔4-4', '151-1⇔151-2', '152-1⇔152-2', '156-1⇔156-3',
      '157-1⇔157-2', '157-1⇔157-3', '157-2⇔157-3', '158-1⇔158-2',
      '367-1⇔367-2', '367-1⇔367-3', '367-2⇔367-3',
    ]);
  });

  it('別の見出し語で同じ意味になる組', () => {
    expect(diffLemmaPairs).toBe(239);
  });

  it('表記ちがいの見出し語の組は10組だけ', () => {
    const lemmas = [...byLemma.keys()];
    const found: string[] = [];
    for (let i = 0; i < lemmas.length; i++) {
      for (let j = i + 1; j < lemmas.length; j++) {
        const a = byLemma.get(lemmas[i])![0];
        const b = byLemma.get(lemmas[j])![0];
        if (isSameLemma(a, b)) found.push(`${a.lemma}⇔${b.lemma}`);
      }
    }
    expect(found).toEqual([
      'え～打消⇔え', 'さらに～打消⇔さらに', 'いかで・いかでか⇔いかで', 'きこゆ⇔きこゆ・きこえさす',
      'いたし⇔いたく', 'あいなし⇔あいなく', 'つゆ～打消⇔つゆ', 'わりなし⇔わりなく',
      'あながちなり⇔あながち', 'おほかた～打消⇔おほかた',
    ]);
  });
});

describe('canUseAsDistractor', () => {
  it('意味が選択肢: 同じ意味・表記ちがいの語・表示の重複を除く', () => {
    const correct = byQid('24-1'); // うし「つらい」
    expect(canUseAsDistractor(byQid('25-1'), correct, [], 'sense', byLemma)).toBe(false); // わびし「つらい」
    expect(canUseAsDistractor(byQid('1-1'), correct, [], 'sense', byLemma)).toBe(true);
    // 既に選んだ誤答と同じ意味は入れない
    expect(canUseAsDistractor(byQid('36-1'), correct, [byQid('264-1')], 'sense', byLemma)).toBe(false);
    // 表記ちがいの語は意味が違っても入れない（あいなし「筋違いな」の正解に あいなく「わけもなく」）
    expect(canUseAsDistractor(byQid('331-1'), byQid('90-1'), [], 'sense', byLemma)).toBe(false);
    // 同じ語の別の意味（紛れないもの）は使える
    expect(canUseAsDistractor(byQid('1-2'), byQid('1-1'), [], 'sense', byLemma)).toBe(true);
    expect(canUseAsDistractor(byQid('152-2'), byQid('152-1'), [], 'sense', byLemma)).toBe(false);
  });

  it('見出し語が選択肢: 同じ語・正解と同じ意味を持つ語を除く', () => {
    const correct = byQid('36-1'); // ふみ「手紙」
    expect(canUseAsDistractor(byQid('264-1'), correct, [], 'lemma', byLemma)).toBe(false); // せうそこ
    expect(canUseAsDistractor(byQid('36-2'), correct, [], 'lemma', byLemma)).toBe(false); // 同じ語
    expect(canUseAsDistractor(byQid('1-1'), correct, [], 'lemma', byLemma)).toBe(true);
    expect(canUseAsDistractor(byQid('339-1'), byQid('47-1'), [], 'lemma', byLemma)).toBe(false); // え
    // 既に選んだ誤答と同じ語は入れない
    expect(canUseAsDistractor(byQid('1-2'), correct, [byQid('1-1')], 'lemma', byLemma)).toBe(false);
  });
});

// 選択肢に正解と紛れるものが無いことの確認
const assertDistinct = (correct: Word, options: Word[], mode: 'sense' | 'lemma') => {
  const others = options.filter((o) => o.qid !== correct.qid);
  for (const o of others) {
    expect(isSameMeaning(o, correct), `${correct.qid} と ${o.qid} が同じ意味`).toBe(false);
    if (mode === 'lemma') {
      expect(isSameLemma(o, correct), `${correct.qid} と ${o.qid} が同じ語`).toBe(false);
      expect((byLemma.get(o.lemma) ?? []).some((w) => isSameMeaning(w, correct)), `${o.lemma} が ${correct.qid} と同じ意味を持つ`).toBe(false);
    } else if (o.lemma !== correct.lemma) {
      expect(isSameLemma(o, correct), `${correct.qid} と ${o.qid} が表記ちがいの同じ語`).toBe(false);
    }
  }
  const shown = mode === 'lemma' ? options.map((o) => o.lemma) : options.map(senseDisplayKey);
  expect(new Set(shown).size, `${correct.qid} の表示が重複`).toBe(options.length);
};

describe('buildFallbackOptions（API が使えないときの選択肢）', () => {
  it('全件×3形式で、正解と紛れる誤答・表示の重複が無く、4つそろう', () => {
    const rng = seeded(1);
    for (const w of slim) {
      for (const qType of ['word-meaning', 'sentence-meaning', 'blank-fill'] as const) {
        const options = buildFallbackOptions(w, slim, qType, rng, byLemma);
        expect(options.length, `${w.qid} ${qType}`).toBe(4);
        expect(options.some((o) => o.qid === w.qid)).toBe(true);
        assertDistinct(w, options, qType === 'blank-fill' ? 'lemma' : 'sense');
      }
    }
  });
});

describe('pickTrueFalseWrongMeaning（○×の誤りの意味）', () => {
  it('同じ語の別の意味はあるが全部同じ意味の語（おほす）は、別の語から選ぶ', () => {
    const group = byLemma.get('おほす')!;
    const rng = seeded(2);
    for (let i = 0; i < 20; i++) {
      const w = pickTrueFalseWrongMeaning(byQid('152-1'), group, slim, rng);
      expect(w).not.toBeNull();
      expect(w!.lemma).not.toBe('おほす');
    }
  });

  it('多義語の全件×20回で、正しい意味と紛れる意味が出ない', () => {
    const rng = seeded(3);
    for (const [lemma, meanings] of byLemma) {
      if (meanings.length < 2) continue;
      for (const target of meanings) {
        for (let i = 0; i < 20; i++) {
          const w = pickTrueFalseWrongMeaning(target, meanings, slim, rng);
          expect(w, `${lemma} ${target.qid}`).not.toBeNull();
          expect(isSameMeaning(w!, target), `${target.qid} と ${w!.qid}`).toBe(false);
          if (w!.lemma !== lemma) expect(isSameLemma(w!, target)).toBe(false);
        }
      }
    }
  });
});
