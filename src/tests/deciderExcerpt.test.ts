import { describe, it, expect } from "vitest";
import { excerptForDecider } from "@/lib/kobun/deciderExcerpt";

const LONG =
  "なほ、この女見では、世にあるまじき心地のしければ、天竺にある物も持て来ぬものかはと思ひめぐらして、石作の皇子は、心の支度ある人にて、「天竺に二つとなき鉢を、百千万里の程行きたりとも、いかでかとるべき」と思ひて";

describe("意味の決め手の本文の切り詰め", () => {
  it("短い文はそのまま", () => {
    expect(excerptForDecider("風に【そよぐ】竹の影", [])).toBe("風に【そよぐ】竹の影");
  });
  it("長い文は【】と手がかりの周りだけ。前後は…", () => {
    const m = LONG.replace("心の支度", "【心】の支度");
    const r = excerptForDecider(m, ["支度"]);
    expect(r).toContain("【心】の支度");
    expect(r.startsWith("…")).toBe(true);
    expect(r.endsWith("…")).toBe(true);
    expect(r.length).toBeLessThan(40);
  });
  it("離れた手がかりも含める", () => {
    const m = LONG.replace("いかでか", "【いかでか】");
    const r = excerptForDecider(m, ["とるべき"]);
    expect(r).toContain("【いかでか】");
    expect(r).toContain("とるべき");
  });
  it("2回以上出る手がかりは範囲に使わない", () => {
    const m = LONG.replace("思ひめぐらし", "【思ひめぐらし】");
    const r = excerptForDecider(m, ["天竺"]);
    expect(r).toContain("【思ひめぐらし】");
    expect(r.length).toBeLessThan(LONG.length);
  });
  it("【】の途中で切らない", () => {
    const m = LONG.replace("あるまじき", "【あるまじき】");
    const r = excerptForDecider(m, [], { pad: 2 });
    expect(r).toContain("【あるまじき】");
  });
});
