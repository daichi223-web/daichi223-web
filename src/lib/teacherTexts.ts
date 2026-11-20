import { COMPANIONS, GROWN_UP, workTeacherOf } from './workTeachers';
import type { GuestTeacherId, TeacherId } from './teachers';

// まだ手に入れていない教材の先生（🔒）をタップしたとき、その先生が出る教材の読解テストへ飛ぶ（2026-11-18 ユーザー指示
// 「ロックされている画像をタップするとその教材の問題に飛ぶようにできる？」）。
// 飛び先は、その先生が答え合わせをする教材のうち、公開中で索引のいちばん前のもの。公開中のものが無ければ飛ばない。
// 一緒に加わる先生（中の君）は、姉の教材へ。育って加わる先生（紫の上）は、若紫がまだなら若紫の教材へ、
// 若紫を手に入れていれば源氏物語のほかの教材へ（2026-11-19。workTeachers.ts の COMPANIONS・GROWN_UP）。

export type TeacherTextRow = { id: string; source?: string | null };

/** その先生が答え合わせをする教材（索引の順）。unlocked は手に入れた先生（育って加わる先生の飛び先を決める） */
export function textsOfTeacher(id: TeacherId, rows: readonly TeacherTextRow[], unlocked: readonly GuestTeacherId[] = []): string[] {
  const leader = (Object.keys(COMPANIONS) as GuestTeacherId[]).find((k) => COMPANIONS[k]?.includes(id as GuestTeacherId));
  if (leader) return textsOfTeacher(leader, rows, unlocked);
  if (id === GROWN_UP.to) {
    if (!unlocked.includes(GROWN_UP.from)) return textsOfTeacher(GROWN_UP.from, rows, unlocked);
    const works: readonly string[] = GROWN_UP.works;
    return rows
      .filter((r) => r.source && works.includes(r.source) && workTeacherOf(r.id, r.source) !== GROWN_UP.from)
      .map((r) => r.id);
  }
  return rows.filter((r) => workTeacherOf(r.id, r.source) === id).map((r) => r.id);
}

/**
 * 🔒の先生の飛び先の教材ID。published が null（公開の表が読めない）のときは、すべて公開とみなす
 * （getPublishedSlugs と同じ扱い）。公開中の教材が無ければ null。
 */
export function unlockTextOf(
  id: TeacherId,
  rows: readonly TeacherTextRow[],
  published: ReadonlySet<string> | null,
  unlocked: readonly GuestTeacherId[] = [],
): string | null {
  const ids = textsOfTeacher(id, rows, unlocked);
  return ids.find((t) => !published || published.has(t)) ?? null;
}

/** 読解テストの URL */
export function readingTestPath(textId: string): string {
  return `/read/texts/${encodeURIComponent(textId)}/test`;
}
