// 教材の先生を手に入れる条件（2026-11-19 ユーザー指示「教材のクイズを全部解かないと手に入らないようにして」）。
// その教材の読解テストの**全部の分類**（助動詞・助詞｜単語｜訳・読解 など。readingTest.ts の availableGroups）を、
// それぞれ8割以上（isReadingTestCleared）で解いたら手に入る。分類ごとに別の回に解いてもよく、「全部まとめて」で一度に解いてもよい。
// 解いた分類は端末に覚える（kobun.readtest.cleared＝{ 教材ID: 分類ID[] }）。すでに手に入れた先生はそのまま。

export const READTEST_CLEARED_KEY = 'kobun.readtest.cleared';

/** 分類の無い教材（分類が1つ以下で選ぶ画面を出さない教材）を「全部まとめて」解いたときの印 */
export const ALL_GROUPS = 'all';

function readAll(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(READTEST_CLEARED_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/** その教材で8割以上を取った分類 */
export function readClearedGroups(textId: string): string[] {
  const v = readAll()[textId];
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

/** 8割以上を取った分類を足して、足したあとの一覧を返す */
export function recordClearedGroups(textId: string, groupIds: readonly string[]): string[] {
  const all = readAll();
  const next = [...new Set([...(Array.isArray(all[textId]) ? all[textId] : []), ...groupIds])];
  try {
    localStorage.setItem(READTEST_CLEARED_KEY, JSON.stringify({ ...all, [textId]: next }));
  } catch {
    /* 覚えられなくても、その回の判定は返す */
  }
  return next;
}

/**
 * まだ8割以上を取っていない分類。available はその教材の分類（availableGroups の id）。
 * 分類が無い教材（available が空）は ALL_GROUPS だけを見る。
 */
export function remainingGroups(available: readonly string[], cleared: readonly string[]): string[] {
  if (cleared.includes(ALL_GROUPS)) return [];
  if (available.length === 0) return [ALL_GROUPS];
  return available.filter((id) => !cleared.includes(id));
}

/** 今回の回で8割以上を取ったときに足す分類（分類を選んだ回はその分類、全部まとめての回は全部） */
export function groupsOfRun(groupId: string | null, available: readonly string[]): string[] {
  if (groupId) return [groupId];
  return available.length ? [...available] : [ALL_GROUPS];
}
