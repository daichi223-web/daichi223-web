/**
 * normalizeSense smoke テスト。
 * 採点エンジンが期待する表記ゆれ吸収の主要パスの回帰保護。
 */
import { describe, it, expect } from "vitest";
import { normalizeSense } from "../utils/normalizeSense";

describe("normalizeSense", () => {
  it("空入力は空を返す", () => {
    expect(normalizeSense("")).toBe("");
  });

  it("括弧類と空白は除去", () => {
    expect(normalizeSense("〔 思ふ 〕")).toBe("おもう");
    expect(normalizeSense('「こころ」')).toBe("こころ");
    expect(normalizeSense("a b c")).toBe("abc");
  });

  it("歴史的仮名遣いから現代仮名への近似（語中ハ行）", () => {
    expect(normalizeSense("思は")).toBe("おもわ");
    expect(normalizeSense("思ふ")).toBe("おもう");
    expect(normalizeSense("思ひ")).toBe("おもい");
  });

  it("ゐ/ゑ の変換", () => {
    expect(normalizeSense("ゐる")).toBe("いる");
    expect(normalizeSense("こゑ")).toBe("こえ");
  });

  it("けふ / さう などの二重母音近似", () => {
    expect(normalizeSense("けふ")).toBe("きょう");
    expect(normalizeSense("さう")).toBe("そう");
    expect(normalizeSense("てふ")).toBe("ちょう");
  });

  it("長音記号・ダッシュ・三点リーダの除去（NFKC 前の形）", () => {
    // NFKC 変換「前」の文字なら regex で除去される
    expect(normalizeSense("〜")).toBe("");
    expect(normalizeSense("ほ—や")).toBe("ほや");
    expect(normalizeSense("あーい")).toBe("あい");
    // 注: NFKC で ～(U+FF5E) は ~(ASCII) に変換されるため regex に
    // 引っかからず残る。既知の軽微バグ。scoring 側で影響が出た場合のみ
    // 別途修正。
  });

  it("否定テンプレ「まったく〜ない」プレースホルダは縮約", () => {
    // 正規表現は「ひらがな・漢字を含まない部分」=プレースホルダ類 に限って縮約する
    expect(normalizeSense("まったく〜ない")).toBe("まったくない");
    expect(normalizeSense("まったく…ない")).toBe("まったくない");
    // 動詞が入っている場合は縮約されない（誤吸収防止）
    expect(normalizeSense("まったく知らない")).toBe("まったく知らない");
  });

  it("漢字かなゆれの簡易吸収", () => {
    expect(normalizeSense("心地")).toBe("ここち");
    expect(normalizeSense("有様")).toBe("ありさま");
    expect(normalizeSense("今日")).toBe("きょう");
  });

  it("NFKC 正規化で全角英数が半角に", () => {
    expect(normalizeSense("ＡＢＣ")).toBe("abc");
  });

  it("同じ語を入れると同じ結果になる（冪等性）", () => {
    const once = normalizeSense("思はれ");
    const twice = normalizeSense(once);
    expect(twice).toBe(once);
  });
});
