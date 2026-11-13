import { useEffect, useState } from 'react';
import { isTeacherArt, type TeacherArt } from './teachers';

// 先生の絵の種類の選択（端末ごと）。chatTeacher.ts と同じ型：
// 許可リストで検証して読む・書いたら CustomEvent で同一タブに知らせる・フックは storage と CustomEvent を購読する。
// 'same' ＝ 肖像の雰囲気（portraitTone）と同じ絵（既定。今までの見た目のまま）／'anime' ＝ アニメ調（絵がある先生だけ）。
// キーは storageKeys.ts の「表示設定」区画に登録済み（Export/Import の対象）。

export const CHAT_TEACHER_ART_KEY = 'kobun.chat.teacherArt';
const CHANGE_EVENT = 'kobun:chat-teacher-art-change';
const DEFAULT_ART: TeacherArt = 'same';

export function readTeacherArt(): TeacherArt {
  try {
    const value = localStorage.getItem(CHAT_TEACHER_ART_KEY);
    return isTeacherArt(value) ? value : DEFAULT_ART;
  } catch {
    return DEFAULT_ART;
  }
}

export function writeTeacherArt(art: TeacherArt): void {
  try {
    localStorage.setItem(CHAT_TEACHER_ART_KEY, art);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: art }));
  } catch {
    /* noop */
  }
}

export function useTeacherArt(): [TeacherArt, (art: TeacherArt) => void] {
  const [art, setArt] = useState<TeacherArt>(readTeacherArt);

  useEffect(() => {
    const sync = (event: Event) => {
      const custom = event as CustomEvent<unknown>;
      setArt(isTeacherArt(custom.detail) ? custom.detail : readTeacherArt());
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return [art, writeTeacherArt];
}
