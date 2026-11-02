import { describe, it, expect } from "vitest";
import fs from "node:fs";
import type { KobunText, TextAnalysis } from "@/lib/kobun/types";
import { auxEntryOf, buildReadingTest, parseManualTest, readingThread } from "@/lib/kobun/readingTest";

// 教材の実データ（public/texts-v3 の全教材。analysis があれば使う）
function load(id: string): { text: KobunText; analysis: TextAnalysis | null } {
  const text = JSON.parse(fs.readFileSync(`public/texts-v3/${id}.json`, "utf8")) as KobunText;
  const ap = `public/analysis/${id}.json`;
  const analysis = fs.existsSync(ap) ? (JSON.parse(fs.readFileSync(ap, "utf8")) as TextAnalysis) : null;
  return { text, analysis };
}
const ALL = fs
  .readdirSync("public/texts-v3")
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => f.replace(/\.json$/, ""));

describe("読解テスト（自動問題）", () => {
  it("全教材：正解の番号が範囲内・選択肢の重複なし・傍線が本文に連続", () => {
    let total = 0;
    for (const id of ALL) {
      const { text, analysis } = load(id);
      if (!text.sentences) continue;
      const { questions } = buildReadingTest(text, analysis);
      expect(questions.length).toBeLessThanOrEqual(8);
      const seen = new Set<string>();
      questions.forEach((q, i) => {
        total++;
        expect(q.no).toBe(i + 1);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(q.choices.length);
        expect(q.choices.length).toBeGreaterThanOrEqual(3);
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.choices.every((c) => c.trim().length > 0)).toBe(true);
        expect(q.prompt).toContain(`傍線部${"①②③④⑤⑥⑦⑧"[i]}`);
        const s = text.sentences.find((x) => x.id === q.sentenceId)!;
        expect(s).toBeTruthy();
        expect(s.originalText.slice(q.span[0], q.span[1])).toBe(q.spanText);
        expect(q.spanText.length).toBeGreaterThan(0);
        // 傍線のトークンは文の中で連続し、傍線の範囲を覆う
        const idx = q.tokenIds.map((tid) => s.tokens.findIndex((t) => t.id === tid));
        expect(idx.every((x) => x >= 0)).toBe(true);
        idx.forEach((x, k) => k > 0 && expect(x).toBe(idx[k - 1] + 1));
        expect(s.tokens[idx[0]].start).toBeLessThanOrEqual(q.span[0]);
        expect(s.tokens[idx[idx.length - 1]].end).toBeGreaterThanOrEqual(q.span[1]);
        // 同じ語は1回
        const key = q.kind === "vocab" ? `v:${q.lemma}` : `g:${q.target}:${q.explain.core}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      });
      // 本文の前から順
      for (let k = 1; k < questions.length; k++) {
        const order = (q: (typeof questions)[number]) => text.sentences.findIndex((x) => x.id === q.sentenceId) * 10000 + q.span[0];
        expect(order(questions[k])).toBeGreaterThan(order(questions[k - 1]));
      }
    }
    expect(total).toBeGreaterThan(500);
  });

  it("同じ入力なら同じ問題（決定的）", () => {
    const { text, analysis } = load("5954a8d9eb");
    expect(buildReadingTest(text, analysis)).toEqual(buildReadingTest(text, analysis));
  });

  it("火鼠の皮衣：語の意味と文法を4問ずつ、正解は決め手の意味", () => {
    const { text, analysis } = load("5954a8d9eb");
    const { questions } = buildReadingTest(text, analysis);
    expect(questions.filter((q) => q.kind === "vocab")).toHaveLength(4);
    expect(questions.filter((q) => q.kind === "grammar")).toHaveLength(4);
    const nao = questions.find((q) => q.spanText === "なほ")!;
    expect(nao.choices[nao.answerIndex]).toBe("やはり");
    const mashi = questions.find((q) => q.target === "まし")!;
    expect(mashi.spanText).toBe("まうで来なまし"); // 用言＋助動詞の連なり
    expect(mashi.choices[mashi.answerIndex]).toBe("反実仮想");
  });

  it("語に付いた句読点は傍線から外す（ちごのそらね「、寝入り」）", () => {
    const { text, analysis } = load("chigo-no-sorane");
    for (const q of buildReadingTest(text, analysis).questions) expect(q.spanText).not.toMatch(/^[、。]|[、。]$/);
  });

  it("本文の形と意味から助動詞を決める（同じ形の別の助動詞）", () => {
    expect(auxEntryOf("に", "完了")?.name).toBe("ぬ");
    expect(auxEntryOf("に", "断定")?.name).toBe("なり");
    expect(auxEntryOf("ぬ", "打消")?.name).toBe("ず");
    expect(auxEntryOf("る", "存続")?.name).toBe("り");
    expect(auxEntryOf("る", "自発")?.name).toBe("る");
    expect(auxEntryOf("らむ", "現推")?.name).toBe("らむ");
    expect(auxEntryOf("し", "尊敬")).toBeNull(); // 一覧に無い組は出さない
  });

  it("答え合わせ：右に自分の答え、左に判定（中立の文）", () => {
    const { text, analysis } = load("5954a8d9eb");
    const q = buildReadingTest(text, analysis).questions[0];
    const wrong = (q.answerIndex + 1) % q.choices.length;
    const b = readingThread(q, wrong, { teacher: "sei", voice: false });
    expect(b[0]).toEqual({ side: "me", kind: "answer", text: q.choices[wrong] });
    expect(b[1]).toMatchObject({ side: "teacher", kind: "verdict", verdict: "ng", text: `正しくは「${q.choices[q.answerIndex]}」。` });
  });
});

describe("読解テスト（手書きの問題ファイル）", () => {
  const { text } = load("5954a8d9eb");
  const s = text.sentences[2]; // もて至りて、唐にをる王慶に、金を取らす。
  const base = { no: 1, kind: "reading", sentenceId: s.id, prompt: "傍線部①の内容として…", choices: ["ア", "イ", "ウ"], answerIndex: 1, explain: "解説。" };

  it("文字範囲の傍線を読み、トークンを求める", () => {
    const t = parseManualTest({ textId: text.id, lead: "背景", questions: [{ ...base, span: [6, 10], spanText: "唐にをる" }] }, text, () => {});
    expect(t.source).toBe("manual");
    expect(t.lead).toBe("背景");
    expect(t.questions).toHaveLength(1);
    expect(t.questions[0]).toMatchObject({ no: 1, kind: "reading", span: [6, 10], spanText: "唐にをる", answerIndex: 1, explain: { text: "解説。" } });
    expect(t.questions[0].tokenIds).toEqual(["s3-t5", "s3-t6", "s3-t7"]);
  });

  it("spanText が本文と合わない・番号が範囲外・kind が不明の問題は捨てて知らせる", () => {
    const warns: string[] = [];
    const t = parseManualTest(
      {
        questions: [
          { ...base, span: [6, 10], spanText: "唐にいる" },
          { ...base, span: [6, 10], spanText: "唐にをる", answerIndex: 3 },
          { ...base, kind: "other", span: [6, 10], spanText: "唐にをる" },
          { ...base, sentenceId: "s999", span: [0, 1], spanText: "x" },
          { ...base, no: 5, span: [0, 4], spanText: "もて至り", prompt: "傍線部⑤の意味" },
        ],
      },
      text,
      (m) => warns.push(m),
    );
    expect(warns).toHaveLength(4);
    expect(t.questions).toHaveLength(1);
    expect(t.questions[0].no).toBe(1);
    expect(t.questions[0].prompt).toBe("傍線部①の意味"); // 捨てた分を詰めて番号を振り直す
  });
});
