import { useEffect, useState } from 'react';
import { isTeacherId, type TeacherId } from './teachers';
import { isGuest } from './guest';

// 答え合わせの先生の選択（端末ごと）。portraitTone.ts と同じ型：
// 文字列を許可リストで検証して読む・書いたら CustomEvent で同一タブに知らせる・フックは storage と CustomEvent を購読する。
// キーは storageKeys.ts の「表示設定」区画に登録済み（Export/Import の対象）。

export const CHAT_TEACHER_KEY = 'kobun.chat.teacher';
const CHANGE_EVENT = 'kobun:chat-teacher-change';
const DEFAULT_TEACHER: TeacherId = 'sei';
// お試し（ゲスト）の端末の既定は菅原道真（2026-11-13 ユーザー指示）。自分で選んだ先生があればそちらが優先
const GUEST_DEFAULT_TEACHER: TeacherId = 'michizane';
const defaultTeacher = (): TeacherId => (isGuest() ? GUEST_DEFAULT_TEACHER : DEFAULT_TEACHER);

export function readChatTeacher(): TeacherId {
  try {
    const value = localStorage.getItem(CHAT_TEACHER_KEY);
    return isTeacherId(value) ? value : defaultTeacher();
  } catch {
    return defaultTeacher();
  }
}

export function writeChatTeacher(id: TeacherId): void {
  try {
    localStorage.setItem(CHAT_TEACHER_KEY, id);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
  } catch {
    /* noop */
  }
}

export function useChatTeacher(): [TeacherId, (id: TeacherId) => void] {
  const [teacher, setTeacher] = useState<TeacherId>(readChatTeacher);

  useEffect(() => {
    const sync = (event: Event) => {
      const custom = event as CustomEvent<unknown>;
      setTeacher(isTeacherId(custom.detail) ? custom.detail : readChatTeacher());
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return [teacher, writeChatTeacher];
}
