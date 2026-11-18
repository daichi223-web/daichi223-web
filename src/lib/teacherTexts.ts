import { workTeacherOf } from './workTeachers';
import type { TeacherId } from './teachers';

// まだ手に入れていない教材の先生（🔒）をタップしたとき、その先生が出る教材の読解テストへ飛ぶ（2026-11-18 ユーザー指示
// 「ロックされている画像をタップするとその教材の問題に飛ぶようにできる？」）。
// 飛び先は、その先生が答え合わせをする教材のうち、公開中で索引のいちばん前のもの。公開中のものが無ければ飛ばない。

export type TeacherTextRow = { id: string; source?: string | null };

/** その先生が答え合わせをする教材（索引の順） */
export function textsOfTeacher(id: TeacherId, rows: readonly TeacherTextRow[]): string[] {
  return rows.filter((r) => workTeacherOf(r.id, r.source) === id).map((r) => r.id);
}

/**
 * 🔒の先生の飛び先の教材ID。published が null（公開の表が読めない）のときは、すべて公開とみなす
 * （getPublishedSlugs と同じ扱い）。公開中の教材が無ければ null。
 */
export function unlockTextOf(id: TeacherId, rows: readonly TeacherTextRow[], published: ReadonlySet<string> | null): string | null {
  const ids = textsOfTeacher(id, rows);
  return ids.find((t) => !published || published.has(t)) ?? null;
}

/** 読解テストの URL */
export function readingTestPath(textId: string): string {
  return `/read/texts/${encodeURIComponent(textId)}/test`;
}
