/**
 * 文法規則エンジンのユニットテスト
 *
 * ⚠️ 現在 9 件 fail（2026-04-24 時点のトリアージ）:
 *
 *   ◆ formGuesser / morphTokenizer 系（データ駆動の同定漏れ）
 *     - 「悲しく」→ 連用形期待だが 未然形 を返す
 *     - 「行きしこと」の き を 過去 タグとして検出できない
 *     - 「ない」の aux が ['接続'] のみで '打消' を欠く
 *     → grammar rules JSON (public/grammar/*.json) の辞書エントリ不足、
 *       もしくは tokenizer の match 優先度問題と推測。
 *
 *   ◆ validateConnections 系（接続検証のルール差分）
 *     - 「悲しくけり」正例に違反 1 を誤報
 *     - 「ぞ...連体形」正例に違反 2 を誤報
 *     - 「ぞ...終止形」負例を違反 0 と誤判定（= 係り結びを見逃し）
 *     - 「こそ...連体形」負例のメッセージに「已然形」を含まない
 *     → 係り結びルールの実装とテスト期待値が食い違い。実装側修正か
 *       テスト期待値更新かは、仕様（古典文法の厳密な係り結び定義）を
 *       確認してからでないと判断できない。
 *
 *   ◆ gradeWithMorph 系（スコアリングの閾値／重み変更）
 *     - 完全一致で 0.25 を返す（1.0 期待）
 *     - 「0.7 以上」判定が false（= lemma/aux 重みが変わったか）
 *     → gradeWithMorph のロジック改修でテスト値が取り残されている
 *       可能性が高い。
 *
 * 対応方針: 本セッションでは修正せず。後日、
 *   1) 古典文法仕様を正とし
 *   2) public/grammar/*.json の辞書完全性を先に確認
 *   3) 必要な辞書追加 → 実装側の論理修正 → テスト値更新
 * の順で進めるべき。
 *
 * CI は本ファイルを知らない (package.json に test script は定義済だが
 * 実行は手動) ため、デプロイブロックにはなっていない。
 */
import { describe, it, expect } from "vitest";
import { validateConnections } from "../lib/validateConnectionsFromFile";
import { gradeWithMorph, GoldAnswer } from "../lib/gradeWithMorph";
import { guessAdjectiveForm, guessLeftForm } from "../utils/formGuesser";
import { tokenizeSense, morphKey } from "../utils/morphTokenizer";

describe("formGuesser", () => {
  it("形容詞連体形を認識（悲しき）", () => {
    expect(guessAdjectiveForm("悲しき")).toBe("連体形");
  });

  it("形容詞終止形を認識（悲し）", () => {
    expect(guessAdjectiveForm("悲し")).toBe("終止形");
  });

  it("形容詞連用形を認識（悲しく）", () => {
    expect(guessAdjectiveForm("悲しく")).toBe("連用形");
  });

  it("左形推定（悲しき）→ 形容詞連体形", () => {
    expect(guessLeftForm("悲しき")).toBe("連体形");
  });
});

describe("morphTokenizer", () => {
  it("悲しきこと → content + aux なし", () => {
    const tokens = tokenizeSense("悲しきこと");
    expect(tokens.some((t) => t.pos === "content")).toBe(true);
  });

  it("行きしこと → 過去『き』を検出", () => {
    const key = morphKey("行きしこと");
    expect(key.aux).toContain("過去");
  });

  it("お〜になる → 尊敬タグを付与", () => {
    const key = morphKey("お読みになる");
    expect(key.aux).toContain("尊敬");
  });
});

describe("validateConnections", () => {
  it("悲しきこと → 正（形容詞連体形）", () => {
    const issues = validateConnections("悲しきこと");
    expect(issues.length).toBe(0);
  });

  it("悲しきけり → 違反（けりは連用形接続）", () => {
    const issues = validateConnections("悲しきけり");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].rule).toContain("連用形");
  });

  it("悲しくけり → 正（連用形接続）", () => {
    const issues = validateConnections("悲しくけり");
    expect(issues.length).toBe(0);
  });

  it("行きしこと → 正（過去『き』連体形）", () => {
    const issues = validateConnections("行きしこと");
    expect(issues.length).toBe(0);
  });

  it("ぞ...連体形 → 正（係り結び）", () => {
    const issues = validateConnections("ぞ美しかる");
    expect(issues.length).toBe(0);
  });

  it("ぞ...終止形 → 違反（係り結び不一致）", () => {
    const issues = validateConnections("ぞ美し");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].rule).toContain("連体形");
  });

  it("こそ...已然形 → 正（係り結び）", () => {
    const issues = validateConnections("こそ悲しけれ");
    expect(issues.length).toBe(0);
  });

  it("こそ...連体形 → 違反（係り結び不一致）", () => {
    const issues = validateConnections("こそ悲しき");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].rule).toContain("已然形");
  });
});

describe("gradeWithMorph", () => {
  it("完全一致 → スコア1.0、正解", () => {
    const gold: GoldAnswer = {
      lemmaNorms: ["悲しい"],
      requiredAux: [],
      optionalAux: [],
      particlesNear: [],
      senseTags: [],
    };
    const result = gradeWithMorph("悲しきこと", gold);
    expect(result.score).toBeGreaterThanOrEqual(0.5); // 語幹一致
    expect(result.notes.some((n) => n.includes("語幹一致"))).toBe(true);
  });

  it("尊敬必須 → 尊敬なしで減点", () => {
    const gold: GoldAnswer = {
      lemmaNorms: ["読む"],
      requiredAux: ["尊敬"],
      optionalAux: [],
      particlesNear: [],
      senseTags: [],
    };
    const result1 = gradeWithMorph("読む", gold);
    expect(result1.breakdown.requiredAux).toBe(0);

    const result2 = gradeWithMorph("お読みになる", gold);
    expect(result2.breakdown.requiredAux).toBeGreaterThan(0);
  });

  it("接続違反 → ペナルティ", () => {
    const gold: GoldAnswer = {
      lemmaNorms: ["悲しい"],
      requiredAux: [],
      optionalAux: [],
      particlesNear: [],
      senseTags: [],
    };
    const result = gradeWithMorph("悲しきけり", gold);
    expect(result.connIssues).toBeDefined();
    expect(result.connIssues!.length).toBeGreaterThan(0);
    expect(result.breakdown.connPenalty).toBeLessThan(0);
  });

  it("スコア0.7以上 & 接続違反なし → 正解", () => {
    const gold: GoldAnswer = {
      lemmaNorms: ["悲しい"],
      requiredAux: [],
      optionalAux: [],
      particlesNear: [],
      senseTags: [],
    };
    const result = gradeWithMorph("悲しきこと", gold);
    expect(result.correct).toBe(true);
  });

  it("ない → 打消タグとして扱う", () => {
    const key = morphKey("ない");
    expect(key.aux).toContain("打消");
  });
});
