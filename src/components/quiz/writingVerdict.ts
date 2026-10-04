import type { Word } from '../../types';
import type { WritingJudgeResult } from '../../lib/writingJudge';

/** 意味の表示名（辞書形があればそれ、なければ穴埋め断片の中身） */
export const senseLabel = (w: Word): string => {
  if (w.senseNorm) return w.senseNorm;
  const m = w.sense.match(/〔\s*(.+?)\s*〕/);
  return m ? m[1].trim() : w.sense;
};

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
