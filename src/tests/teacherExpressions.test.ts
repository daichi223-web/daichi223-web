import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEACHER_IDS, TEACHER_EXPRESSION_TONES, expressionForVerdict, teacherImage } from '../lib/teachers';

const dir = fileURLToPath(new URL('../../public/teachers/', import.meta.url));

describe('先生の表情差分（うれしい・はげまし）', () => {
  it('判定 → 表情：正解はうれしい、不正解ははげまし、判定なしはふつう', () => {
    expect(expressionForVerdict('ok')).toBe('joy');
    expect(expressionForVerdict('ng')).toBe('cheer');
    expect(expressionForVerdict(undefined)).toBe('base');
  });

  it('表情差分があると書いた画風の絵は、全員ぶん public/teachers に実在する', () => {
    const missing: string[] = [];
    for (const id of ALL_TEACHER_IDS) {
      for (const tone of TEACHER_EXPRESSION_TONES[id] ?? []) {
        for (const e of ['joy', 'cheer'] as const) {
          const src = teacherImage(id, tone, e);
          expect(src).toBe(`/teachers/${id}-${tone}-${e}.webp`);
          if (!existsSync(join(dir, src.replace('/teachers/', '')))) missing.push(src);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('表情差分の無い画風・ふつうの顔は今までの1枚（みやびは anime）', () => {
    expect(teacherImage('sei', 'sharp', 'joy')).toBe('/teachers/sei-sharp.webp');
    expect(teacherImage('sei', 'yuru', 'base')).toBe('/teachers/sei-yuru.webp');
    expect(teacherImage('sei', 'miyabi', 'cheer')).toBe('/teachers/sei-anime.webp');
  });
});
