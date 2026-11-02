import { useEffect, useState } from 'react';

// 単語クイズ画面の和柄の背景（端末ごと）。portraitTone.ts / chatTeacher.ts と同じ型。
// 描くのは src/components/quiz/QuizBackground.tsx（インライン SVG の pattern。色は --rw-* の CSS 変数）。
// キーは storageKeys.ts の「表示設定」区画に登録済み（Export/Import の対象）。

export type QuizBackgroundId = 'seigaiha' | 'shippo' | 'asanoha' | 'kikko' | 'ichimatsu' | 'uroko' | 'yagasuri';

export const QUIZ_BACKGROUND_IDS: readonly QuizBackgroundId[] = ['seigaiha', 'shippo', 'asanoha', 'kikko', 'ichimatsu', 'uroko', 'yagasuri'];

/** 設定画面に出す名前 */
export const QUIZ_BACKGROUND_LABEL: Record<QuizBackgroundId, string> = {
  seigaiha: '青海波',
  shippo: '七宝',
  asanoha: '麻の葉',
  kikko: '亀甲',
  ichimatsu: '市松',
  uroko: '鱗',
  yagasuri: '矢絣',
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

// ── 背景の色（2026-11-02 ユーザー指示「色も変えられてもいいかも」）。淡い地と線の組。文字が背景の上に直接乗るので濃い色は置かない
export type QuizBackgroundColorId = 'kinari' | 'sakura' | 'wakatake' | 'sora' | 'yamabuki' | 'fuji';

export const QUIZ_BACKGROUND_COLOR_IDS: readonly QuizBackgroundColorId[] = ['kinari', 'sakura', 'wakatake', 'sora', 'yamabuki', 'fuji'];

export const QUIZ_BACKGROUND_COLORS: Record<QuizBackgroundColorId, { label: string; bg: string; line: string }> = {
  kinari: { label: '生成り', bg: '#f6f1ea', line: '#e3dccf' },
  sakura: { label: '桜', bg: '#f8ecee', line: '#e6c4cb' },
  wakatake: { label: '若竹', bg: '#eef3ea', line: '#c9d9bf' },
  sora: { label: '空', bg: '#ebf1f5', line: '#c3d4e1' },
  yamabuki: { label: '山吹', bg: '#f8f1df', line: '#e3cf9c' },
  fuji: { label: '藤', bg: '#f0edf5', line: '#d2c8e3' },
};

export const QUIZ_BACKGROUND_COLOR_KEY = 'kobun.chat.backgroundColor';
const COLOR_EVENT = 'kobun:chat-background-color-change';

export function isQuizBackgroundColorId(v: unknown): v is QuizBackgroundColorId {
  return typeof v === 'string' && (QUIZ_BACKGROUND_COLOR_IDS as readonly string[]).includes(v);
}

export function readQuizBackgroundColor(): QuizBackgroundColorId {
  try {
    const value = localStorage.getItem(QUIZ_BACKGROUND_COLOR_KEY);
    return isQuizBackgroundColorId(value) ? value : 'kinari';
  } catch {
    return 'kinari';
  }
}

export function writeQuizBackgroundColor(id: QuizBackgroundColorId): void {
  try {
    localStorage.setItem(QUIZ_BACKGROUND_COLOR_KEY, id);
    window.dispatchEvent(new CustomEvent(COLOR_EVENT, { detail: id }));
  } catch {
    /* noop */
  }
}

export function useQuizBackgroundColor(): [QuizBackgroundColorId, (id: QuizBackgroundColorId) => void] {
  const [color, setColor] = useState<QuizBackgroundColorId>(readQuizBackgroundColor);
  useEffect(() => {
    const sync = (event: Event) => {
      const custom = event as CustomEvent<unknown>;
      setColor(isQuizBackgroundColorId(custom.detail) ? custom.detail : readQuizBackgroundColor());
    };
    window.addEventListener('storage', sync);
    window.addEventListener(COLOR_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(COLOR_EVENT, sync);
    };
  }, []);
  return [color, writeQuizBackgroundColor];
}
