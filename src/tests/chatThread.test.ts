import { describe, it, expect } from 'vitest';
import {
  buildThread, optionLabel, NO_ANSWER_LABEL,
  type ChatBubble, type ThreadInput, type WordQuizKind,
} from '../lib/quiz/chatThread';
import { TEACHER_IDS, fillTemplate, pickVariant } from '../lib/teachers';
import { TEACHER_LINES as LINES } from '../lib/teacherLines';
import { senseLabel, selfJudgePrompt, stripSenseBrackets } from '../components/quiz/writingVerdict';
import type { Word } from '../types';
import type { WritingJudgeResult, WritingVerdict } from '../lib/writingJudge';
import slimJson from '../data/kobunQ.v2.slim.json';

// 実データ（kobunQ.v2.slim）
const slim = slimJson as unknown as Word[];
const byQid = (qid: string): Word => {
  const w = slim.find((x) => x.qid === qid);
  if (!w) throw new Error(`qid ${qid} が slim に無い`);
  return w;
};

const CHOICE_TYPES: WordQuizKind[] = ['word-meaning', 'word-reverse', 'sentence-meaning', 'blank-fill'];
const WRITING_VERDICTS: WritingVerdict[] = ['correct', 'other_sense', 'modern_trap', 'wrong', 'blank', 'pending'];

// 核・決め手・罠がそろった合成データ（意味が2つある語）
const HAZUKASHI: Word = {
  qid: 't-1',
  lemma: 'はづかし',
  sense: '〔 立派だ 〕',
  meaning_idx: 1,
  group: 999,
  senseNorm: '（こちらが気後れするほど）立派だ',
  senseCore: '相手が立派で、こちらが気後れする',
  decider: { clue: '相手をほめる文脈', rule: '相手の美点に向くなら〈立派だ〉' },
  trap: { modern: '恥ずかしい', note: '自分の恥ではなく、相手の立派さ' },
  examples: [{ jp: 'いとはづかしき人なり。', translation: '（訳）たいへん〔 立派だ 〕人である。' }],
};
const HAZUKASHI_2: Word = {
  ...HAZUKASHI,
  qid: 't-2',
  sense: '〔 気がひける 〕',
  senseNorm: '気がひける',
  meaning_idx: 2,
  decider: { clue: '自分の側の心情', rule: '自分の気持ちなら〈気がひける〉' },
};
const OTHER: Word = {
  qid: 't-9',
  lemma: 'をかし',
  sense: '〔 趣がある 〕',
  meaning_idx: 1,
  group: 998,
  senseNorm: '趣がある',
  senseCore: '心ひかれる',
  examples: [{ jp: 'いとをかし。', translation: '（訳）とても〔 趣がある 〕。' }],
};
// 核も罠も決め手も無い単義語
const PLAIN: Word = {
  qid: 't-0',
  lemma: 'つとめて',
  sense: '〔 早朝 〕',
  meaning_idx: 1,
  group: 997,
  examples: [{ jp: '冬はつとめて。', translation: '（訳）冬は〔 早朝 〕。' }],
};
const SIBLINGS = [
  { label: senseLabel(HAZUKASHI), current: true },
  { label: senseLabel(HAZUKASHI_2), current: false },
];

const kinds = (bubbles: ChatBubble[]) => bubbles.map((b) => b.kind);
const find = <K extends ChatBubble['kind']>(bubbles: ChatBubble[], kind: K) =>
  bubbles.find((b): b is Extract<ChatBubble, { kind: K }> => b.kind === kind);
const texts = (bubbles: ChatBubble[]): string[] =>
  bubbles.flatMap((b) => Object.values(b).filter((v): v is string => typeof v === 'string'));

const choice = (over: Partial<ThreadInput> & { quizType: WordQuizKind; isCorrect: boolean }): ThreadInput => ({
  teacher: 'sei',
  word: HAZUKASHI,
  selected: over.isCorrect ? HAZUKASHI : OTHER,
  siblings: SIBLINGS,
  exampleKobun: 'いとはづかしき人なり。',
  exampleModern: '（訳）たいへん立派な人である。',
  seed: 't-1',
  ...over,
});

const writing = (verdict: WritingVerdict, over: Partial<ThreadInput> = {}): ThreadInput => ({
  teacher: 'murasaki',
  word: HAZUKASHI,
  quizType: 'meaning-writing',
  userAnswer: '気がひける',
  writingResult: { verdict } as WritingJudgeResult,
  siblings: SIBLINGS,
  seed: 't-1',
  ...over,
});

describe('optionLabel（自分の吹き出し・正解に出す文字）', () => {
  it('word-reverse / blank-fill は見出し語、それ以外は 〔 〕 を外した意味', () => {
    expect(optionLabel(HAZUKASHI, 'word-reverse')).toBe('はづかし');
    expect(optionLabel(HAZUKASHI, 'blank-fill')).toBe('はづかし');
    expect(optionLabel(HAZUKASHI, 'word-meaning')).toBe('立派だ');
    expect(optionLabel(HAZUKASHI, 'sentence-meaning')).toBe('立派だ');
    expect(optionLabel(HAZUKASHI, 'meaning-writing')).toBe('立派だ');
  });

  it('実データ全語で WordQuizContent と同じ規則になる', () => {
    for (const w of slim) {
      expect(optionLabel(w, 'word-meaning')).toBe(stripSenseBrackets(w.sense));
      expect(optionLabel(w, 'blank-fill')).toBe(w.lemma);
    }
  });
});

describe('buildThread 4択系（word-meaning / word-reverse / sentence-meaning / blank-fill）', () => {
  it.each(CHOICE_TYPES)('%s 正解：自分の答え → 判定 ok → 核（罠は畳む）だけ。進める', (quizType) => {
    const { bubbles, canAdvance } = buildThread(choice({ quizType, isCorrect: true }));
    expect(canAdvance).toBe(true);
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'core']);
    expect(bubbles[0]).toEqual({ side: 'me', kind: 'answer', text: optionLabel(HAZUKASHI, quizType) });
    const verdict = find(bubbles, 'verdict')!;
    expect(verdict.verdict).toBe('ok');
    expect(LINES.sei.correct).toContain(verdict.text);
    const core = find(bubbles, 'core')!;
    expect(core).toMatchObject({ lemma: 'はづかし', core: HAZUKASHI.senseCore, trapModern: '恥ずかしい' });
    expect(core.decider).toBeUndefined();
    expect(LINES.sei.coreLead).toContain(core.lead);
  });

  it.each(CHOICE_TYPES)('%s 不正解：判定 ng に正解を含み、核（決め手つき）・罠・例文・意味マップ', (quizType) => {
    const { bubbles, canAdvance } = buildThread(choice({ quizType, isCorrect: false }));
    expect(canAdvance).toBe(true);
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'core', 'trap', 'example', 'senses']);
    expect(bubbles[0]).toEqual({ side: 'me', kind: 'answer', text: optionLabel(OTHER, quizType) });
    const verdict = find(bubbles, 'verdict')!;
    expect(verdict.verdict).toBe('ng');
    expect(verdict.text).toContain(optionLabel(HAZUKASHI, quizType));
    const core = find(bubbles, 'core')!;
    expect(core.decider).toEqual(HAZUKASHI.decider);
    expect(core.trapModern).toBeUndefined();
    const trap = find(bubbles, 'trap')!;
    expect(trap).toMatchObject({ modern: '恥ずかしい', note: HAZUKASHI.trap!.note });
    expect(LINES.sei.trapLead).toContain(trap.lead);
    expect(find(bubbles, 'senses')!.items).toEqual(SIBLINGS);
  });

  it('不正解の例文：word-meaning / word-reverse / blank-fill は古文＋訳、sentence-meaning は訳だけ', () => {
    for (const quizType of ['word-meaning', 'word-reverse', 'blank-fill'] as WordQuizKind[]) {
      const ex = find(buildThread(choice({ quizType, isCorrect: false })).bubbles, 'example')!;
      expect(ex.kobun).toBe('いとはづかしき人なり。');
      expect(ex.modern).toBe('（訳）たいへん立派な人である。');
      expect(LINES.sei.exampleLead).toContain(ex.lead);
    }
    const sm = find(buildThread(choice({ quizType: 'sentence-meaning', isCorrect: false })).bubbles, 'example')!;
    expect(sm.kobun).toBeUndefined();
    expect(sm.modern).toBe('（訳）たいへん立派な人である。');
  });

  it('例文が渡されなければ語の第1例文を使い、訳も無ければ例文の吹き出しを出さない', () => {
    const fromWord = find(
      buildThread(choice({ quizType: 'word-meaning', isCorrect: false, exampleKobun: undefined, exampleModern: undefined })).bubbles,
      'example'
    )!;
    expect(fromWord.kobun).toBe(HAZUKASHI.examples[0].jp);
    expect(fromWord.modern).toBe(HAZUKASHI.examples[0].translation);
    const none = buildThread(
      choice({ quizType: 'sentence-meaning', isCorrect: false, exampleKobun: 'いとはづかしき人なり。', exampleModern: undefined })
    ).bubbles;
    expect(find(none, 'example')).toBeUndefined();
  });

  it('isCorrect が無ければ selected の qid で正誤を決める', () => {
    const ok = buildThread({ teacher: 'teika', word: HAZUKASHI, quizType: 'word-meaning', selected: HAZUKASHI, seed: 's' });
    expect(find(ok.bubbles, 'verdict')!.verdict).toBe('ok');
    const ng = buildThread({ teacher: 'teika', word: HAZUKASHI, quizType: 'word-meaning', selected: OTHER, seed: 's' });
    expect(find(ng.bubbles, 'verdict')!.verdict).toBe('ng');
    const noSel = buildThread({ teacher: 'teika', word: HAZUKASHI, quizType: 'word-meaning', seed: 's' });
    expect(noSel.bubbles[0]).toEqual({ side: 'me', kind: 'answer', text: NO_ANSWER_LABEL });
  });

  it('核・罠・決め手・意味マップが無い語は、判定と例文だけ', () => {
    const ok = buildThread(choice({ quizType: 'word-meaning', isCorrect: true, word: PLAIN, selected: PLAIN, siblings: [] }));
    expect(kinds(ok.bubbles)).toEqual(['answer', 'verdict']);
    const ng = buildThread(choice({ quizType: 'word-meaning', isCorrect: false, word: PLAIN, siblings: [] }));
    expect(kinds(ng.bubbles)).toEqual(['answer', 'verdict', 'example']);
  });

  it('意味マップは siblings が2件以上のときだけ、単義語（1件）には出さない', () => {
    const one = buildThread(choice({ quizType: 'word-meaning', isCorrect: false, siblings: [{ label: '立派だ', current: true }] }));
    expect(find(one.bubbles, 'senses')).toBeUndefined();
    const undef = buildThread(choice({ quizType: 'word-meaning', isCorrect: false, siblings: undefined }));
    expect(find(undef.bubbles, 'senses')).toBeUndefined();
  });
});

describe('buildThread 記述（meaning-writing）', () => {
  it('correct：判定 ok・正解の示し方は出さない・核に罠を畳む・例文は出さない', () => {
    const { bubbles, canAdvance } = buildThread(writing('correct', { userAnswer: '立派だ' }));
    expect(canAdvance).toBe(true);
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'core']);
    expect(bubbles[0]).toEqual({ side: 'me', kind: 'answer', text: '立派だ' });
    expect(find(bubbles, 'verdict')!.verdict).toBe('ok');
    expect(find(bubbles, 'core')!.trapModern).toBe('恥ずかしい');
  });

  it('other_sense：判定 near に書いた意味と正解、正解の示し方、核（決め手）・罠・意味マップ。例文は無し', () => {
    const { bubbles, canAdvance } = buildThread(writing('other_sense', { matchedSense: '気がひける' }));
    expect(canAdvance).toBe(true);
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'answerGuide', 'core', 'trap', 'senses']);
    const verdict = find(bubbles, 'verdict')!;
    expect(verdict.verdict).toBe('near');
    expect(verdict.text).toContain('気がひける');
    expect(verdict.text).toContain(senseLabel(HAZUKASHI));
    expect(find(bubbles, 'core')!.decider).toEqual(HAZUKASHI.decider);
  });

  it('other_sense で matchedSense が無ければ書いた答えを使う', () => {
    const verdict = find(buildThread(writing('other_sense', { userAnswer: 'きがひける' })).bubbles, 'verdict')!;
    expect(verdict.text).toContain('きがひける');
  });

  it('modern_trap：判定 near に現代語の罠と正解', () => {
    const { bubbles } = buildThread(writing('modern_trap', { userAnswer: '恥ずかしい' }));
    const verdict = find(bubbles, 'verdict')!;
    expect(verdict.verdict).toBe('near');
    expect(verdict.text).toContain('恥ずかしい');
    expect(verdict.text).toContain(senseLabel(HAZUKASHI));
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'answerGuide', 'core', 'trap', 'senses']);
  });

  it('modern_trap で語に罠の登録が無ければ、書いた答えを現代語に入れる', () => {
    const verdict = find(buildThread(writing('modern_trap', { word: OTHER, userAnswer: 'おかしい', siblings: [] })).bubbles, 'verdict')!;
    expect(verdict.text).toContain('おかしい');
  });

  it('wrong：判定 ng に正解', () => {
    const { bubbles, canAdvance } = buildThread(writing('wrong', { userAnswer: 'うれしい' }));
    expect(canAdvance).toBe(true);
    const verdict = find(bubbles, 'verdict')!;
    expect(verdict.verdict).toBe('ng');
    expect(verdict.text).toContain(senseLabel(HAZUKASHI));
    expect(LINES.murasaki.wrong.map((l) => fillTemplate(l, { 語: 'はづかし', 正解: senseLabel(HAZUKASHI) }))).toContain(verdict.text);
  });

  it('blank：自分の吹き出しは「（無回答）」、判定 ng に正解', () => {
    const { bubbles } = buildThread(writing('blank', { userAnswer: '' }));
    expect(bubbles[0]).toEqual({ side: 'me', kind: 'answer', text: NO_ANSWER_LABEL });
    const verdict = find(bubbles, 'verdict')!;
    expect(verdict.verdict).toBe('ng');
    expect(verdict.text).toContain(senseLabel(HAZUKASHI));
    expect(LINES.murasaki.blank.map((l) => fillTemplate(l, { 語: 'はづかし', 正解: senseLabel(HAZUKASHI) }))).toContain(verdict.text);
    expect(buildThread(writing('blank', { userAnswer: '   ' })).bubbles[0]).toMatchObject({ text: NO_ANSWER_LABEL });
  });

  it('pending（自己判定前）：pending → 正解の示し方 → 自己判定 → 核・罠・意味マップ。進めない', () => {
    const { bubbles, canAdvance } = buildThread(writing('pending'));
    expect(canAdvance).toBe(false);
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'answerGuide', 'selfJudge', 'core', 'trap', 'senses']);
    const verdict = find(bubbles, 'verdict')!;
    expect(verdict.verdict).toBe('pending');
    expect(verdict.text).toContain(senseLabel(HAZUKASHI));
    expect(find(bubbles, 'selfJudge')!.text).toBe(selfJudgePrompt(HAZUKASHI));
  });

  it('pending → ○：pending の後ろに selfRight、自己判定は消え、進める。解説の吹き出しは減らない', () => {
    const before = buildThread(writing('pending')).bubbles;
    const { bubbles, canAdvance } = buildThread(writing('pending', { writingUserJudgment: true }));
    expect(canAdvance).toBe(true);
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'text', 'answerGuide', 'core', 'trap', 'senses']);
    expect(LINES.murasaki.selfRight).toContain(find(bubbles, 'text')!.text);
    expect(bubbles.filter((b) => b.kind !== 'text' && b.kind !== 'selfJudge'))
      .toEqual(before.filter((b) => b.kind !== 'text' && b.kind !== 'selfJudge'));
  });

  it('pending → ×：selfWrong', () => {
    const { bubbles, canAdvance } = buildThread(writing('pending', { writingUserJudgment: false }));
    expect(canAdvance).toBe(true);
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'text', 'answerGuide', 'core', 'trap', 'senses']);
    expect(LINES.murasaki.selfWrong).toContain(find(bubbles, 'text')!.text);
  });

  it('writingResult が無ければ保留として扱う', () => {
    const { bubbles, canAdvance } = buildThread(writing('pending', { writingResult: null }));
    expect(canAdvance).toBe(false);
    expect(find(bubbles, 'verdict')!.verdict).toBe('pending');
  });

  it('記述の判定 6 種類すべてで、記述には例文の吹き出しを出さない', () => {
    for (const v of WRITING_VERDICTS) {
      expect(find(buildThread(writing(v)).bubbles, 'example')).toBeUndefined();
    }
  });
});

describe('buildThread 共通', () => {
  it('同じ入力なら同じ結果（seed で variant が決まる）', () => {
    const a = buildThread(choice({ quizType: 'word-meaning', isCorrect: false, seed: '12-1' }));
    const b = buildThread(choice({ quizType: 'word-meaning', isCorrect: false, seed: '12-1' }));
    expect(a).toEqual(b);
    const w1 = buildThread(writing('other_sense', { seed: '5-2' }));
    const w2 = buildThread(writing('other_sense', { seed: '5-2' }));
    expect(w1).toEqual(w2);
  });

  it('variant は seed + ":" + 鍵 で選ぶ', () => {
    const input = choice({ quizType: 'word-meaning', isCorrect: true, seed: '7-1', teacher: 'michizane' });
    const verdict = find(buildThread(input).bubbles, 'verdict')!;
    expect(verdict.text).toBe(pickVariant(LINES.michizane.correct, '7-1:correct'));
  });

  it('先生を替えると、その先生の台詞になる', () => {
    for (const teacher of TEACHER_IDS) {
      const verdict = find(buildThread(choice({ quizType: 'word-meaning', isCorrect: true, teacher })).bubbles, 'verdict')!;
      expect(LINES[teacher].correct).toContain(verdict.text);
    }
  });

  it('文字列のどこにも { } が残らない（合成データ）', () => {
    const inputs: ThreadInput[] = [
      ...CHOICE_TYPES.flatMap((quizType) => [choice({ quizType, isCorrect: true }), choice({ quizType, isCorrect: false })]),
      ...WRITING_VERDICTS.map((v) => writing(v)),
      writing('pending', { writingUserJudgment: true }),
      writing('pending', { writingUserJudgment: false }),
    ];
    for (const teacher of TEACHER_IDS) {
      for (const input of inputs) {
        for (const t of texts(buildThread({ ...input, teacher }).bubbles)) expect(t).not.toMatch(/[{}]/);
      }
    }
  });

  it('実データ数十語 × 5人 × 全形式 × 正解/不正解/記述6判定/自己判定で例外を出さず、{ } も残らない', () => {
    const sample = [
      ...slim.slice(0, 40),
      ...slim.filter((w) => w.trap).slice(0, 20),
      ...slim.filter((w) => !w.decider).slice(0, 10),
    ];
    expect(sample.length).toBeGreaterThanOrEqual(40);
    let count = 0;
    const problems: string[] = [];
    for (const [i, word] of sample.entries()) {
      const other = slim[(i + 1) % slim.length];
      const siblings = slim.filter((w) => w.lemma === word.lemma).map((m) => ({ label: senseLabel(m), current: m.qid === word.qid }));
      const ex = word.examples?.[0];
      for (const teacher of TEACHER_IDS) {
        const inputs: ThreadInput[] = [
          ...CHOICE_TYPES.flatMap((quizType) => [
            { teacher, word, quizType, selected: word, isCorrect: true, siblings, exampleKobun: ex?.jp, exampleModern: ex?.translation, seed: word.qid },
            { teacher, word, quizType, selected: other, isCorrect: false, siblings, exampleKobun: ex?.jp, exampleModern: ex?.translation, seed: word.qid },
          ]),
          ...WRITING_VERDICTS.map((verdict) => ({
            teacher, word, quizType: 'meaning-writing' as WordQuizKind, userAnswer: '試し', writingResult: { verdict }, siblings,
            matchedSense: siblings.find((s) => !s.current)?.label, seed: word.qid,
          })),
          { teacher, word, quizType: 'meaning-writing', userAnswer: '試し', writingResult: { verdict: 'pending' }, siblings, writingUserJudgment: true, seed: word.qid },
          { teacher, word, quizType: 'meaning-writing', userAnswer: '試し', writingResult: { verdict: 'pending' }, siblings, writingUserJudgment: false, seed: word.qid },
        ];
        for (const input of inputs) {
          const { bubbles, canAdvance } = buildThread(input);
          count++;
          const where = `${teacher} ${word.qid} ${input.quizType} ${input.writingResult?.verdict ?? (input.isCorrect ? 'ok' : 'ng')}`;
          if (bubbles[0]?.kind !== 'answer') problems.push(`${where}: 先頭が自分の答えでない`);
          if (bubbles[1]?.kind !== 'verdict') problems.push(`${where}: 2つ目が判定でない`);
          if (typeof canAdvance !== 'boolean') problems.push(`${where}: canAdvance が boolean でない`);
          // 自分の吹き出しの次は必ず先生
          if (!bubbles.slice(1).every((b) => b.side === 'teacher')) problems.push(`${where}: 先生以外の吹き出しが混ざった`);
          for (const t of texts(bubbles)) {
            if (/[{}]/.test(t)) problems.push(`${where}: { } が残った: ${t}`);
            if (t.length === 0) problems.push(`${where}: 空の文字列`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    expect(count).toBe(sample.length * TEACHER_IDS.length * (CHOICE_TYPES.length * 2 + WRITING_VERDICTS.length + 2));
  });

  it('実データ：おどろく（1-1）の不正解は決め手・罠・意味マップがそろう', () => {
    const word = byQid('1-1');
    const siblings = slim.filter((w) => w.lemma === word.lemma).map((m) => ({ label: senseLabel(m), current: m.qid === word.qid }));
    const { bubbles } = buildThread({
      teacher: 'tsurayuki', word, quizType: 'word-meaning', selected: byQid('2-1'), isCorrect: false, siblings,
      exampleKobun: word.examples[0].jp, exampleModern: word.examples[0].translation, seed: '1-1',
    });
    expect(kinds(bubbles)).toEqual(['answer', 'verdict', 'core', 'trap', 'example', 'senses']);
    expect(find(bubbles, 'core')!.decider).toEqual(word.decider);
    expect(find(bubbles, 'trap')!.modern).toBe(word.trap!.modern);
    expect(find(bubbles, 'senses')!.items.filter((s) => s.current)).toHaveLength(1);
    // 先生が言う正解は辞書の形（senseNorm「気づく」）。訳の穴の断片「気づい」ではない
    expect(find(bubbles, 'verdict')!.text).toContain(senseLabel(word));
    expect(find(bubbles, 'verdict')!.text).not.toContain('気づい」');
  });

  it('選択式でも先生の「正解」は辞書の形で、自分の吹き出しは選択肢の表示のまま', () => {
    const word = byQid('1-1');
    const { bubbles } = buildThread({ teacher: 'sei', word, quizType: 'sentence-meaning', selected: byQid('2-1'), isCorrect: false, seed: '1-1' });
    expect(find(bubbles, 'verdict')!.text).toContain(senseLabel(word));
    expect(find(bubbles, 'answer')!.text).toBe(optionLabel(byQid('2-1'), 'sentence-meaning'));
  });
});

describe('voice: false（先生の口調を使わない版）', () => {
  it('判定は中立の文になり、先生を替えても同じ', () => {
    const word = byQid('1-1');
    const texts = TEACHER_IDS.map((teacher) =>
      find(buildThread({ teacher, word, quizType: 'word-meaning', selected: byQid('2-1'), isCorrect: false, seed: '1-1', voice: false }).bubbles, 'verdict')!.text);
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toBe(`正しくは「${senseLabel(word)}」。`);
  });
});
