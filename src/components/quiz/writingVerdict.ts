import type { Word } from '../../types';
import { describeNorm, type WritingJudgeResult } from '../../lib/writingJudge';

/** 意味の表示名（辞書形があればそれ、なければ穴埋め断片の中身） */
export const senseLabel = (w: Word): string => {
  if (w.senseNorm) return w.senseNorm;
  const m = w.sense.match(/〔\s*(.+?)\s*〕/);
  return m ? m[1].trim() : w.sense;
};

// 記述の入力欄の文言。どこまで書けばよいか（語義をひとこと。活用・敬語の形は見ない）を伝える
export function writingPrompt(lemma: string, hasExample: boolean): { label: string; note: string; placeholder: string } {
  return {
    label: hasExample ? `この文での「${lemma}」の意味を、ひとことで` : `「${lemma}」の意味を、ひとことで`,
    note: '活用や敬語の形は問いません',
    placeholder: '意味をひとことで',
  };
}

// 自己判定の文言。正解の言い方が複数あるときは「どれか1つ」でよいと伝える
export function selfJudgePrompt(w: Word): string {
  return describeNorm(w.senseNorm).options.length > 1
    ? '正解のどれか1つと同じ意味なら ○。活用のちがいは気にしない'
    : '正解と同じ意味なら ○。活用のちがいは気にしない';
}

// 記述の判定の見出し。点数ではなく「どの意味で読んだか」を伝える
export function writingHeadline(result: WritingJudgeResult): { mark: string; text: string; color: string } {
  switch (result.verdict) {
    case 'correct':
      return { mark: '○', text: '正解', color: 'var(--rw-accent)' };
    case 'other_sense':
      return { mark: '△', text: '別の意味で読んでいます', color: 'var(--rw-pop)' };
    case 'modern_trap':
      return { mark: '△', text: '現代語の意味で読んでいます', color: 'var(--rw-pop)' };
    case 'wrong':
      return { mark: '×', text: 'この文脈の意味ではありません', color: 'var(--rw-primary)' };
    case 'blank':
      return { mark: '×', text: '答えが書かれていません', color: 'var(--rw-primary)' };
    default:
      return result.partial
        ? { mark: '？', text: '正解と一部が重なっています', color: 'var(--rw-ink-soft)' }
        : { mark: '？', text: '自動では判定できませんでした', color: 'var(--rw-ink-soft)' };
  }
}
