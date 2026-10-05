import { describe, it, expect } from 'vitest';
import {
  hasAnswerBlank, hasQuizExample, isSubmitEnter, maskTranslation, quizMeanings, stripSenseBrackets,
} from '../components/quiz/writingVerdict';
import type { Word } from '../types';
import slimJson from '../data/kobunQ.v2.slim.json';

// 実データ（kobunQ.v2.slim）
const slim = slimJson as unknown as Word[];
const byQid = (qid: string): Word => {
  const w = slim.find((x) => x.qid === qid);
  if (!w) throw new Error(`qid ${qid} が slim に無い`);
  return w;
};

describe('stripSenseBrackets（選択肢の 〔 〕 を外す）', () => {
  it('外側の 〔 〕 と前後の空白を外す。中身は活用形のまま', () => {
    expect(stripSenseBrackets('〔 気づい 〕')).toBe('気づい');
    expect(stripSenseBrackets('〔順序〕')).toBe('順序');
    expect(stripSenseBrackets('  〔　めったにないほど立派で　〕 ')).toBe('めったにないほど立派で');
  });

  it('〔 〕 が複数あっても、無くても崩れない', () => {
    expect(stripSenseBrackets('〔 当然 〕住む〔 べき 〕')).toBe('当然住むべき');
    expect(stripSenseBrackets('気づく')).toBe('気づく');
    expect(stripSenseBrackets('')).toBe('');
  });

  it('中身が空なら元の文字列を返す（空の選択肢を作らない）', () => {
    expect(stripSenseBrackets('〔　〕')).toBe('〔　〕');
  });

  it('全単語: 外した後に空にならず、同じ表示になる組も増えない', () => {
    const before = new Set(slim.map((w) => w.sense.trim()));
    const after = new Set(slim.map((w) => stripSenseBrackets(w.sense)));
    expect(slim.every((w) => stripSenseBrackets(w.sense).length > 0)).toBe(true);
    expect(slim.some((w) => /[〔〕]/.test(stripSenseBrackets(w.sense)))).toBe(false);
    expect(after.size).toBe(before.size);
  });
});

describe('maskTranslation（回答前の訳で答えを伏せる）', () => {
  it('〔 〕 の中身を伏せる', () => {
    expect(maskTranslation('（訳）求婚して〔 結婚し 〕た。')).toBe('（訳）求婚して〔　？　〕た。');
  });

  it('〔 〕 が複数あれば全部伏せる', () => {
    expect(maskTranslation('〔 当然 〕住む〔 べき 〕山は吉野の山だ。')).toBe('〔　？　〕住む〔　？　〕山は吉野の山だ。');
  });

  it('〔 〕 の無い訳は出さない（null）', () => {
    expect(maskTranslation('男は求婚して結婚した。')).toBeNull();
    expect(maskTranslation('')).toBeNull();
    expect(maskTranslation(undefined)).toBeNull();
    expect(hasAnswerBlank('男は求婚して結婚した。')).toBe(false);
    expect(hasAnswerBlank('求婚して〔 結婚し 〕た。')).toBe(true);
  });

  it('全単語の全例文: 伏せた訳に 〔 〕 の中身が残らない', () => {
    for (const w of slim) {
      for (const ex of w.examples ?? []) {
        const masked = maskTranslation(ex.translation);
        if (masked === null) continue;
        expect(masked.replace(/〔　？　〕/g, '')).not.toMatch(/[〔〕]/);
      }
    }
  });
});

describe('quizMeanings（例文理解・文脈記述で画面に出して採点する意味）', () => {
  it('例文のある意味だけを返す', () => {
    const withExample = byQid('350-1');
    const noExample = byQid('350-2');
    expect(hasQuizExample(withExample)).toBe(true);
    expect(hasQuizExample(noExample)).toBe(false);
    expect(quizMeanings({ meanings: [withExample, noExample] }).map((m) => m.qid)).toEqual(['350-1']);
  });

  it('欠けたデータでも落ちない', () => {
    expect(quizMeanings(null)).toEqual([]);
    expect(quizMeanings({})).toEqual([]);
    expect(hasQuizExample(undefined)).toBe(false);
  });

  it('現在のデータで例文の無い意味は 350-2 だけ', () => {
    const shown = new Set(quizMeanings({ meanings: slim }).map((w) => w.qid));
    expect(slim.map((w) => w.qid).filter((qid) => !shown.has(qid))).toEqual(['350-2']);
  });
});

describe('isSubmitEnter（入力欄の Enter）', () => {
  it('ふつうの Enter は採点してよい', () => {
    expect(isSubmitEnter({ key: 'Enter', keyCode: 13, nativeEvent: { isComposing: false } })).toBe(true);
    expect(isSubmitEnter({ key: 'Enter' })).toBe(true);
  });

  it('かな漢字変換の確定の Enter は除く（isComposing と keyCode 229 の両方を見る）', () => {
    expect(isSubmitEnter({ key: 'Enter', keyCode: 13, nativeEvent: { isComposing: true } })).toBe(false);
    expect(isSubmitEnter({ key: 'Enter', keyCode: 229, nativeEvent: { isComposing: false } })).toBe(false);
  });

  it('Enter 以外は対象外', () => {
    expect(isSubmitEnter({ key: 'a', keyCode: 65 })).toBe(false);
  });
});
