import { describe, it, expect } from 'vitest';
import { judgeWriting, normalizeAnswer, type JudgeSense } from '../lib/writingJudge';
import { describeNorm, expandNorm } from '../lib/writingJudge';
import slimJson from '../data/kobunQ.v2.slim.json';

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

  it('教員が不正解と決めた言い方は wrong。書いたとおりの言い方だけに効く', () => {
    expect(judgeWriting({ answer: 'すぐに治る', target: okotaru, rejected: ['すぐに治る'] }).verdict).toBe('wrong');
    expect(judgeWriting({ answer: 'すぐに治った', target: okotaru, rejected: ['すぐに治る'] }).verdict).toBe('pending');
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

describe('describeNorm: 正解の言い方を画面用に分ける', () => {
  it('「・」で並ぶ言い方は、どれか1つでよい options になる', () => {
    expect(describeNorm('意地が悪い・ひどい')).toEqual({ options: ['意地が悪い', 'ひどい'], notes: [] });
  });

  it('頭の括弧は書かなくてよい部分（optionalLead）', () => {
    expect(describeNorm('（女のもとに）通う')).toEqual({ options: ['通う'], optionalLead: '女のもとに', notes: [] });
  });

  it('後ろの括弧は注記（notes）', () => {
    expect(describeNorm('さっきの（ありつる）')).toEqual({ options: ['さっきの'], notes: ['ありつる'] });
  });

  it('「・」入りの頭括弧は optionalLead にせず注記にする', () => {
    expect(describeNorm('（詠み・作り）申し上げる')).toEqual({ options: ['申し上げる'], notes: ['詠み・作り'] });
    expect(describeNorm('（色・香が）あせる・移る')).toEqual({ options: ['あせる', '移る'], notes: ['色・香が'] });
  });

  it('途中の括弧は注記にして、前後をつないだ言い方を options にする', () => {
    expect(describeNorm('〜ております（下二段・謙譲/丁寧）の打消系')).toEqual({
      options: ['〜ておりますの打消系'],
      notes: ['下二段・謙譲/丁寧'],
    });
  });

  it('空・undefined は空の案内', () => {
    expect(describeNorm('')).toEqual({ options: [], notes: [] });
    expect(describeNorm(undefined)).toEqual({ options: [], notes: [] });
  });

  it('代表例は実データの値と同じ', () => {
    const norm = (qid: string) => (slimJson as unknown as JudgeSense[]).find((w) => w.qid === qid)?.senseNorm;
    expect(norm('245-1')).toBe('意地が悪い・ひどい');
    expect(norm('189-1')).toBe('（女のもとに）通う');
    expect(norm('145-2')).toBe('さっきの（ありつる）');
    expect(norm('175-2')).toBe('（詠み・作り）申し上げる');
    expect(norm('356-2')).toBe('（色・香が）あせる・移る');
    expect(norm('160-1')).toBe('〜ております（下二段・謙譲/丁寧）の打消系');
  });
});

// 画面に「正解」として出した言い方を、そのまま写して答えたら必ず正解になること。
describe('describeNorm と judgeWriting の整合（全 740 件）', () => {
  const words = slimJson as unknown as JudgeSense[];

  it('options のどれを書いても正解。頭括弧の中身つきでも正解', () => {
    const failed: string[] = [];
    let checked = 0;
    for (const w of words) {
      const guide = describeNorm(w.senseNorm);
      if (w.senseNorm && guide.options.length === 0) failed.push(`${w.qid}: options が空（${w.senseNorm}）`);
      for (const option of guide.options) {
        const answers = guide.optionalLead ? [option, `（${guide.optionalLead}）${option}`, guide.optionalLead + option] : [option];
        for (const answer of answers) {
          checked++;
          const verdict = judgeWriting({ answer, target: w }).verdict;
          if (verdict !== 'correct') failed.push(`${w.qid}: 「${answer}」→ ${verdict}（${w.senseNorm}）`);
        }
      }
    }
    expect(words.length).toBe(740);
    expect(checked).toBeGreaterThan(740);
    expect(failed).toEqual([]);
  });

  it('options は expandNorm（判定が使う言い方）と同じ集合になる', () => {
    const diff: string[] = [];
    for (const w of words) {
      const guide = describeNorm(w.senseNorm);
      const shown = new Set(guide.options.map(normalizeAnswer));
      if (guide.optionalLead) for (const o of guide.options) shown.add(normalizeAnswer(guide.optionalLead + o));
      const judged = new Set(expandNorm(w.senseNorm).map(normalizeAnswer).filter(Boolean));
      const same = shown.size === judged.size && [...shown].every((x) => judged.has(x));
      if (!same) diff.push(`${w.qid}: ${w.senseNorm}`);
    }
    expect(diff).toEqual([]);
  });
});

// 実データ（kobunQ.v2.slim）の1語を、同じ見出し語の全意味を siblings にして判定する
const realWords = slimJson as unknown as Array<JudgeSense & { lemma: string }>;
const real = (qid: string): { target: JudgeSense; siblings: JudgeSense[] } => {
  const target = realWords.find((w) => w.qid === qid);
  if (!target) throw new Error(`qid ${qid} が実データにない`);
  return { target, siblings: realWords.filter((w) => w.lemma === target.lemma) };
};
const verdictOf = (qid: string, answer: string) => judgeWriting({ answer, ...real(qid) }).verdict;

describe('judgeWriting: 並べて書いた回答（正解の言い方を全部書いても正解）', () => {
  it('「・」「、」空白で並べた正解の言い方は、全部が正解の言い方なら正解', () => {
    for (const a of ['意地が悪い・ひどい', '意地が悪い、ひどい', 'ひどい 意地が悪い', '意地が悪い／ひどい']) {
      expect(judgeWriting({ answer: a, target: ayaniku }).verdict).toBe('correct');
    }
    expect(verdictOf('245-1', '意地が悪い、ひどい')).toBe('correct');
  });

  it('正解と別義・現代語の罠を並べたら正解にしない（順序を問わず）', () => {
    const withSiblings = { target: odorokuKizuku, siblings: [odorokuKizuku, odorokuMezameru] };
    for (const a of ['気づく、驚く', '驚く、気づく', '気づく、目を覚ます', '目を覚ます、気づく']) {
      expect(judgeWriting({ answer: a, ...withSiblings }).verdict).not.toBe('correct');
      expect(verdictOf('1-1', a)).not.toBe('correct');
    }
  });

  it('正解の言い方でない部分が1つでもあれば正解にしない', () => {
    expect(judgeWriting({ answer: '意地が悪い、ひどい、つらい', target: ayaniku }).verdict).not.toBe('correct');
  });

  it('教員が不正解と決めた言い方が部分に混ざれば正解にしない。全体が不正解の言い方なら wrong のまま', () => {
    expect(judgeWriting({ answer: 'ひどい、意地が悪い', target: ayaniku, rejected: ['ひどい'] }).verdict).not.toBe('correct');
    expect(judgeWriting({ answer: 'ひどい', target: ayaniku, rejected: ['ひどい'] }).verdict).toBe('wrong');
  });

  it('教員が認めた言い方は部分としても正解の言い方に数える', () => {
    expect(judgeWriting({ answer: '病気がよくなる、快方に向かう', target: okotaru }).verdict).not.toBe('correct');
    expect(judgeWriting({ answer: '病気がよくなる、快方に向かう', target: okotaru, accepted: ['快方に向かう'] }).verdict).toBe('correct');
  });

  it('読点を含む正解は、全体の一致が先に効いて正解のまま', () => {
    expect(verdictOf('150-1', 'さあ、一緒にいらっしゃい')).toBe('correct');
    expect(verdictOf('278-1', 'しっ、静かに')).toBe('correct');
    expect(verdictOf('334-2', 'どうして〜か、いや〜ない')).toBe('correct');
  });

  it('全 740 件: senseNorm をそのまま写しても、「・」の言い方を「、」で全部並べても正解', () => {
    const failed: string[] = [];
    let listed = 0;
    for (const w of realWords) {
      const guide = describeNorm(w.senseNorm);
      // 括弧の注記つきの senseNorm は、画面の options を「、」で並べた形で試す
      const answers = [/[（(]/.test(w.senseNorm ?? '') ? guide.options.join('、') : w.senseNorm ?? ''];
      if (guide.options.length > 1) {
        listed++;
        answers.push(guide.options.join('、'));
      }
      for (const answer of answers) {
        const verdict = judgeWriting({ answer, target: w }).verdict;
        if (verdict !== 'correct') failed.push(`${w.qid}: 「${answer}」→ ${verdict}（${w.senseNorm}）`);
      }
    }
    expect(listed).toBeGreaterThan(100);
    expect(failed).toEqual([]);
  });
});

describe('judgeWriting: 語の意味を表さない短い断片は正解の言い方にしない', () => {
  it('訳の穴が2つ以上ある訳の、機能語だけの断片は正解にも別義にもならない', () => {
    const cases: Array<[string, string]> = [
      ['155-2', 'お'], // お〜申し上げる（補助動詞）
      ['159-2', 'お'], // お〜になる（四段・補助動詞）
      ['49-1', 'ない'], // まったく〜ない
      ['138-1', 'ない'], // 少しも〜ない
      ['334-2', 'か'], // どうして〜か、いや〜ない（反語）
      ['350-1', 'べき'], // 当然〜すべきだ
    ];
    for (const [qid, a] of cases) expect(['correct', 'other_sense'], `${qid}「${a}」`).not.toContain(verdictOf(qid, a));
  });

  it('穴が1つの訳でも、1文字だけの断片は正解にも別義にもならない', () => {
    const cases: Array<[string, string]> = [
      ['48-1', 'な'], // 〜するな（禁止）
      ['67-1', 'い'], // いる
    ];
    for (const [qid, a] of cases) expect(['correct', 'other_sense'], `${qid}「${a}」`).not.toContain(verdictOf(qid, a));
  });

  it('呼応の副詞は、意味を表す側だけでも、つないだ形でも正解のまま', () => {
    expect(verdictOf('49-1', 'まったく')).toBe('correct');
    expect(verdictOf('49-1', 'まったく〜ない')).toBe('correct');
    expect(verdictOf('138-1', '少しも')).toBe('correct');
    expect(verdictOf('350-1', '当然')).toBe('correct');
    expect(verdictOf('334-2', 'どうして')).toBe('correct');
    expect(verdictOf('48-1', '〜するな')).toBe('correct');
    expect(verdictOf('155-2', 'お〜申し上げる')).toBe('correct');
    expect(verdictOf('9-2', 'ている')).toBe('correct');
  });

  it('1文字の senseNorm（122-1「縁」）と、穴が1つの訳の断片（203-1）は従来どおり正解', () => {
    expect(verdictOf('122-1', '縁')).toBe('correct');
    expect(judgeWriting({ answer: '縁', target: yoshiEn }).verdict).toBe('correct');
    expect(verdictOf('203-1', '病気がよくなっ')).toBe('correct');
    expect(verdictOf('203-1', '病気がよくなったようなので')).toBe('correct');
  });
});
