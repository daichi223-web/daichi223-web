import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TEACHERS, TEACHER_IDS, TEACHER_LINE_KEYS, TEACHER_VAR_NAMES, fillTemplate, isTeacherId, pickVariant, teacherImage,
  type TeacherLines,
} from '../lib/teachers';
import { TEACHER_LINES } from '../lib/teacherLines';

const TONES = ['sharp', 'yuru', 'pop'] as const;

// BRIEF-lines.md の決まり：字数は全角で数え、{変数} は 15 字として数える
const VAR_AS_15 = '＊'.repeat(15);
const length = (s: string): number => [...s.replace(/\{[^{}]*\}/g, VAR_AS_15)].length;

const LIMITS: Record<keyof TeacherLines, number> = {
  correct: 18, wrong: 40, trap: 45, nearMiss: 45, blank: 35, pending: 35,
  selfRight: 25, selfWrong: 25, coreLead: 8, exampleLead: 10, trapLead: 10,
};

const REQUIRED_VARS: Partial<Record<keyof TeacherLines, string[]>> = {
  wrong: ['正解'],
  trap: ['現代語', '正解'],
  nearMiss: ['書いた意味', '正解'],
  blank: ['正解'],
  pending: ['正解'],
};

const eachLine = (fn: (teacher: string, key: keyof TeacherLines, line: string) => void) => {
  for (const id of TEACHER_IDS) {
    for (const key of TEACHER_LINE_KEYS) {
      for (const line of TEACHER_LINES[id][key]) fn(id, key, line);
    }
  }
};

describe('TEACHERS（先生5人のデータ）', () => {
  it('5人の id・名前がそろい、isTeacherId が許可リストで判定する', () => {
    expect(TEACHER_IDS).toEqual(['sei', 'murasaki', 'michizane', 'tsurayuki', 'teika']);
    expect(Object.keys(TEACHERS).sort()).toEqual([...TEACHER_IDS].sort());
    expect(TEACHER_IDS.map((id) => TEACHERS[id].name)).toEqual(['清少納言', '紫式部', '菅原道真', '紀貫之', '藤原定家']);
    for (const id of TEACHER_IDS) {
      expect(TEACHERS[id].id).toBe(id);
      expect(TEACHERS[id].kana.length).toBeGreaterThan(0);
      expect(TEACHERS[id].title.length).toBeGreaterThan(0);
      expect([...TEACHERS[id].oneLiner].length).toBeLessThanOrEqual(25);
    }
    expect(isTeacherId('sei')).toBe(true);
    expect(isTeacherId('teika')).toBe(true);
    expect(isTeacherId('hakase')).toBe(false);
    expect(isTeacherId(null)).toBe(false);
    expect(isTeacherId(undefined)).toBe(false);
    expect(isTeacherId(3)).toBe(false);
  });

  it('先生の絵は /teachers/<id>-<tone>.webp', () => {
    expect(teacherImage('sei', 'sharp')).toBe('/teachers/sei-sharp.webp');
    expect(teacherImage('murasaki', 'pop')).toBe('/teachers/murasaki-pop.webp');
  });

  it('5人×3画風 = 15枚の絵が public/teachers に実在する', () => {
    const dir = fileURLToPath(new URL('../../public/teachers/', import.meta.url));
    const missing: string[] = [];
    for (const id of TEACHER_IDS) {
      for (const tone of TONES) {
        const file = `${id}-${tone}.webp`;
        expect(teacherImage(id, tone)).toBe(`/teachers/${file}`);
        if (!existsSync(join(dir, file))) missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('fillTemplate（台詞の変数を置き換える）', () => {
  it('{語}{正解}{現代語}{書いた意味} を置き換える', () => {
    const out = fillTemplate('「{語}」は「{正解}」。今の「{現代語}」ではない。書いたのは「{書いた意味}」。', {
      語: 'はづかし', 正解: '立派だ', 現代語: '恥ずかしい', 書いた意味: '気がひける',
    });
    expect(out).toBe('「はづかし」は「立派だ」。今の「恥ずかしい」ではない。書いたのは「気がひける」。');
  });

  it('渡していない変数・綴りちがいの変数は空文字にし、{ } を残さない', () => {
    const out = fillTemplate('{語}：{現代語}／{書いた意味}／{ない変数}', { 語: 'をかし', 正解: '趣がある' });
    expect(out).toBe('をかし：／／');
    expect(out).not.toMatch(/[{}]/);
  });

  it('変数の無い台詞はそのまま', () => {
    expect(fillTemplate('可。', { 語: 'a', 正解: 'b' })).toBe('可。');
  });
});

describe('pickVariant（variant を決定的に選ぶ）', () => {
  const list = ['甲', '乙', '丙'];

  it('同じ seed なら同じ結果で、必ず配列の中から選ぶ', () => {
    for (const seed of ['1-1:correct', '12-3:wrong', 'abc', '']) {
      const a = pickVariant(list, seed);
      expect(pickVariant(list, seed)).toBe(a);
      expect(list).toContain(a);
    }
  });

  it('seed が変わると選ばれる variant も散らばる', () => {
    const picked = new Set<string>();
    for (let i = 0; i < 60; i++) picked.add(pickVariant(list, `${i}-1:correct`));
    expect(picked.size).toBeGreaterThanOrEqual(2);
  });

  it('空配列なら空文字', () => {
    expect(pickVariant([], 'x')).toBe('');
  });
});

describe('TEACHER_LINES（5人×11種類の台詞。BRIEF-lines.md の決まり）', () => {
  it('5人とも 11 種類すべてに台詞が1つ以上ある', () => {
    for (const id of TEACHER_IDS) {
      for (const key of TEACHER_LINE_KEYS) {
        expect(TEACHER_LINES[id][key].length, `${id}.${key}`).toBeGreaterThanOrEqual(1);
        for (const line of TEACHER_LINES[id][key]) expect(line.trim().length, `${id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('変数の綴りは {語}{正解}{現代語}{書いた意味} だけで、{ } は対になっている', () => {
    eachLine((id, key, line) => {
      const vars = [...line.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
      for (const v of vars) expect(TEACHER_VAR_NAMES, `${id}.${key}: {${v}}`).toContain(v);
      // 変数を取り除いた残りに { } が無い（対になっていない括弧の検出）
      expect(line.replace(/\{[^{}]*\}/g, ''), `${id}.${key}: ${line}`).not.toMatch(/[{}]/);
    });
  });

  it('wrong / trap / nearMiss / blank / pending には要る変数が入っている', () => {
    eachLine((id, key, line) => {
      for (const v of REQUIRED_VARS[key] ?? []) {
        expect(line, `${id}.${key}: ${line}`).toContain(`{${v}}`);
      }
    });
  });

  it('字数の上限を超えない（{変数} は 15 字として数える）', () => {
    eachLine((id, key, line) => {
      expect(length(line), `${id}.${key}: ${line}（${length(line)}字）`).toBeLessThanOrEqual(LIMITS[key]);
    });
  });

  it('絵文字・記号（🧭 ⚠ ▶ など）は書かない。アプリ側が付ける', () => {
    eachLine((id, key, line) => {
      expect(line, `${id}.${key}: ${line}`).not.toMatch(/[🧭⚠▶]/u);
      expect(line, `${id}.${key}: ${line}`).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  it('展開しても { } が残らない', () => {
    const vars = { 語: 'はづかし', 正解: '立派だ', 現代語: '恥ずかしい', 書いた意味: '気がひける' };
    eachLine((_id, _key, line) => {
      expect(fillTemplate(line, vars)).not.toMatch(/[{}]/);
    });
  });
});
