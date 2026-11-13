import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANIME_TEACHER_IDS, TEACHERS, TEACHER_IDS, TEACHER_LINE_KEYS, TEACHER_VAR_NAMES, fillTemplate, isTeacherArt, isTeacherId, pickVariant, teacherImage,
  type TeacherLines,
} from '../lib/teachers';
import { TEACHER_LINES } from '../lib/teacherLines';
import { TEACHER_PROFILES } from '../lib/teacherProfiles';

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

describe('TEACHERS（先生10人のデータ）', () => {
  it('10人の id・名前がそろい、isTeacherId が許可リストで判定する', () => {
    expect(TEACHER_IDS).toEqual(['sei', 'murasaki', 'michizane', 'tsurayuki', 'teika', 'komachi', 'izumi', 'koshikibu', 'ukyo', 'narihira']);
    expect(Object.keys(TEACHERS).sort()).toEqual([...TEACHER_IDS].sort());
    expect(TEACHER_IDS.map((id) => TEACHERS[id].name)).toEqual(['清少納言', '紫式部', '菅原道真', '紀貫之', '藤原定家', '小野小町', '和泉式部', '小式部内侍', '建礼門院右京大夫', '在原業平']);
    for (const id of TEACHER_IDS) {
      expect(TEACHERS[id].id).toBe(id);
      expect(TEACHERS[id].kana.length).toBeGreaterThan(0);
      expect(TEACHERS[id].title.length).toBeGreaterThan(0);
      expect([...TEACHERS[id].oneLiner].length).toBeLessThanOrEqual(25);
    }
    expect(isTeacherId('sei')).toBe(true);
    expect(isTeacherId('teika')).toBe(true);
    expect(isTeacherId('komachi')).toBe(true);
    expect(isTeacherId('narihira')).toBe(true);
    expect(isTeacherId('hakase')).toBe(false);
    expect(isTeacherId(null)).toBe(false);
    expect(isTeacherId(undefined)).toBe(false);
    expect(isTeacherId(3)).toBe(false);
  });

  it('先生の絵は /teachers/<id>-<tone>.webp', () => {
    expect(teacherImage('sei', 'sharp')).toBe('/teachers/sei-sharp.webp');
    expect(teacherImage('murasaki', 'pop')).toBe('/teachers/murasaki-pop.webp');
  });

  it('10人×3画風 = 30枚の絵が public/teachers に実在する', () => {
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

  it('4種類目（みやび。ファイル名は anime）は絵がある先生だけ。無い先生は肖像の雰囲気の絵に戻る', () => {
    expect(ANIME_TEACHER_IDS).toEqual(['sei', 'murasaki', 'komachi', 'izumi', 'koshikibu', 'ukyo']);
    const dir = fileURLToPath(new URL('../../public/teachers/', import.meta.url));
    for (const id of TEACHER_IDS) {
      const has = ANIME_TEACHER_IDS.includes(id);
      expect(existsSync(join(dir, `${id}-anime.webp`)), id).toBe(has);
      expect(teacherImage(id, 'yuru', 'anime')).toBe(has ? `/teachers/${id}-anime.webp` : `/teachers/${id}-yuru.webp`);
      expect(teacherImage(id, 'pop', 'same')).toBe(`/teachers/${id}-pop.webp`);
    }
    expect(isTeacherArt('anime')).toBe(true);
    expect(isTeacherArt('same')).toBe(true);
    expect(isTeacherArt('pop')).toBe(false);
    expect(isTeacherArt(null)).toBe(false);
  });
});

describe('TEACHER_PROFILES（人物解説。史実・伝わる話・先生キャラを分けて持つ）', () => {
  it('10人とも、時代・史実・先生キャラ（性格の軸と創作の部分）・出典がある', () => {
    expect(Object.keys(TEACHER_PROFILES).sort()).toEqual([...TEACHER_IDS].sort());
    for (const id of TEACHER_IDS) {
      const p = TEACHER_PROFILES[id];
      expect(p.era.length, id).toBeGreaterThan(0);
      expect(p.facts.length, id).toBeGreaterThanOrEqual(3);
      expect(p.character.summary.length, id).toBeGreaterThan(0);
      expect(p.character.basis.length, id).toBeGreaterThanOrEqual(3);
      for (const b of p.character.basis) expect(b.from.length, `${id}: ${b.trait}`).toBeGreaterThan(0);
      expect(p.character.fiction.length, id).toBeGreaterThan(0);
      expect(p.sources.length, id).toBeGreaterThan(0);
      for (const w of p.words) expect(w.source.length, `${id}: ${w.text}`).toBeGreaterThan(0);
    }
  });

  it('史実の欄に、調査で誤り・後世の形と分かった言い方を書かない', () => {
    const facts = TEACHER_IDS.flatMap((id) => [...TEACHER_PROFILES[id].facts, ...TEACHER_PROFILES[id].words.map((w) => w.text)].map((t) => `${id}: ${t}`));
    for (const f of facts) {
      expect(f).not.toMatch(/春な忘れそ/);          // 『拾遺集』『大鏡』は「春を忘るな」
      expect(f).not.toMatch(/百人一首の選者/);      // 「選んだとされる」まで
      expect(f).not.toMatch(/絶世の美女|百夜/);     // 小町の後世の伝説
    }
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

describe('TEACHER_LINES（10人×11種類の台詞。BRIEF-lines.md の決まり）', () => {
  it('10人とも 11 種類すべてに台詞が1つ以上ある', () => {
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

  it('注の（ ）を付けない（2026-11-13 ユーザー指示）', () => {
    eachLine((id, key, line) => {
      expect(line, `${id}.${key}: ${line}`).not.toMatch(/[（）()]/);
    });
  });

  it('生徒への言い寄り・独占・容姿への言及にあたる言葉を書かない（character-design.md）', () => {
    const banned = /あなただけ|きみだけ|君だけ|お前だけ|好きよ|好きだ|愛して|恋人|かわいい|可愛い|美人|綺麗|ほかの先生|他の先生|デート|口づけ/;
    eachLine((id, key, line) => {
      expect(line, `${id}.${key}: ${line}`).not.toMatch(banned);
    });
  });

  it('展開しても { } が残らない', () => {
    const vars = { 語: 'はづかし', 正解: '立派だ', 現代語: '恥ずかしい', 書いた意味: '気がひける' };
    eachLine((_id, _key, line) => {
      expect(fillTemplate(line, vars)).not.toMatch(/[{}]/);
    });
  });
});
