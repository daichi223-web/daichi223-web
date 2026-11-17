import { useEffect, useState } from 'react';
import { GUEST_TEACHER_IDS, type GuestTeacherId, type TeacherId } from './teachers';

// 教材ごとの先生（2026-11-17 ユーザー指示「竹取物語の問題の先生はかぐや姫に」「土佐日記は紀貫之、伊勢物語は業平…今ある作品ごとに」）。
// 読解テストでは、選んでいる先生より、ここで決まる教材の先生を優先して出す。決まっていない教材は選んでいる先生のまま。
// 案の一覧（作品内の人物・作者。第2段以降の人を含む）= F:\A2A\_work\work-teachers\README.md。
// ここに書くのは、絵と台詞がそろって TeacherId になった先生だけ（まだの人は書かない＝選んでいる先生のまま）。
// 例：無名草子は俊成卿女（2026-11-17 ユーザー指示）。まだ作っていないので書いていない。

/** 作品名（texts-v3 の source ＝ 索引の source_work）→ 先生 */
export const BY_WORK: Readonly<Record<string, TeacherId>> = {
  '竹取物語': 'kaguya',
  '伊勢物語': 'narihira',
  '土佐日記': 'tsurayuki',
  '古今和歌集仮名序': 'tsurayuki',
  '枕草子（一）': 'sei',
  '枕草子（二）': 'sei',
  '紫式部日記': 'murasaki',
  '和泉式部日記': 'izumi',
  '建礼門院右京大夫集': 'ukyo',
  '毎月抄': 'teika',
  // 源氏物語は1本ごとに作中の人物にする予定（第2段）。それまでは作者の紫式部。
  '源氏物語（一）': 'murasaki',
  '源氏物語（二）': 'murasaki',
};

/** 教材ID → 先生（作品より優先。作品名の無い和歌の教材や、1本だけ別の人にする教材） */
export const BY_TEXT: Readonly<Record<string, TeacherId>> = {
  b34f00e739: 'michizane', // 大鏡「菅公配流」
  faa890f809: 'teika', // 中世の歌
  f0740d6350: 'komachi', // 王朝の歌
};

/** この教材の先生。決まっていなければ null（選んでいる先生のまま） */
export function workTeacherOf(textId: string, source: string | null | undefined): TeacherId | null {
  return BY_TEXT[textId] ?? (source ? BY_WORK[source] : undefined) ?? null;
}

// ── 教材をクリアすると、その教材の先生が手に入る（2026-11-17 ユーザー指示） ──
// 手に入るのは、はじめから選べる10人以外（GUEST_TEACHER_IDS）。端末ごと（先生の選択と同じ）。
// クリア＝読解テストを最後まで解いて、正解が8割以上（3問以上のとき）。分類を選んで解いた回でもよい。

export const UNLOCKED_TEACHERS_KEY = 'kobun.chat.unlockedTeachers';
const UNLOCK_EVENT = 'kobun:unlocked-teachers-change';
export const CLEAR_RATE = 0.8;
export const CLEAR_MIN_QUESTIONS = 3;

export function isGuestTeacherId(v: unknown): v is GuestTeacherId {
  return typeof v === 'string' && (GUEST_TEACHER_IDS as readonly string[]).includes(v);
}

export function isReadingTestCleared(correct: number, total: number): boolean {
  return total >= CLEAR_MIN_QUESTIONS && correct >= Math.ceil(total * CLEAR_RATE);
}

export function readUnlockedTeachers(): GuestTeacherId[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_TEACHERS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? GUEST_TEACHER_IDS.filter((id) => list.includes(id)) : [];
  } catch {
    return [];
  }
}

export function isTeacherUnlocked(id: TeacherId): boolean {
  return !isGuestTeacherId(id) || readUnlockedTeachers().includes(id);
}

/** 手に入れる。新しく手に入ったときだけ true */
export function unlockTeacher(id: TeacherId): boolean {
  if (!isGuestTeacherId(id)) return false;
  const now = readUnlockedTeachers();
  if (now.includes(id)) return false;
  try {
    localStorage.setItem(UNLOCKED_TEACHERS_KEY, JSON.stringify([...now, id]));
    window.dispatchEvent(new CustomEvent(UNLOCK_EVENT));
  } catch {
    return false;
  }
  return true;
}

/** どの教材をクリアすると手に入るか（設定欄の鍵つきの先生に出す） */
export const GUEST_UNLOCK_HINT: Readonly<Record<GuestTeacherId, string>> = {
  kaguya: '竹取物語の読解テストをクリア',
};

export function useUnlockedTeachers(): GuestTeacherId[] {
  const [list, setList] = useState<GuestTeacherId[]>(readUnlockedTeachers);
  useEffect(() => {
    const sync = () => setList(readUnlockedTeachers());
    window.addEventListener('storage', sync);
    window.addEventListener(UNLOCK_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(UNLOCK_EVENT, sync);
    };
  }, []);
  return list;
}
