import type { Word } from '../../types';
import type { WritingJudgeResult } from '../writingJudge';
import { selfJudgePrompt, senseLabel, stripSenseBrackets } from '../../components/quiz/writingVerdict';
import { fillTemplate, pickVariant, type TeacherId, type TeacherLines, type TeacherVars } from '../teachers';
import { TEACHER_LINES, NEUTRAL_LINES } from '../teacherLines';

/**
 * 単語クイズの答え合わせ（LINE 風）のやりとりを組む純関数。
 * 右＝自分（選んだ答え／書いた意味）、左＝先生（判定・正解・核イメージ・罠・例文と訳・意味マップ）。
 * 描くのは src/components/quiz/ChatFeedback.tsx。ここは DOM・画面に触れない（vitest の node 環境で検査する）。
 */

export type WordQuizKind = 'word-meaning' | 'word-reverse' | 'sentence-meaning' | 'blank-fill' | 'meaning-writing';

export type ChatVerdict = 'ok' | 'ng' | 'near' | 'pending';

export type ChatBubble =
  | { side: 'me'; kind: 'answer'; text: string }
  | { side: 'teacher'; kind: 'verdict'; text: string; verdict: ChatVerdict }
  /** UI が SenseAnswerGuide(word) を描く（記述で正解以外のとき） */
  | { side: 'teacher'; kind: 'answerGuide' }
  | {
      side: 'teacher';
      kind: 'core';
      lead: string;
      lemma: string;
      core: string;
      decider?: { clue: string; rule: string };
      trapModern?: string;
    }
  | { side: 'teacher'; kind: 'trap'; lead: string; modern: string; note?: string }
  /** UI が MarkedSentence で描く。kobun 無しなら訳だけ */
  | { side: 'teacher'; kind: 'example'; lead: string; kobun?: string; modern?: string }
  /** 意味マップ（2つ以上あるときだけ）。決め手があれば各意味の見分け方も（2026-11-15） */
  | { side: 'teacher'; kind: 'senses'; items: SenseMapItem[] }
  /** UI が ○× ボタンを描く */
  | { side: 'teacher'; kind: 'selfJudge'; text: string }
  | { side: 'teacher'; kind: 'text'; text: string };

/**
 * 意味マップの1行（2026-11-15 ユーザー承認「見分け方を単語クイズの解答後に」）。
 * rule＝その意味の決め手（kobunQ v2 の decider.rule）、clue＝手がかり（今の意味だけ）、type＝決め手の型の札（見本の語だけ）、
 * chosen＝生徒が選んだ／書いた意味が同じ語の別の意味だったとき。どれもデータに無ければ付けない。
 */
export type SenseMapItem = {
  label: string;
  current: boolean;
  chosen?: boolean;
  rule?: string;
  clue?: string;
  type?: string;
};

/** 意味マップに渡す、同じ見出し語の意味1つ */
export type SiblingSense = { label: string; current: boolean; qid?: string; rule?: string; clue?: string; type?: string };

export type ThreadInput = {
  teacher: TeacherId;
  word: Word;
  quizType: WordQuizKind;
  // 4択系
  selected?: Word | null;
  isCorrect?: boolean | null;
  // 記述
  userAnswer?: string;
  writingResult?: WritingJudgeResult | null;
  writingUserJudgment?: boolean;
  /** other_sense のとき、書いてしまった意味の表示名（senseLabel(matched)） */
  matchedSense?: string;
  /** 同じ見出し語の意味の一覧（現在の意味に current）。単義語は []。qid・決め手があれば見分け方も出す */
  siblings?: SiblingSense[];
  exampleKobun?: string;
  exampleModern?: string;
  /** 選択肢に出した文字（例文の訳の活用に合わせたもの）。自分の吹き出しも同じ文字にする */
  optionLabels?: Record<string, string>;
  /** variant を決める種（qid） */
  seed: string;
  /** false なら先生の口調（キャラの台詞）を使わず、中立の文（NEUTRAL_LINES）で答え合わせする。既定 true */
  voice?: boolean;
};

export const NO_ANSWER_LABEL = '（無回答）';

/** 意味の注記の「補助」「補助動詞」を、品詞分解の略記「補動」にそろえて表示する（2026-11-02 ユーザー指示。データは変えない） */
export function auxShort(label: string): string {
  return label.replace(/補助動詞/g, '補動').replace(/（補助）/g, '（補動）').replace(/・補助）/g, '・補動）');
}

/**
 * 選択肢・自分の吹き出しに出す文字。word-reverse / blank-fill は見出し語、それ以外は辞書の形（senseNorm）。
 * 訳の穴の断片（sense の 〔 〕）は最初の例文の活用形のままなので、別の例文で出すと形が合わない
 * （をかし 15-2「始め終りこそをかしけれ」に「おもしろく」。2026-11-05 ユーザー指摘）。senseNorm が無いもの（罠の疑似選択肢など）は断片。
 */
export function optionLabel(w: Word, quizType: WordQuizKind): string {
  if (quizType === 'word-reverse' || quizType === 'blank-fill') return w.lemma || 'データなし';
  if (w.senseNorm) return auxShort(w.senseNorm);
  return stripSenseBrackets(w.sense || '') || 'データなし';
}

type Outcome = { verdict: ChatVerdict; lineKey: keyof TeacherLines; vars: TeacherVars };

// 判定の種類と、判定の吹き出しに使う台詞の鍵・変数を決める
function decideOutcome(input: ThreadInput): Outcome {
  const { word, quizType } = input;
  if (quizType !== 'meaning-writing') {
    // 先生が言う「正解」は辞書の形（senseNorm。例「気づく」）。選択肢の表示は訳の穴の断片（「気づい」）のことがあり、
    // 文に入れると不自然になるため。見出し語を答える形式（word-reverse / blank-fill）はそのまま見出し語。
    const answer = quizType === 'word-reverse' || quizType === 'blank-fill' ? optionLabel(word, quizType) : auxShort(senseLabel(word));
    const vars: TeacherVars = { 語: word.lemma, 正解: answer };
    const ok = input.isCorrect ?? (input.selected ? input.selected.qid === word.qid : false);
    return ok ? { verdict: 'ok', lineKey: 'correct', vars } : { verdict: 'ng', lineKey: 'wrong', vars };
  }
  const vars: TeacherVars = { 語: word.lemma, 正解: auxShort(senseLabel(word)) };
  switch (input.writingResult?.verdict ?? 'pending') {
    case 'correct':
      return { verdict: 'ok', lineKey: 'correct', vars };
    case 'other_sense':
      return {
        verdict: 'near',
        lineKey: 'nearMiss',
        vars: { ...vars, 書いた意味: input.matchedSense ?? input.userAnswer ?? '' },
      };
    case 'modern_trap':
      return {
        verdict: 'near',
        lineKey: 'trap',
        vars: { ...vars, 現代語: word.trap?.modern ?? input.userAnswer ?? '' },
      };
    case 'wrong':
      return { verdict: 'ng', lineKey: 'wrong', vars };
    case 'blank':
      return { verdict: 'ng', lineKey: 'blank', vars };
    default:
      return { verdict: 'pending', lineKey: 'pending', vars };
  }
}

/**
 * 生徒が選んだ／書いた意味が、同じ語の別の意味だったときの qid。
 * 意味を答える形式（word-meaning・sentence-meaning）は選んだ選択肢、記述は「別の意味」と判定された意味（表示名で照合）。
 * 見出し語を答える形式（word-reverse・blank-fill）は意味を選んでいないので付けない。
 */
function chosenSiblingQid(input: ThreadInput, verdict: ChatVerdict, siblings: SiblingSense[]): string | undefined {
  if (verdict === 'ok') return undefined;
  if (input.quizType === 'word-meaning' || input.quizType === 'sentence-meaning') {
    const q = input.selected?.qid;
    return q && q !== input.word.qid && siblings.some((s) => s.qid === q) ? q : undefined;
  }
  if (input.quizType === 'meaning-writing' && input.writingResult?.verdict === 'other_sense' && input.matchedSense) {
    return siblings.find((s) => !s.current && s.label === input.matchedSense)?.qid;
  }
  return undefined;
}

export function buildThread(input: ThreadInput): { bubbles: ChatBubble[]; canAdvance: boolean } {
  const { word, quizType, seed } = input;
  const lines = input.voice === false ? NEUTRAL_LINES : (TEACHER_LINES[input.teacher] ?? TEACHER_LINES.sei);
  const say = (key: keyof TeacherLines, vars: TeacherVars): string =>
    fillTemplate(pickVariant(lines[key], `${seed}:${key}`), vars);
  const isWriting = quizType === 'meaning-writing';
  const bubbles: ChatBubble[] = [];

  // 1. 自分の答え
  const myText = isWriting
    ? input.userAnswer && input.userAnswer.trim() ? input.userAnswer : NO_ANSWER_LABEL
    : input.selected ? (input.optionLabels?.[input.selected.qid] ?? optionLabel(input.selected, quizType)) : NO_ANSWER_LABEL;
  bubbles.push({ side: 'me', kind: 'answer', text: myText });

  // 2. 判定（保留で自己判定が決まったら、その後ろに selfRight / selfWrong）
  const outcome = decideOutcome(input);
  bubbles.push({ side: 'teacher', kind: 'verdict', text: say(outcome.lineKey, outcome.vars), verdict: outcome.verdict });
  if (outcome.verdict === 'pending' && typeof input.writingUserJudgment === 'boolean') {
    bubbles.push({
      side: 'teacher',
      kind: 'text',
      text: say(input.writingUserJudgment ? 'selfRight' : 'selfWrong', outcome.vars),
    });
  }

  // 3. 正解の示し方（記述で正解以外。保留も含む）
  if (isWriting && outcome.verdict !== 'ok') bubbles.push({ side: 'teacher', kind: 'answerGuide' });

  // 4. 自己判定（記述の保留で、まだ決めていないとき）
  const needsSelfJudge = isWriting && outcome.verdict === 'pending' && input.writingUserJudgment === undefined;
  if (needsSelfJudge) bubbles.push({ side: 'teacher', kind: 'selfJudge', text: selfJudgePrompt(word) });

  // 正解以外（保留も含む）は解説を厚くする。保留は自己判定の前後で吹き出しが減らないように、判定後も同じ扱い
  const miss = outcome.verdict !== 'ok';
  const siblings = input.siblings ?? [];
  // 意味マップに今の意味の決め手が載るときは、核イメージの 🔑 は出さない（同じ文を2か所に出さない）
  const mapHasRule = siblings.length >= 2 && siblings.some((s) => s.current && s.rule);

  // 5. 核イメージ（正解のときは罠も1吹き出しに畳む）
  if (word.senseCore) {
    bubbles.push({
      side: 'teacher',
      kind: 'core',
      lead: say('coreLead', outcome.vars),
      lemma: word.lemma,
      core: word.senseCore,
      ...(miss && word.decider && !mapHasRule ? { decider: { clue: word.decider.clue, rule: word.decider.rule } } : {}),
      ...(!miss && word.trap?.modern ? { trapModern: word.trap.modern } : {}),
    });
  }

  // 6. 罠
  if (miss && word.trap) {
    bubbles.push({
      side: 'teacher',
      kind: 'trap',
      lead: say('trapLead', outcome.vars),
      modern: word.trap.modern,
      ...(word.trap.note ? { note: word.trap.note } : {}),
    });
  }

  // 7. 例文（4択系の正解以外。sentence-meaning は本文が上のカードに出ているので訳だけ。記述は上の例文カードが訳を出す）
  if (miss && !isWriting) {
    const lead = say('exampleLead', outcome.vars);
    const fallback = word.examples?.[0];
    const kobun = input.exampleKobun || fallback?.jp || undefined;
    // 単語データの訳は先頭に「（訳）」が付いている。吹き出しは「訳：」「→」を自分で付けるので外す（2026-11-04）
    const rawModern = input.exampleModern ?? (input.exampleKobun ? undefined : fallback?.translation);
    const modern = rawModern?.replace(/^\s*[（(]訳[）)]\s*/, '') || undefined;
    if (quizType === 'sentence-meaning') {
      if (modern) bubbles.push({ side: 'teacher', kind: 'example', lead, modern });
    } else if (kobun || modern) {
      bubbles.push({
        side: 'teacher',
        kind: 'example',
        lead,
        ...(kobun ? { kobun } : {}),
        ...(modern ? { modern } : {}),
      });
    }
  }

  // 8. 意味マップ（2つ以上あるときだけ）。正解でも出す（ほかの意味も見る方が学習になる。2026-11-02 ユーザー指示）
  //    決め手があれば各意味の見分け方を添え、選んだ意味が同じ語の別の意味なら印を付ける（2026-11-15）
  if (siblings.length >= 2) {
    const chosenQid = chosenSiblingQid(input, outcome.verdict, siblings);
    bubbles.push({
      side: 'teacher',
      kind: 'senses',
      items: siblings.map((s) => {
        const item: SenseMapItem = { label: auxShort(s.label), current: s.current };
        if (chosenQid && s.qid === chosenQid) item.chosen = true;
        if (s.rule) item.rule = s.rule;
        if (s.rule && s.current && s.clue) item.clue = s.clue;
        if (s.rule && s.type) item.type = s.type;
        return item;
      }),
    });
  }

  return { bubbles, canAdvance: !needsSelfJudge };
}
