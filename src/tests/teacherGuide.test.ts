import { describe, it, expect } from "vitest";
import { dojoHomeGuide, dojoTopicGuide, manabiIntroGuide, manabiResultGuide, manabiStageGuide } from "@/lib/kobun/teacherGuide";

describe("先生のガイド（学び始め）", () => {
  it("はじめと段の切り替わりは1〜2文", () => {
    expect(manabiIntroGuide()).toHaveLength(2);
    for (const s of [0, 1, 2, 3, 4]) expect(manabiStageGuide(s)).toHaveLength(1);
    expect(manabiStageGuide(1)[0]).toContain("形容詞");
    expect(manabiStageGuide(9)).toEqual([]);
  });

  it("結果：できた段・つまずいた段・出発点の単元を言う", () => {
    expect(
      manabiResultGuide({ passedNames: ["ことばのきほん"], startStage: 1, startName: "用言", startTitle: "形容詞・形容動詞の活用" }),
    ).toEqual(["ことばのきほんはできていたよ。", "用言でつまずいたね。", "まず「形容詞・形容動詞の活用」から始めよう。", "終わったら次の単元へ進もう。"]);
    expect(manabiResultGuide({ passedNames: [], startStage: 0, startName: "ことばのきほん", startTitle: null })[0]).toContain("文法の言葉");
    expect(manabiResultGuide({ passedNames: ["a"], startStage: null, startName: null, startTitle: null })[0]).toBe("全部できたね。");
  });
});

describe("先生のガイド（文法道場）", () => {
  it("ホーム：復習→つづき→出発点の順に、カードと同じことを言う", () => {
    expect(dojoHomeGuide({ dueCount: 12, lastTitle: "四段活用", startTitle: "助動詞「けり」", beginner: false })).toEqual([
      "今日は復習が12問。",
      "そのあと「四段活用」のつづきをやろう。",
    ]);
    expect(dojoHomeGuide({ dueCount: 0, lastTitle: null, startTitle: "助動詞「けり」", beginner: true })).toEqual(["出発点の助動詞「けり」から始めよう。"]); // かぎかっこを重ねない
    expect(dojoHomeGuide({ dueCount: 3, lastTitle: null, startTitle: null, beginner: false })).toEqual(["今日は復習が3問。", "まずはそこから。"]);
    expect(dojoHomeGuide({ dueCount: 0, lastTitle: null, startTitle: null, beginner: true })[0]).toContain("どこから始める？");
    expect(dojoHomeGuide({ dueCount: 0, lastTitle: null, startTitle: null, beginner: false })).toHaveLength(1);
  });

  it("単元ページ：要約を1文ずつ、そのあとどのレベルから", () => {
    expect(
      dojoTopicGuide({ summary: "過去（伝聞過去）と詠嘆を表す助動詞。連用形に接続。", levelCount: 3, startLabel: "Lv1 型", allMastered: false, count: 8 }),
    ).toEqual(["過去（伝聞過去）と詠嘆を表す助動詞。", "連用形に接続。", "「Lv1 型」から始めよう。✅ がついたら次のレベルへ。"]);
    expect(dojoTopicGuide({ summary: null, levelCount: 1, startLabel: "Lv1 型", allMastered: false, count: 8 })).toEqual(["8問で確かめよう。"]);
    expect(dojoTopicGuide({ summary: "要約", levelCount: 2, startLabel: "x", allMastered: true, count: 8 })[1]).toContain("全部のレベル");
  });
});
