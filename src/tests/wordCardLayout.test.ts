import { describe, it, expect } from "vitest";
import { touchMode, tapOutcome, placeCard } from "@/lib/kobun/wordCardLayout";

describe("浮かぶ解説カード：指の動きの判定", () => {
  it("6px 未満はまだ決めない", () => {
    expect(touchMode(3, 4)).toBeNull();
  });
  it("横の動きはなぞり、縦の動きはスクロール（横書き）", () => {
    expect(touchMode(20, 5)).toBe("scrub");
    expect(touchMode(5, 20)).toBe("pan");
  });
  it("タップ：語の外は閉じる、固定中の同じ語は閉じる、別の語は固定", () => {
    expect(tapOutcome(null, "t1")).toBe("close");
    expect(tapOutcome("t1", "t1")).toBe("close");
    expect(tapOutcome("t2", "t1")).toBe("pin");
    expect(tapOutcome("t1", null)).toBe("pin");
  });
});

describe("浮かぶ解説カード：置き場所", () => {
  const viewport = { width: 390, height: 800 };
  const size = { width: 340, height: 200 };
  it("下に入るときは語の下に置き、矢印は語を指す", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 300, bottom: 330 }, size, viewport });
    expect(p.below).toBe(true);
    expect(p.top).toBe(340);
    expect(p.left).toBe(8); // 中央寄せすると画面の左にはみ出すので 8px に寄る
    expect(p.arrowLeft).toBe(115 - 8 - 7);
  });
  it("下に入らないときは上に置く", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 600, bottom: 630 }, size, viewport, avoidBottom: 150 });
    expect(p.below).toBe(false);
    expect(p.top).toBe(600 - 200 - 10);
  });
  it("指で操作中は上を優先し、上に入らないときだけ下", () => {
    expect(placeCard({ rect: { left: 100, right: 130, top: 400, bottom: 430 }, size, viewport, preferAbove: true }).below).toBe(false);
    expect(placeCard({ rect: { left: 100, right: 130, top: 20, bottom: 50 }, size, viewport, preferAbove: true }).below).toBe(true);
  });
  it("画面の下の帯には重ねない", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 590, bottom: 620 }, size, viewport, avoidBottom: 150 });
    expect(p.top + size.height).toBeLessThanOrEqual(800 - 150 - 8);
  });
});
