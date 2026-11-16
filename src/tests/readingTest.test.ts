import { describe, it, expect } from "vitest";
import fs from "node:fs";
import type { KobunText, TextAnalysis } from "@/lib/kobun/types";
import { auxEntryOf, availableGroups, buildReadingTest, parseManualTest, readingThread, selectGroup, splitSentences } from "@/lib/kobun/readingTest";

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

describe("読解テスト（分類：助動詞｜助詞・係り結び｜単語｜訳・読解）", () => {
  const { text } = load("5954a8d9eb");
  const raw = JSON.parse(fs.readFileSync("public/reading-tests/5954a8d9eb.json", "utf8"));
  const test = parseManualTest(raw, text, () => {});

  it("火鼠の皮衣は4つの分類に分かれ、どの問題もちょうど1つの分類か「全部」に入る", () => {
    const groups = availableGroups(test);
    expect(groups.map((g) => [g.group.id, g.count])).toEqual([
      ["aux", 12],
      ["joshi", 5],
      ["vocab", 8],
      ["read", 8],
    ]);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(test.questions.length);
  });

  it("分類で選ぶと番号と問い文の丸数字を1から振り直し、元の番号を srcNo に残す", () => {
    const qs = selectGroup(test, "vocab");
    expect(qs.every((q) => q.kind === "vocab")).toBe(true);
    qs.forEach((q, i) => {
      expect(q.no).toBe(i + 1);
      expect(q.prompt.startsWith(`傍線部${"①②③④⑤⑥⑦⑧"[i]}「${q.spanText}」`)).toBe(true);
      expect(test.questions[q.srcNo! - 1].spanText).toBe(q.spanText);
    });
    // 本文の順のまま
    const order = qs.map((q) => q.srcNo!);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("全部（null）は番号を変えない", () => {
    const qs = selectGroup(test, null);
    expect(qs.map((q) => q.no)).toEqual(test.questions.map((q) => q.no));
    expect(qs.map((q) => q.srcNo)).toEqual(test.questions.map((q) => q.no));
  });

  it("3問に満たない分類はボタンを出さない（自動問題の教材でも分類は2つまで）", () => {
    const few = { ...test, questions: test.questions.filter((q) => q.kind !== "vocab" || q.no < 5) };
    expect(availableGroups(few).map((g) => g.group.id)).toEqual(["aux", "joshi", "read"]);
  });

  it("助動詞・助詞のどちらかが3問未満なら「助動詞・助詞」1つにまとめる（龍の首の玉から助動詞2・助詞2・単語3を残した形で確かめる。2026-11-16 に実データは各分類3問以上になった）", () => {
    const { text: t2 } = load("cd8147e868");
    const r2 = JSON.parse(fs.readFileSync("public/reading-tests/cd8147e868.json", "utf8"));
    const keep: Record<string, number> = { grammar: 2, keigo: 0, joshi: 1, kakari: 1, vocab: 3 };
    const seen: Record<string, number> = {};
    const qs = r2.questions.filter((q: { kind: string }) => {
      if (!(q.kind in keep)) return true;
      seen[q.kind] = (seen[q.kind] ?? 0) + 1;
      return seen[q.kind] <= keep[q.kind];
    });
    const g2 = availableGroups(parseManualTest({ ...r2, questions: qs }, t2, () => {}));
    const read = qs.filter((q: { kind: string }) => ["yaku", "reading", "subject"].includes(q.kind)).length;
    expect(g2.map((g) => [g.group.id, g.count])).toEqual([
      ["grammar", 4],
      ["vocab", 3],
      ["read", read],
    ]);
  });

  it("助詞だけを問う問題は「助詞・係り結び」に入り、手書きの問題ファイルの kind「joshi」を読める", () => {
    const qs = selectGroup(test, "joshi");
    expect(qs.map((q) => q.spanText)).toEqual(["昔", "申ししかば", "ものならば", "かくなむ申す", "これを聞きてぞ"]);
    expect(selectGroup(test, "aux").every((q) => q.kind === "grammar")).toBe(true);
  });
});

describe("読解テストの解説は一文ごとの吹き出し", () => {
  it("「。」で切り、かっこの中の「。」では切らない", () => {
    expect(splitSentences("「おこす」は〈よこす〉。手紙の頼みで「送れ。」と言う。訳は（略。）とする")).toEqual([
      "「おこす」は〈よこす〉。",
      "手紙の頼みで「送れ。」と言う。",
      "訳は（略。）とする",
    ]);
    expect(splitSentences("")).toEqual([]);
  });

  it("手書きの問題の解説が文の数だけ先生の吹き出しになる（火鼠の皮衣 問1）", () => {
    const { text } = load("5954a8d9eb");
    const raw = JSON.parse(fs.readFileSync("public/reading-tests/5954a8d9eb.json", "utf8"));
    const q = parseManualTest(raw, text, () => {}).questions[0];
    const b = readingThread(q, q.answerIndex, { teacher: "sei", voice: false });
    const texts = b.filter((x) => x.side === "teacher" && x.kind === "text").map((x) => (x as { text: string }).text);
    expect(texts).toEqual(splitSentences(raw.questions[0].explain));
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.join("")).toBe(raw.questions[0].explain);
  });
});

describe("手書きの読解テスト（public/reading-tests の全ファイル。2026-11-16 公開教材に問題を足した）", () => {
  const files = fs.readdirSync("public/reading-tests").filter((f) => f.endsWith(".json"));
  it("どのファイルも、捨てられる問題が無く、番号が1から順", () => {
    for (const f of files) {
      const id = f.replace(/\.json$/, "");
      const raw = JSON.parse(fs.readFileSync(`public/reading-tests/${f}`, "utf8"));
      const warns: string[] = [];
      const test = parseManualTest(raw, load(id).text, (m) => warns.push(m));
      expect(warns, id).toEqual([]);
      expect(test.questions.length, id).toBe(raw.questions.length);
      expect(raw.questions.map((q: { no: number }) => q.no), id).toEqual(raw.questions.map((_: unknown, i: number) => i + 1));
    }
  });
});
