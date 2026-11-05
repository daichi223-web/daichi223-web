import { describe, it, expect } from "vitest";
import { pickTodayReview, DOJO_REVIEW_CAP, type SrsDueRow } from "@/lib/kobun/dojoReview";

// 2026-11-06 10:00（その日の 0:00 を「今日の始まり」として渡す。時差に左右されないよう両方とも明示する）
const now = new Date("2026-11-06T10:00:00Z");
const todayStart = "2026-11-06T00:00:00Z";
const opts = { now, todayStart };

const row = (qid: string, nextReview: string, lastReview: string | null = "2026-11-01T09:00:00Z"): SrsDueRow => ({
  qid, nextReview, lastReview,
});
const ids = (...xs: string[]) => new Set(xs);

describe("文法の復習の「今日の分」", () => {
  it("期日の古い順に並べる（同じ期日は ID 順）", () => {
    const got = pickTodayReview(
      [
        row("g3", "2026-11-05T00:00:00Z"),
        row("g1", "2026-11-01T00:00:00Z"),
        row("g2", "2026-11-03T00:00:00Z"),
        row("g0", "2026-11-03T00:00:00Z"),
      ],
      ids("g0", "g1", "g2", "g3"),
      opts
    );
    expect(got).toEqual({ ids: ["g1", "g0", "g2", "g3"], remaining: 0 });
  });

  it("上限は20問。入らなかった分は残りの数として返す", () => {
    expect(DOJO_REVIEW_CAP).toBe(20);
    const rows = Array.from({ length: 53 }, (_, i) =>
      row(`g${String(i).padStart(2, "0")}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString())
    );
    const got = pickTodayReview(rows, new Set(rows.map((r) => r.qid)), opts);
    expect(got.ids).toHaveLength(20);
    expect(got.ids[0]).toBe("g00");
    expect(got.ids[19]).toBe("g19");
    expect(got.remaining).toBe(33);
  });

  it("今日すでに解いた問題は除く（間違えて箱1＝いつも期日になった問題が、すぐまた並ばない）", () => {
    const got = pickTodayReview(
      [
        row("wrong-today", "2026-11-06T09:30:00Z", "2026-11-06T09:30:00Z"),
        row("at-midnight", "2026-11-06T00:00:00Z", "2026-11-06T00:00:00Z"),
        row("yesterday", "2026-11-05T23:59:59Z", "2026-11-05T23:59:59Z"),
        row("never", "2026-11-02T00:00:00Z", null),
      ],
      ids("wrong-today", "at-midnight", "yesterday", "never"),
      opts
    );
    expect(got).toEqual({ ids: ["never", "yesterday"], remaining: 0 });
  });

  it("単語の qid・例文事典の id（文法の問題の集合に無いもの）は入れない", () => {
    const got = pickTodayReview(
      [row("12-1", "2026-10-01T00:00:00Z"), row("reibun-keri-3", "2026-10-02T00:00:00Z"), row("g1", "2026-11-05T00:00:00Z")],
      ids("g1", "g2"),
      opts
    );
    expect(got).toEqual({ ids: ["g1"], remaining: 0 });
  });

  it("期日がまだ来ていない・期日が読めない行は入れない。期日ちょうどは入れる", () => {
    const got = pickTodayReview(
      [
        row("future", "2026-11-06T10:00:01Z"),
        row("exact", "2026-11-06T10:00:00Z"),
        row("broken", "not-a-date"),
      ],
      ids("future", "exact", "broken"),
      opts
    );
    expect(got.ids).toEqual(["exact"]);
  });

  it("この画面ですでに出した問題は除く（つづけてもう少し で同じ問題を出さない）", () => {
    const rows = [row("g1", "2026-11-01T00:00:00Z"), row("g2", "2026-11-02T00:00:00Z"), row("g3", "2026-11-03T00:00:00Z")];
    const got = pickTodayReview(rows, ids("g1", "g2", "g3"), { ...opts, cap: 2, exclude: ids("g1", "g2") });
    expect(got).toEqual({ ids: ["g3"], remaining: 0 });
  });

  it("同じ ID の行が重なっていても1回だけ", () => {
    const got = pickTodayReview(
      [row("g1", "2026-11-01T00:00:00Z"), row("g1", "2026-11-02T00:00:00Z")],
      ids("g1"),
      opts
    );
    expect(got).toEqual({ ids: ["g1"], remaining: 0 });
  });

  it("上限は変えられる。今日の0時は Date でも渡せる", () => {
    const rows = [row("g1", "2026-11-01T00:00:00Z"), row("g2", "2026-11-02T00:00:00Z"), row("g3", "2026-11-03T00:00:00Z")];
    const got = pickTodayReview(rows, ids("g1", "g2", "g3"), { now, todayStart: new Date(todayStart), cap: 2 });
    expect(got).toEqual({ ids: ["g1", "g2"], remaining: 1 });
  });

  it("期日が来た問題が無ければ空", () => {
    expect(pickTodayReview([], ids("g1"), opts)).toEqual({ ids: [], remaining: 0 });
  });
});
