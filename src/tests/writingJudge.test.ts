import { describe, it, expect } from 'vitest';
import { judgeWriting, normalizeAnswer, type JudgeSense } from '../lib/writingJudge';

// kobunQ.v2.slim と同じ形のデータ。203-1・1-1 は実データの抜粋、ほかは形を合わせたテスト用の例。
const okotaru: JudgeSense = {
  qid: '203-1',
  sense: '〔 病気がよくなっ 〕',
  senseNorm: '病気がよくなる',
  trap: { modern: '怠ける' },
  examples: [{ translation: '（訳）…〔 病気がよくなったようなので 〕、…' }],
};
const odorokuKizuku: JudgeSense = {
  qid: '1-1',
  sense: '〔 気づい 〕',
  senseNorm: '気づく',
  trap: { modern: '驚く（びっくりする）' },
  examples: [{ translation: '…〔 はっと気づい 〕てよく見ると…' }],
};
const odorokuMezameru: JudgeSense = { qid: '1-2', sense: '〔 目を覚まし 〕', senseNorm: '目を覚ます', trap: { modern: '驚く（びっくりする）' } };
const sumu: JudgeSense = { qid: '189-1', sense: '〔 通っ 〕', senseNorm: '（女のもとに）通う' };
const arishi: JudgeSense = { qid: '145-1', sense: '〔 かつての 〕', senseNorm: 'かつての（ありし）' };
const aritsuru: JudgeSense = { qid: '145-2', sense: '〔 さっきの 〕', senseNorm: 'さっきの（ありつる）' };
const reinoA: JudgeSense = { qid: '146-1', sense: '〔 いつもの 〕', senseNorm: 'いつもの' };
const reinoB: JudgeSense = { qid: '146-2', sense: '〔 いつものように 〕', senseNorm: 'いつものように' };
const ikagaQ: JudgeSense = { qid: '148-1', sense: '〔 どうしようか 〕', senseNorm: 'どうしようか（疑問）' };
const ikagaH: JudgeSense = { qid: '148-2', sense: '〔 どうしようもない 〕', senseNorm: 'どうしようもない（反語）' };
const otonau: JudgeSense = { qid: '185-1', sense: '〔 音を立て 〕', senseNorm: '音を立てる' };
const yoshiEn: JudgeSense = { qid: '122-4', sense: '〔 縁 〕', senseNorm: '縁' };
const ayaniku: JudgeSense = { qid: '245-1', sense: '〔 ひどく 〕', senseNorm: '意地が悪い・ひどい' };
const kokochi: JudgeSense = { qid: '90-2', sense: '〔 病気 〕', senseNorm: '病気' };

// テスト用の読み。本番では形態素解析の読みを渡す。
const yomiTable: Record<string, string> = { 病気: 'びょうき', 噂に聞く: 'うわさにきく', うわさに聞く: 'うわさにきく', 通い: 'かよい', 通う: 'かよう' };
const toReading = (s: string) => yomiTable[s] ?? s;

describe('normalizeAnswer', () => {
  it('括弧・記号・空白を落とし、カタカナをひらがなにする', () => {
    expect(normalizeAnswer('〔 気づい 〕')).toBe('気づい');
    expect(normalizeAnswer('まったくー ない。')).toBe('まったくない');
    expect(normalizeAnswer('ウワサ')).toBe('うわさ');
  });
});

describe('judgeWriting: 正解', () => {
  it('辞書形・穴埋めの形・例文の形のどれでも正解', () => {
    for (const a of ['病気がよくなる', '病気がよくなっ', '病気がよくなった', '病気がよくなったようなので']) {
      expect(judgeWriting({ answer: a, target: okotaru }).verdict).toBe('correct');
    }
  });

  it('活用の形は問わない', () => {
    expect(judgeWriting({ answer: '気づいた', target: odorokuKizuku }).verdict).toBe('correct');
    expect(judgeWriting({ answer: 'はっと気づく', target: odorokuKizuku }).verdict).toBe('correct');
  });

  it('頭の括弧は書かなくてもよく、後ろの括弧は注記として無視する', () => {
    expect(judgeWriting({ answer: '通う', target: sumu }).verdict).toBe('correct');
    expect(judgeWriting({ answer: '女のもとに通う', target: sumu }).verdict).toBe('correct');
    expect(judgeWriting({ answer: 'さっきの', target: aritsuru }).verdict).toBe('correct');
  });

  it('「・」で並ぶ意味はどれか1つでよい', () => {
    expect(judgeWriting({ answer: 'ひどい', target: ayaniku }).verdict).toBe('correct');
    expect(judgeWriting({ answer: '意地が悪い', target: ayaniku }).verdict).toBe('correct');
  });

  it('1文字の正解を無回答にしない', () => {
    expect(judgeWriting({ answer: '縁', target: yoshiEn }).verdict).toBe('correct');
  });

  it('教員が認めた言い方は正解', () => {
    expect(judgeWriting({ answer: '快方に向かう', target: okotaru }).verdict).toBe('pending');
    expect(judgeWriting({ answer: '快方に向かう', target: okotaru, accepted: ['快方に向かう'] }).verdict).toBe('correct');
  });

  it('読みを渡せば漢字とかなの表記ちがいを吸収する', () => {
    expect(judgeWriting({ answer: 'びょうき', target: kokochi }).verdict).toBe('pending');
    expect(judgeWriting({ answer: 'びょうき', target: kokochi, toReading }).verdict).toBe('correct');
    expect(judgeWriting({ answer: '通い', target: sumu, toReading }).verdict).toBe('correct');
  });
});

describe('judgeWriting: 取り違え', () => {
  it('同じ語の別の意味を書いたら other_sense と、その qid を返す', () => {
    const r = judgeWriting({ answer: 'かつての', target: aritsuru, siblings: [arishi, aritsuru] });
    expect(r).toEqual({ verdict: 'other_sense', matchedQid: '145-1' });
    expect(judgeWriting({ answer: '目を覚ます', target: odorokuKizuku, siblings: [odorokuMezameru] }).verdict).toBe('other_sense');
  });

  it('別義と言い方が重なるだけなら正解にする', () => {
    const r = judgeWriting({ answer: 'いつもの', target: reinoB, siblings: [reinoA, reinoB] });
    expect(r).toEqual({ verdict: 'correct', overlap: true });
  });

  it('疑問と反語は重なり扱いにしない', () => {
    const r = judgeWriting({ answer: 'どうしようもない', target: ikagaQ, siblings: [ikagaQ, ikagaH] });
    expect(r.verdict).toBe('other_sense');
  });

  it('現代語の意味で書いたら modern_trap', () => {
    expect(judgeWriting({ answer: '驚く', target: odorokuKizuku }).verdict).toBe('modern_trap');
    expect(judgeWriting({ answer: 'びっくりする', target: odorokuKizuku }).verdict).toBe('modern_trap');
    expect(judgeWriting({ answer: '怠ける', target: okotaru }).verdict).toBe('modern_trap');
  });
});

describe('judgeWriting: 正解にしないもの', () => {
  it('打消の有無がちがえば一致させない', () => {
    expect(judgeWriting({ answer: '音を立てず', target: otonau }).verdict).not.toBe('correct');
    expect(judgeWriting({ answer: '音を立てない', target: otonau }).verdict).not.toBe('correct');
  });

  it('無回答・1文字・記号だけは blank', () => {
    for (const a of ['', '  ', 'あ', '？', '…']) {
      expect(judgeWriting({ answer: a, target: okotaru }).verdict).toBe('blank');
    }
  });

  it('決められない答えは pending。一部だけ合えば partial を立てる', () => {
    expect(judgeWriting({ answer: 'サボる', target: okotaru })).toEqual({ verdict: 'pending' });
    expect(judgeWriting({ answer: '病気がよくなって元気になる', target: okotaru })).toEqual({ verdict: 'pending', partial: true });
  });
});
