import { describe, it, expect } from 'vitest';
import { TEACHER_IDS } from '../lib/teachers';
import {
  EVENT_WINDOWS, QUIZ_SOON_DAYS, TEACHER_GREETINGS, eventsOn, pickGreeting, type GreetingEvent,
} from '../lib/teacherGreetings';

const MAX = 30;
const len = (s: string) => [...s.replace(/\{日数\}/g, '00')].length;
const d = (m: number, day: number) => new Date(2026, m - 1, day);

describe('TEACHER_GREETINGS（季節・行事のあいさつ）', () => {
  const entries = Object.entries(TEACHER_GREETINGS);

  it('先生10人全員にある', () => {
    expect(Object.keys(TEACHER_GREETINGS).sort()).toEqual([...TEACHER_IDS].sort());
  });

  it('同じ先生の中で同じ文を重ねない', () => {
    for (const [id, g] of entries) {
      const all = [...g!.month.flat(), ...Object.values(g!.events).flat()];
      const dup = all.filter((x, i) => all.indexOf(x) !== i);
      expect(dup, id).toEqual([]);
    }
  });

  it('12か月それぞれに3文以上、行事と小テストにそれぞれ1文以上', () => {
    for (const [id, g] of entries) {
      expect(g!.month.length, id).toBe(12);
      g!.month.forEach((xs, i) => expect(xs.length, `${id} ${i + 1}月`).toBeGreaterThanOrEqual(3));
      for (const e of [...Object.keys(EVENT_WINDOWS), 'quizToday', 'quizSoon']) {
        expect(g!.events[e as GreetingEvent].length, `${id} ${e}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('30字まで・注の（ ）を付けない・絵文字なし・{日数} は quizSoon だけ（quizSoon には必ず入る）', () => {
    for (const [id, g] of entries) {
      const all: [string, string][] = [
        ...g!.month.flatMap((xs, i) => xs.map((x) => [`${i + 1}月`, x] as [string, string])),
        ...Object.entries(g!.events).flatMap(([k, xs]) => xs.map((x) => [k, x] as [string, string])),
      ];
      for (const [k, line] of all) {
        const tag = `${id} ${k}: ${line}`;
        expect(len(line), tag).toBeLessThanOrEqual(MAX);
        expect(line, tag).not.toMatch(/[（）()]/);
        expect(line, tag).not.toMatch(/\p{Extended_Pictographic}/u);
        if (k === 'quizSoon') expect(line, tag).toContain('{日数}');
        else expect(line.replace(/\{日数\}/g, ''), tag).not.toMatch(/[{}]/);
      }
    }
  });
});

describe('eventsOn（日付から行事を決める）', () => {
  it('代表の日付', () => {
    expect(eventsOn(d(1, 1))).toEqual(['newYear']);
    expect(eventsOn(d(4, 10))).toEqual(['newTerm']);
    expect(eventsOn(d(7, 7)).sort()).toEqual(['examSeason', 'tanabata']);
    expect(eventsOn(d(8, 15))).toEqual(['summerBreak']);
    expect(eventsOn(d(12, 31))).toEqual(['winterBreak']);
    expect(eventsOn(d(10, 20))).toEqual([]);
  });

  it('幅は月日の順で、年をまたがない', () => {
    for (const ws of Object.values(EVENT_WINDOWS)) {
      for (const [m1, d1, m2, d2] of ws) expect(m1 * 100 + d1).toBeLessThanOrEqual(m2 * 100 + d2);
    }
  });
});

describe('pickGreeting（その日の一言）', () => {
  it('10人とも、どの日でも一言が返る', () => {
    for (const id of TEACHER_IDS) {
      for (const [m, day] of [[1, 1], [2, 2], [5, 1], [7, 7], [10, 20], [12, 31]]) {
        const line = pickGreeting({ teacher: id, date: d(m, day) });
        expect(line, `${id} ${m}/${day}`).toBeTruthy();
        expect(line!, `${id} ${m}/${day}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('同じ日・同じ種なら同じ一言、月や行事の台詞から選ぶ', () => {
    const a = pickGreeting({ teacher: 'sei', date: d(10, 20) });
    expect(a).toBe(pickGreeting({ teacher: 'sei', date: d(10, 20) }));
    expect(TEACHER_GREETINGS.sei!.month[9]).toContain(a);
    const ny = pickGreeting({ teacher: 'sei', date: d(1, 2) })!;
    expect([...TEACHER_GREETINGS.sei!.events.newYear, ...TEACHER_GREETINGS.sei!.month[0]]).toContain(ny);
  });

  it('小テストの当日・直前はその台詞だけ。日数を入れる', () => {
    expect(TEACHER_GREETINGS.michizane!.events.quizToday)
      .toContain(pickGreeting({ teacher: 'michizane', date: d(6, 1), quizDaysLeft: 0 }));
    const soon = pickGreeting({ teacher: 'tsurayuki', date: d(6, 1), quizDaysLeft: 3 })!;
    expect(soon).toContain('3');
    expect(soon).not.toMatch(/[{}]/);
    const far = pickGreeting({ teacher: 'tsurayuki', date: d(10, 20), quizDaysLeft: QUIZ_SOON_DAYS + 1 })!;
    expect(TEACHER_GREETINGS.tsurayuki!.month[9]).toContain(far);
  });
});
