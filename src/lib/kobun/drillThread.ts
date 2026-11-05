import type { GrammarDrill } from './types';
import type { Word } from '../../types';
import type { ChatBubble } from '../quiz/chatThread';
import { fillTemplate, pickVariant, type TeacherId, type TeacherLines } from '../teachers';
import { TEACHER_LINES, NEUTRAL_LINES } from '../teacherLines';

/**
 * 文法ドリルの答え合わせ（ChatFeedback に渡す吹き出し）を組む純関数（2026-11-06。文法道場の見直し ⑤）。
 * 単語クイズ（lib/quiz/chatThread.ts）・読解テスト（readingThread）と同じ部品で出すためのもの。
 * 吹き出しは3種類だけ：自分の答え → 判定（正解。／正しくは「〜」。）→ 解説の文（explanation）。
 * DOM・画面に触れない（vitest の node 環境で検査する）。
 */

export const DRILL_NO_ANSWER = '（無回答）';

export function isDrillAnswerCorrect(drill: GrammarDrill, choice: string): boolean {
  const a = drill.answer;
  return Array.isArray(a) ? a.includes(choice) : a === choice;
}

/** 判定の吹き出しに入れる正解。正解が複数ある問題は、選択肢に出ているものを「／」でつなぐ */
export function drillAnswerLabel(drill: GrammarDrill): string {
  const all = Array.isArray(drill.answer) ? drill.answer : [drill.answer];
  const shown = drill.choices?.length ? all.filter((a) => drill.choices!.includes(a)) : all;
  return (shown.length ? shown : all).join('／');
}

/** 問われている語（例文の【 】の中）。無ければ空 */
function targetOf(drill: GrammarDrill): string {
  return /【([^】]*)】/.exec(drill.context ?? '')?.[1] ?? '';
}

/** ChatFeedback は単語の1行（word）を受け取る作りなので、文法ドリル用に見出しだけの仮の語を渡す（読解テストの feedbackWord と同じ） */
export function drillFeedbackWord(drill: GrammarDrill): Word {
  return { qid: drill.id, lemma: targetOf(drill), sense: '', meaning_idx: 0, group: 0, examples: [] };
}

export function drillThread(
  drill: GrammarDrill,
  chosen: string | null,
  opts: { teacher: TeacherId; voice: boolean },
): ChatBubble[] {
  const lines: TeacherLines = opts.voice ? (TEACHER_LINES[opts.teacher] ?? TEACHER_LINES.sei) : NEUTRAL_LINES;
  const ok = chosen !== null && isDrillAnswerCorrect(drill, chosen);
  const key: keyof TeacherLines = ok ? 'correct' : 'wrong';
  const say = fillTemplate(pickVariant(lines[key], `drill:${drill.id}:${key}`), {
    語: targetOf(drill),
    正解: drillAnswerLabel(drill),
  });
  const bubbles: ChatBubble[] = [
    { side: 'me', kind: 'answer', text: chosen ?? DRILL_NO_ANSWER },
    { side: 'teacher', kind: 'verdict', text: say, verdict: ok ? 'ok' : 'ng' },
  ];
  const explanation = drill.explanation?.trim();
  if (explanation) bubbles.push({ side: 'teacher', kind: 'text', text: explanation });
  return bubbles;
}
