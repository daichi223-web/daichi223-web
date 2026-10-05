import { describe, it, expect } from 'vitest';
import { judgeWriting, normalizeAnswer, type JudgeSense } from '../lib/writingJudge';
import { baseKeyFromTokens, describeNorm, expandNorm, type MorphToken } from '../lib/writingJudge';
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

  // 2026-10-06 ユーザー決定で期待値を変更: 以前は「別義に当たっても正解の言い方と重なれば正解（overlap）」だったが、
  // 「少しも→［少し］」「かわいい→［かわいそうだ］」のような誤りまで正解になるため、正解にも別義にもせず保留にする
  it('別義に当たり、正解の言い方と一部だけ重なる回答は保留（2026-10-06 ユーザー決定で正解から変更）', () => {
    const r = judgeWriting({ answer: 'いつもの', target: reinoB, siblings: [reinoA, reinoB] });
    expect(r).toEqual({ verdict: 'pending', partial: true });
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

// ---- 2026-10-06 照合の作り替え（語幹の条件・原形の鍵・読みの条件） ----
// 辞書ありの経路は、本物の kuromoji（public/kuromoji/dict）で確かめた読みと原形の鍵を表にして渡す（2026-10-06 確認）。
// 表に無い言い方は表記のまま返す。実辞書での全件の確認は、テストの外の全件測定で行う。
const KUROMOJI: Record<string, [reading: string, base: string]> = {
  すぐに: ['スグニ', 'すぐに'],
  すぐれている: ['スグレテイル', 'すぐれる'],
  まさる: ['マサル', 'まさる'],
  まさか: ['マサカ', 'まさか'],
  ますます: ['マスマス', 'ますます'],
  ます: ['マス', 'ます'],
  座るている: ['スワルテイル', '座る'],
  座る: ['スワル', '座る'],
  ている: ['テイル', 'ている'],
  仏事こと: ['ブツジコト', '仏事こと'],
  こと: ['コト', 'こと'],
  道理: ['ドウリ', '道理'],
  どうして: ['ドウシテ', 'どうして'],
  立つ: ['タツ', '立つ'],
  経つ: ['タツ', '経つ'],
  疲れ: ['ツカレ', '疲れ'],
  疲れる: ['ツカレル', '疲れる'],
  使う: ['ツカウ', '使う'],
  使っ: ['ツカッ', '使う'],
  程度: ['テイド', '程度'],
  かよった: ['カヨッタ', 'かよう'],
  通う: ['カヨウ', '通う'],
  ひどかった: ['ヒドカッタ', 'ひどい'],
  ひどい: ['ヒドイ', 'ひどい'],
  意地が悪かった: ['イジガワルカッタ', '意地が悪い'],
  意地が悪い: ['イジガワルイ', '意地が悪い'],
  まったくなかった: ['マッタクナカッタ', 'まったくない'],
  まったくない: ['マッタクナイ', 'まったくない'],
  立派な: ['リッパナ', '立派'],
  気の毒に: ['キノドクニ', '気の毒'],
  おろそかな: ['オロソカナ', 'おろそか'],
  いらっしゃっ: ['イラッシャッ', 'いらっしゃる'],
  いらっしゃる: ['イラッシャル', 'いらっしゃる'],
  少しも: ['スコシモ', '少しも'],
  少し: ['スコシ', '少し'],
};
const dict = {
  toReading: (s: string) => KUROMOJI[s]?.[0] ?? s,
  toBase: (s: string) => KUROMOJI[s]?.[1] ?? s,
};
const modes: Array<[string, Partial<typeof dict>]> = [
  ['辞書なし', {}],
  ['辞書あり', dict],
];
const judgeReal = (qid: string, answer: string, d: Partial<typeof dict> = {}) => judgeWriting({ answer, ...real(qid), ...d });

describe('judgeWriting: 別の語・別の意味に当たらない（語幹・読み・原形の照合）', () => {
  it('語幹の2段目は活用語尾になりうる かな だけを落とす（すぐに／すぐれている、まさる／まさか、ますます／ます）', () => {
    const cases: Array<[string, string]> = [
      ['254-1', 'すぐに'], // 優美だ・すぐれている
      ['45-2', 'すぐれている'], // すぐに
      ['139-1', 'まさる'], // まさか〜ないだろう
      ['360-3', 'まさか'], // まさる
      ['165-3', 'ますます'], // 〜ます・〜ございます
      ['343-2', 'ます'], // ますます
    ];
    for (const [name, d] of modes) {
      for (const [qid, a] of cases) expect(judgeReal(qid, a, d).verdict, `${name} ${qid}「${a}」`).not.toBe('correct');
    }
  });

  it('並べ書きは、全体をつないだ形の原形で照合しない（仏事、こと／座る、〜ている）。部分ごとには原形で照合する', () => {
    for (const [name, d] of modes) {
      expect(judgeReal('113-1', '仏事、こと', d).verdict, `${name} 113-1`).not.toBe('correct'); // 仏事・法事
      expect(judgeReal('9-1', '座る、〜ている', d).verdict, `${name} 9-1`).not.toBe('correct'); // 座る
    }
    expect(judgeReal('245-1', '意地が悪い、ひどかった', dict).verdict).toBe('correct');
  });

  it('読みの照合は、片方の漢字がもう片方に全部含まれるときだけ（立つ／経つ、疲れ／使う）', () => {
    expect(judgeReal('356-3', '立つ', dict).verdict).not.toBe('correct'); // （時が）経つ
    expect(judgeReal('361-1', '経つ', dict).verdict).not.toBe('correct'); // 立つ
    expect(judgeReal('197-1', '使う', dict).verdict).not.toBe('correct'); // 疲れる
    expect(judgeReal('197-1', '使っ', dict).verdict).not.toBe('correct');
    expect(judgeReal('67-4', '疲れ', dict).verdict).not.toBe('correct'); // 食べる・使う
  });

  it('表記が漢字で終わる語は、読みの語尾を削らない（道理→どうして、程度→ている）', () => {
    expect(judgeReal('50-1', '道理', dict).verdict).not.toBe('correct'); // どうして
    expect(judgeReal('111-1', 'どうして', dict).verdict).not.toBe('correct'); // 道理
    expect(judgeReal('9-2', '程度', dict).verdict).not.toBe('correct'); // 〜ている
    expect(judgeReal('109-2', 'ている', dict).verdict).not.toBe('correct'); // 程度
  });

  it('別義に当たり一部だけ重なる回答は保留（格段に劣る→［格段に（まさる）］、かわいい→［かわいそうだ］、少しも→［少し］）', () => {
    for (const [name, d] of modes) {
      expect(judgeReal('293-1', '格段に劣る', d), name).toEqual({ verdict: 'pending', partial: true });
      expect(judgeReal('86-1', 'かわいい', d), name).toEqual({ verdict: 'pending', partial: true });
      expect(judgeReal('336-1', '少しも', d), name).toEqual({ verdict: 'pending', partial: true });
    }
  });
});

describe('judgeWriting: 照合を絞っても正解のまま', () => {
  it('形容動詞の な／に（立派な・気の毒に・おろそかな）と、音便の形（いらっしゃっ）', () => {
    for (const [name, d] of modes) {
      expect(judgeReal('22-2', '立派な', d).verdict, name).toBe('correct'); // 立派だ・見事だ
      expect(judgeReal('84-2', '気の毒に', d).verdict, name).toBe('correct'); // 気の毒だ・心苦しい
      expect(judgeReal('27-1', 'おろそかな', d).verdict, name).toBe('correct'); // おろそかだ
      expect(judgeReal('67-6', 'いらっしゃっ', d).verdict, name).toBe('correct'); // いらっしゃる
    }
  });

  it('かな書きの活用形は読みで正解（かよった→通う）', () => {
    expect(judgeReal('189-1', 'かよった', dict).verdict).toBe('correct');
  });

  it('原形の鍵があれば「〜なかった」「〜かった」も正解（辞書なしでは保留）', () => {
    expect(judgeReal('49-1', 'まったくなかった', dict).verdict).toBe('correct'); // まったく〜ない
    expect(judgeReal('245-1', 'ひどかった', dict).verdict).toBe('correct'); // 意地が悪い・ひどい
    expect(judgeReal('245-1', '意地が悪かった', dict).verdict).toBe('correct');
    expect(judgeReal('245-1', 'ひどかった').verdict).toBe('pending');
  });
});

describe('baseKeyFromTokens: 原形の鍵', () => {
  // kuromoji の出力（2026-10-06 に本物の辞書で確認）のうち使う項目だけ
  const t = (surface_form: string, pos: string, pos_detail_1: string, basic_form: string): MorphToken => ({
    surface_form,
    pos,
    pos_detail_1,
    basic_form,
  });

  it('活用する語は原形にそろえ、末尾の た・ている・形容動詞の な/に を落とす', () => {
    expect(baseKeyFromTokens([t('ひどかっ', '形容詞', '自立', 'ひどい'), t('た', '助動詞', '*', 'た')])).toBe('ひどい');
    expect(
      baseKeyFromTokens([t('すぐれ', '動詞', '自立', 'すぐれる'), t('て', '助詞', '接続助詞', 'て'), t('いる', '動詞', '非自立', 'いる')]),
    ).toBe('すぐれる');
    expect(baseKeyFromTokens([t('立派', '名詞', '形容動詞語幹', '立派'), t('な', '助動詞', '*', 'だ')])).toBe('立派');
    expect(baseKeyFromTokens([t('気の毒', '名詞', '形容動詞語幹', '気の毒'), t('に', '助詞', '副詞化', 'に')])).toBe('気の毒');
  });

  it('打消と「こと」は落とさない。1語だけ・「ている」だけなら そのまま', () => {
    expect(
      baseKeyFromTokens([t('思わ', '動詞', '自立', '思う'), t('なかっ', '助動詞', '*', 'ない'), t('た', '助動詞', '*', 'た')]),
    ).toBe('思うない');
    expect(baseKeyFromTokens([t('仏事', '名詞', '一般', '仏事'), t('こと', '名詞', '非自立', 'こと')])).toBe('仏事こと');
    expect(baseKeyFromTokens([t('て', '助詞', '接続助詞', 'て'), t('いる', '動詞', '非自立', 'いる')])).toBe('ている');
    expect(baseKeyFromTokens([t('ます', '助動詞', '*', 'ます')])).toBe('ます');
  });
});
