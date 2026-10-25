import { describe, it, expect } from "vitest";
import { grammarMeaningLabel } from "@/lib/kobun/grammarMeaningLabel";

describe("助詞・助動詞の意味の札", () => {
  it("略記を略さない形にする", () => {
    expect(grammarMeaningLabel("体修")).toBe("連体修飾");
    expect(grammarMeaningLabel("順確・原因")).toBe("順接確定（原因）");
    expect(grammarMeaningLabel("順確・偶然")).toBe("順接確定（偶然）");
    expect(grammarMeaningLabel("順仮")).toBe("順接仮定");
    expect(grammarMeaningLabel("念押")).toBe("念押し");
  });
  it("そのままの語は変えない・空は空", () => {
    expect(grammarMeaningLabel("引用")).toBe("引用");
    expect(grammarMeaningLabel("不可能")).toBe("不可能");
    expect(grammarMeaningLabel("")).toBe("");
    expect(grammarMeaningLabel(undefined)).toBe("");
  });
});
