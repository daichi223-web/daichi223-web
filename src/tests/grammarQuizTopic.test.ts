import { describe, it, expect } from "vitest";
import { grammarQuizTopicOf } from "@/lib/kobun/grammarQuizTopic";

describe("教材の語から文法道場のクイズの単元を決める", () => {
  it("推量系の「まじ」は推量系のクイズ", () => {
    expect(grammarQuizTopicOf("jodoshi-suiryo", "打消推量")).toBe("jodoshi-suiryo");
  });
  it("否定系の「ず」は「ず」のクイズ", () => {
    expect(grammarQuizTopicOf("jodoshi-hitei", "打消")).toBe("jodoshi-zu");
  });
  it("「じ」は推量系（2026-10-25〜）なので推量系のクイズ", () => {
    expect(grammarQuizTopicOf("jodoshi-suiryo", "打消意志")).toBe("jodoshi-suiryo");
  });
  it("否定系に打消推量・打消意志が残っていても、「ず」のクイズには飛ばさない", () => {
    expect(grammarQuizTopicOf("jodoshi-hitei", "打消推量")).toBeNull();
    expect(grammarQuizTopicOf("jodoshi-hitei", "打消意志")).toBeNull();
  });
  it("受身・使役・尊敬系は意味で「る」か「す」へ", () => {
    expect(grammarQuizTopicOf("jodoshi-ukemi-shieki-sonkei", "使役")).toBe("jodoshi-su");
    expect(grammarQuizTopicOf("jodoshi-ukemi-shieki-sonkei", "受身")).toBe("jodoshi-ru");
  });
  it("参照単元が無い・クイズの無い単元は null", () => {
    expect(grammarQuizTopicOf(undefined, "打消")).toBeNull();
    expect(grammarQuizTopicOf("no-such-topic", undefined)).toBeNull();
  });
});
