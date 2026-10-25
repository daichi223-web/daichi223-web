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
  it("指で操作中、上に最小の高さ（160px）があれば入り切らなくても上に出し、語に被らない高さまで縮める（下に出すと指と手の下に隠れ、被せると語が読めない）", () => {
    // 上の余地 282px に 300px のカードは入り切らない → 上に出し、max-height を 282 にして中をスクロール
    const p = placeCard({ rect: { left: 100, right: 130, top: 300, bottom: 330 }, size: { width: 340, height: 300 }, viewport, preferAbove: true });
    expect(p.below).toBe(false);
    expect(p.maxHeight).toBe(282);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(300 - 10); // 語の上端より上で終わる
    expect(p.top).toBe(8);
  });
  it("入り切るときは max-height が使える高さ以上で、縮めない", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 400, bottom: 430 }, size, viewport, preferAbove: true });
    expect(p.maxHeight).toBeGreaterThanOrEqual(200);
    expect(p.top).toBe(400 - 10 - 200);
  });
  it("指で操作中、上の余地が最小の高さに足りなければ下（ヘッダの下からの余地で見る）", () => {
    // ヘッダ 100px、語の上端 250px：余地 132px（250 - 10 - 108）は 160px に足りないので下
    const p = placeCard({ rect: { left: 100, right: 130, top: 250, bottom: 280 }, size: { width: 340, height: 300 }, viewport, avoidTop: 100, preferAbove: true });
    expect(p.below).toBe(true);
    expect(p.top).toBe(290);
  });
  it("スクロールで語について動くとき、今の側に入るうちは側を変えない（語をまたいで飛ばない）", () => {
    // 下に出ていた（current: true）。語が下がって上にも入るようになったが、下に入るうちは下のまま
    const below = placeCard({ rect: { left: 100, right: 130, top: 400, bottom: 430 }, size, viewport, preferAbove: true, current: true });
    expect(below.below).toBe(true);
    // 上に出ていた（current: false）。語が上がって上に入らなくなったら、そこで初めて下へ
    const flip = placeCard({ rect: { left: 100, right: 130, top: 150, bottom: 180 }, size, viewport, avoidTop: 56, preferAbove: true, current: false });
    expect(flip.below).toBe(true);
    expect(flip.top).toBe(190);
  });
  it("指の点が語の枠から外れているときは指の点のまわりを基準にする（スクロール直後の古い枠に引きずられない）", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 100, bottom: 130 }, point: { x: 115, y: 500 }, size, viewport, preferAbove: true });
    expect(p.below).toBe(false);
    expect(p.top).toBe(500 - 14 - 200 - 10);
  });
  it("指で操作中、どちらにも入り切らないときも上に最小の高さがあれば上。高さは上の余地まで", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 400, bottom: 430 }, size: { width: 340, height: 500 }, viewport, preferAbove: true });
    expect(p.below).toBe(false);
    expect(p.top).toBe(8); // 上端から
    expect(p.maxHeight).toBe(400 - 10 - 8); // 語の上端まで
  });
  it("スクロールで語について動くとき、今の側に最小の高さが取れるうちは側を変えず高さだけ変える", () => {
    // 上に出ていた 300px のカード。語が上がって上の余地が 250px → 上のまま 250px に縮む
    const p = placeCard({ rect: { left: 100, right: 130, top: 268, bottom: 298 }, size: { width: 340, height: 300 }, viewport, preferAbove: true, current: false });
    expect(p.below).toBe(false);
    expect(p.maxHeight).toBe(250);
    // さらに上がって 132px（160px 未満）→ そこで下へ
    const q = placeCard({ rect: { left: 100, right: 130, top: 150, bottom: 180 }, size: { width: 340, height: 300 }, viewport, preferAbove: true, current: false });
    expect(q.below).toBe(true);
    expect(q.top).toBe(190);
  });
  it("上の固定ヘッダには重ねない（月の琴は本文の枠の上端より上に出さない）", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 200, bottom: 230 }, size, viewport, avoidTop: 56, preferAbove: true });
    expect(p.top).toBeGreaterThanOrEqual(56 + 8);
    // 上の余地 126px（200 - 10 - 64）は最小の高さ 160px に足りないので下に出る
    expect(p.below).toBe(true);
    expect(p.top).toBe(240);
  });
  it("画面の下の帯には重ねない", () => {
    const p = placeCard({ rect: { left: 100, right: 130, top: 590, bottom: 620 }, size, viewport, avoidBottom: 150 });
    expect(p.top + size.height).toBeLessThanOrEqual(800 - 150 - 8);
  });
});
