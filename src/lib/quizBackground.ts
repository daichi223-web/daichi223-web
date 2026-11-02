import { useEffect, useState } from 'react';

// 単語クイズ画面の和柄の背景（端末ごと）。portraitTone.ts / chatTeacher.ts と同じ型。
// 描くのは src/components/quiz/QuizBackground.tsx（インライン SVG の pattern。色は --rw-* の CSS 変数）。
// キーは storageKeys.ts の「表示設定」区画に登録済み（Export/Import の対象）。

export type QuizBackgroundId = 'seigaiha' | 'shippo';

export const QUIZ_BACKGROUND_IDS: readonly QuizBackgroundId[] = ['seigaiha', 'shippo'];

/** 設定画面に出す名前 */
export const QUIZ_BACKGROUND_LABEL: Record<QuizBackgroundId, string> = {
  seigaiha: '青海波',
  shippo: '七宝',
};

export const QUIZ_BACKGROUND_KEY = 'kobun.chat.background';
const CHANGE_EVENT = 'kobun:chat-background-change';
const DEFAULT_BACKGROUND: QuizBackgroundId = 'seigaiha';

export function isQuizBackgroundId(v: unknown): v is QuizBackgroundId {
  return typeof v === 'string' && (QUIZ_BACKGROUND_IDS as readonly string[]).includes(v);
}

export function readQuizBackground(): QuizBackgroundId {
  try {
    const value = localStorage.getItem(QUIZ_BACKGROUND_KEY);
    return isQuizBackgroundId(value) ? value : DEFAULT_BACKGROUND;
  } catch {
    return DEFAULT_BACKGROUND;
  }
}

export function writeQuizBackground(id: QuizBackgroundId): void {
  try {
    localStorage.setItem(QUIZ_BACKGROUND_KEY, id);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
  } catch {
    /* noop */
  }
}

export function useQuizBackground(): [QuizBackgroundId, (id: QuizBackgroundId) => void] {
  const [background, setBackground] = useState<QuizBackgroundId>(readQuizBackground);

  useEffect(() => {
    const sync = (event: Event) => {
      const custom = event as CustomEvent<unknown>;
      setBackground(isQuizBackgroundId(custom.detail) ? custom.detail : readQuizBackground());
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return [background, writeQuizBackground];
}
