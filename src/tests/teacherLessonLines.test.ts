import { describe, expect, it } from "vitest";
import { TEACHER_IDS } from "@/lib/teachers";
import { TEACHER_LINES } from "@/lib/teacherLines";
import { LESSON_LINE_KEYS, LESSON_LINE_MAX, LESSON_LINE_VARS, NEUTRAL_LESSON_LINES, lessonLine } from "@/lib/teacherLessonLines";
import { TEACHER_LESSON_LINES } from "@/lib/teacherLessonLinesData";

const len = (s: string) => [...s.replace(/\{[^}]*\}/g, "")].length + 10 * (s.match(/\{[^}]*\}/g)?.length ?? 0);

describe("文法の先生の台詞（2026-11-16）", () => {
  it("10人ぜんいん、24の鍵がそろい、決まった変数を1つずつ使い、字数の上限を守る", () => {
    for (const id of TEACHER_IDS) {
      const set = TEACHER_LESSON_LINES[id];
      expect(set, id).toBeTruthy();
      for (const key of LESSON_LINE_KEYS) {
        const lines = set![key];
        expect(lines.length, `${id}.${key}`).toBeGreaterThanOrEqual(key.startsWith("drill") ? 8 : 3);
        for (const l of lines) {
          const used = l.match(/\{([^}]*)\}/g)?.map((x) => x.slice(1, -1)) ?? [];
          const need = LESSON_LINE_VARS[key];
          expect(used.every((u) => u === need), `${id}.${key}: ${l}`).toBe(true);
          if (need) expect(used, `${id}.${key}: ${l}`).toContain(need);
          expect(len(l), `${id}.${key}: ${l}`).toBeLessThanOrEqual(LESSON_LINE_MAX[key]);
        }
      }
    }
  });

  it("単語クイズの台詞を使い回さない（ユーザー指示「独自のもの」）", () => {
    const vocab = new Set(TEACHER_IDS.flatMap((id) => Object.values(TEACHER_LINES[id]).flat()));
    for (const id of TEACHER_IDS) for (const key of LESSON_LINE_KEYS) for (const l of TEACHER_LESSON_LINES[id]![key]) expect(vocab.has(l), `${id}.${key}: ${l}`).toBe(false);
  });

  it("変数を入れて1つ選ぶ。口調を使わないときは中立の文", () => {
    expect(lessonLine("drillWrong", { 正解: "過去" }, "s", "sei", false)).toBe("正しくは「過去」。");
    expect(lessonLine("partFirst", { 部分: "「接続」" }, "s", "michizane", false)).toBe("まずは「接続」から。");
    const v = lessonLine("drillWrong", { 正解: "過去" }, "s", "sei", true);
    expect(v).toContain("「過去」");
    expect(v).not.toMatch(/[{}]/);
    expect(NEUTRAL_LESSON_LINES.drillCorrect).toEqual(["正解。"]);
  });
});
