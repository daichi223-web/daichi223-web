import { describe, expect, it } from 'vitest';
import rows from '../data/textsV3Index.json';
import { readingTestPath, textsOfTeacher, unlockTextOf } from '../lib/teacherTexts';
import { GUEST_TEACHER_IDS } from '../lib/teachers';

const index = rows as { id: string; source?: string | null }[];

describe('🔒の先生の飛び先（teacherTexts）', () => {
  it('教材の先生は全員、答え合わせをする教材が1本以上ある', () => {
    for (const id of GUEST_TEACHER_IDS) expect(textsOfTeacher(id, index).length, id).toBeGreaterThan(0);
  });

  it('作品で決まる先生は、その作品の教材が索引の順で並ぶ（兼好法師＝徒然草）', () => {
    const ids = textsOfTeacher('kenko', index);
    expect(ids.length).toBeGreaterThan(1);
    const order = index.map((r) => r.id);
    expect([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(ids);
  });

  it('公開中の教材のうち、いちばん前へ飛ぶ。公開中が無ければ飛ばない', () => {
    const ids = textsOfTeacher('kenko', index);
    expect(unlockTextOf('kenko', index, new Set([ids[1]]))).toBe(ids[1]);
    expect(unlockTextOf('kenko', index, new Set())).toBeNull();
  });

  it('公開の表が読めない（null）ときは、すべて公開とみなす', () => {
    expect(unlockTextOf('kenko', index, null)).toBe(textsOfTeacher('kenko', index)[0]);
  });

  it('教材ID で決まる先生（大宅世継）は、その教材へ', () => {
    expect(unlockTextOf('yotsugi', index, new Set(['61ad02e1df']))).toBe('61ad02e1df');
  });

  it('読解テストの URL', () => {
    expect(readingTestPath('5954a8d9eb')).toBe('/read/texts/5954a8d9eb/test');
  });
});
