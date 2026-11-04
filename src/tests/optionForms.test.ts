import { describe, it, expect } from 'vitest';
import {
  baseForm, conjugate, detectForm, exampleFittedLabels, textAfterBlank, translationBlank,
} from '../lib/quiz/optionForms';
import slimJson from '../data/kobunQ.v2.slim.json';

type W = { qid: string; lemma: string; sense: string; senseNorm?: string; examples?: { jp: string; translation: string }[] };
const slim = slimJson as W[];
const Q = new Map(slim.map((w) => [w.qid, w]));
const labelsFor = (qid: string, ex: number, others: string[]) => {
  const w = Q.get(qid)!;
  return exampleFittedLabels(others.map((q) => Q.get(q)!), w, w.examples![ex].translation);
};

describe('現代語の活用', () => {
  it('形容詞・形容動詞・動詞の主な形', () => {
    expect(conjugate('おもしろい', 'renyo')).toBe('おもしろく');
    expect(conjugate('おもしろい', 'renyoTa')).toBe('おもしろかっ');
    expect(conjugate('気がかりだ', 'rentai')).toBe('気がかりな');
    expect(conjugate('気づく', 'renyoTa')).toBe('気づい');
    expect(conjugate('祈る', 'renyoTa')).toBe('祈っ');
    expect(conjugate('似る', 'renyoTa')).toBe('似');
    expect(conjugate('思われる', 'renyoTa')).toBe('思われ');
    expect(conjugate('大騒ぎする', 'renyoTa')).toBe('大騒ぎし');
    expect(conjugate('いらっしゃる', 'renyo')).toBe('いらっしゃい');
    expect(conjugate('参る', 'renyoTa')).toBe('参っ');
  });

  it('辞書の形は最初の言い方。括弧の中の「・」では区切らず、後ろの注記は外す', () => {
    expect(baseForm('あります（丁寧・本動詞）')).toEqual({ prefix: '', core: 'あります' });
    expect(baseForm('（人から）思われる')).toEqual({ prefix: '（人から）', core: '思われる' });
    expect(baseForm('見たい・聞きたい・知りたい')).toEqual({ prefix: '', core: '見たい' });
  });

  it('訳の穴と直後の文字', () => {
    const t = '（訳）たいそう悲しく〔 思われ 〕た。';
    expect(translationBlank(t)).toBe('思われ');
    expect(textAfterBlank(t)).toBe('た。');
    expect(detectForm('思われる', '思われ', 'た。')).toBe('renyoTa');
    expect(detectForm('気がかりだ', '気がかりな', 'ことだ')).toBe('rentai');
    expect(detectForm('おもしろい', 'おもしろい', '。')).toBe('shushi');
  });
});

describe('例文に合わせた選択肢（2026-11-05 ユーザー指摘の2問）', () => {
  it('をかし 15-2「始め終りこそをかしけれ」: 係り結びではなく訳の形（終止）。おもしろく にしない', () => {
    const L = labelsFor('15-2', 1, ['15-1']);
    expect(L['15-2']).toBe('おもしろい');
    expect(L['15-1']).toBe('趣がある');
  });

  it('おぼつかなし 20-2「いとどおぼつかなし」: 気がかりだ（終止）。誤答も終止', () => {
    const L = labelsFor('20-2', 1, ['20-3', '30-1']);
    expect(L['20-2']).toBe('気がかりだ');
    expect(L['20-3']).toBe('待ち遠しい');
    expect(L['30-1']).toBe('むだだ');
  });

  it('助動詞の訳は足さない（〔思われ〕た → 誤答も「た」を付けない）', () => {
    const L = labelsFor('4-1', 0, ['4-2', '4-3']);
    expect(L['4-1']).toBe('思われ');
    expect(L['4-2']).toBe('似');
    expect(L['4-3']).toBe('思い出され');
    for (const v of Object.values(L)) expect(v.endsWith('た')).toBe(false);
  });

  it('全データ: 正解の文字はその例文の訳の穴の言葉', () => {
    for (const w of slim) {
      for (const e of w.examples ?? []) {
        const blank = translationBlank(e.translation);
        if (!blank) continue;
        expect(exampleFittedLabels([], w, e.translation)[w.qid]).toBe(blank);
      }
    }
  });
});

describe('全件判定で見つかった形（2026-11-05）', () => {
  it('「〜ている」の訳の穴「てい」に合わせる（9-2 例1）', () => {
    expect(labelsFor('9-2', 0, ['9-1'])['9-1']).toBe('座っ');
  });
  it('「退屈で」「役に立たないで」の中止形に合わせる（29-1・30-1）', () => {
    expect(labelsFor('29-1', 1, ['29-2'])['29-2']).toBe('しんみりともの寂しく');
    expect(labelsFor('30-1', 1, ['30-2'])['30-2']).toBe('手持ちぶさたで');
  });
});

describe('連用修飾の形（2026-11-05）', () => {
  it('「平然として」「非常に」に合わせて 形容詞〜く・形容動詞〜に', () => {
    const a = labelsFor('89-1', 1, ['89-2', '89-3']);
    expect(Object.values(a)).toContain('平然として');
    expect(labelsFor('78-4', 1, ['78-1'])['78-1']).toMatch(/[くに]$/);
  });
  it('辞書の形と訳の言葉で品詞が違うときは訳の言葉で（親密だ→「親しい」友人＝連体）', () => {
    expect(labelsFor('79-2', 0, ['79-1'])['79-1']).toBe('端正な');
  });
});

describe('カ変「来る」', () => {
  it('来る → 来（連用）・来れ（仮定）', () => {
    expect(conjugate('来る', 'renyoTa')).toBe('来');
    expect(conjugate('やって来る', 'katei')).toBe('やって来れ');
  });
});

describe('訳の穴が2か所', () => {
  it('同じ言葉なら1つ、違えば「～」でつなぐ', () => {
    expect(translationBlank('〔 順序 〕も〔 順序 〕も')).toBe('順序');
    expect(translationBlank('〔 お 〕話し〔 申し上げる 〕')).toBe('お～申し上げる');
  });
});

describe('命令形・て形・「い」で終わる名詞（2026-11-05）', () => {
  it('命令: 一段〜ろ／〜よ、サ変〜しろ／〜せよ、五段〜え段', () => {
    expect(conjugate('閉める', 'meirei')).toBe('閉めろ');
    expect(conjugate('工夫する', 'meirei')).toBe('工夫しろ');
    expect(conjugate('指図する', 'meireiYo')).toBe('指図せよ');
    expect(conjugate('参る', 'meirei')).toBe('参れ');
    expect(detectForm('準備する', '準備しろ', '。')).toBe('meirei');
  });
  it('て形: 五段の濁る行は〜で', () => {
    expect(conjugate('読む', 'te')).toBe('読んで');
    expect(conjugate('移る', 'te')).toBe('移って');
    expect(conjugate('生まれる', 'te')).toBe('生まれて');
  });
  it('「かねてからの願い」は名詞なので活用させない', () => {
    expect(conjugate('かねてからの願い', 'renyo')).toBeNull();
  });
});

describe('活用形が決まらないときも誤答は最初の言い方だけ', () => {
  it('正解が名詞のとき、誤答に「・」の併記や後ろの注記を残さない', () => {
    const correct = { qid: 'x-1', senseNorm: '手紙' };
    const L = exampleFittedLabels(
      [{ qid: 'x-2', senseNorm: '漢詩・書物' }, { qid: 'x-3', senseNorm: 'あります（丁寧・本動詞）' }],
      correct,
      '（訳）〔 手紙 〕を書く。'
    );
    expect(L['x-2']).toBe('漢詩');
    expect(L['x-3']).toBe('あります');
  });
});
