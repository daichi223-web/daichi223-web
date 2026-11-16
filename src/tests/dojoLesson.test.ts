import { describe, it, expect } from "vitest";
import fs from "node:fs";
import type { GrammarDrill, GrammarTopic } from "@/lib/kobun/types";
import {
  ASK_MAX,
  QUICK_PER_SECTION,
  buildLessonPlan,
  buildScriptPlan,
  isAskable,
  isLessonScript,
  SCRIPT_ASK_MAX,
  type LessonScript,
  lessonIntroLine,
  lessonStartLines,
  lessonWrapLines,
  setsuzokuQuiz,
  skipSteps,
  splitSectionPieces,
  tableQuiz,
  termAnswerLines,
  termOptionNames,
  termOptions,
  prerequisiteTerms,
  termsIn,
  type LessonPiece,
  type LessonPlan,
} from "@/lib/kobun/dojoLesson";

// 実データ：単元の解説（public/grammar）とドリルの seed（supabase/seeds。本番へ入れた元）
const TOPICS: GrammarTopic[] = fs
  .readdirSync("public/grammar")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(`public/grammar/${f}`, "utf8")) as GrammarTopic);

function seedDrills(): GrammarDrill[] {
  const out: GrammarDrill[] = [];
  for (const f of fs.readdirSync("supabase/seeds").filter((x) => x.endsWith(".json"))) {
    let d: unknown;
    try {
      d = JSON.parse(fs.readFileSync(`supabase/seeds/${f}`, "utf8"));
    } catch {
      continue;
    }
    const rows = Array.isArray(d) ? d : ((d as Record<string, unknown>).drills as unknown[] | undefined) ?? [];
    for (const r of rows as Record<string, unknown>[]) {
      if (typeof r?.topic_id !== "string") continue;
      out.push({
        id: String(r.id),
        topicId: r.topic_id,
        kind: r.kind as GrammarDrill["kind"],
        prompt: String(r.prompt ?? ""),
        context: (r.context as string) ?? undefined,
        choices: (r.choices as string[]) ?? undefined,
        answer: r.answer as string | string[],
        explanation: String(r.explanation ?? ""),
        refHeading: (r.ref_heading as string) ?? undefined,
        sort: (r.sort as number) ?? 0,
      });
    }
  }
  return out;
}
const DRILLS = seedDrills();

/** かたまりの中の文字（記号を除く）。元の本文の文字が落ちていないかを見る */
const letters = (s: string) => s.replace(/[\s|:：\-*#>`。、]/g, "").replace(/^\d+\./, "");
const pieceText = (p: LessonPiece) => ("text" in p ? p.text : p.lines.join("")) + ("caption" in p && p.caption ? p.caption : "");

describe("解説を小さなかたまりに分ける", () => {
  it("地の文は1文ずつ、見出しつきの行・箇条書き・例文・表を分ける", () => {
    const md = "**接続**: 動詞の**連用形**に付く。\n\n| 未然形 | 連用形 |\n|:--|:--|\n| けら | − |\n\n- **き**: 体験過去\n- **けり**: 伝聞過去\n\n物語の「〜けり」は語り手の過去。昔話に使われる。\n\n例:\n> むかし、男ありけり。\n\n### 1. 小見出し\n1. 主語が高貴 → 尊敬";
    expect(splitSectionPieces(md)).toEqual([
      { type: "text", text: "**接続**: 動詞の**連用形**に付く。" },
      { type: "table", lines: ["| 未然形 | 連用形 |", "|:--|:--|", "| けら | − |"] },
      { type: "item", text: "**き**: 体験過去" },
      { type: "item", text: "**けり**: 伝聞過去" },
      { type: "text", text: "物語の「〜けり」は語り手の過去。" },
      { type: "text", text: "昔話に使われる。" },
      { type: "example", text: "例: むかし、男ありけり。" },
      { type: "heading", text: "1. 小見出し" },
      { type: "item", text: "1. 主語が高貴 → 尊敬" },
    ]);
  });

  it("全単元の全節：本文の文字が1つも落ちない・表はまるごと1つ", () => {
    let sections = 0;
    for (const t of TOPICS)
      for (const s of t.sections) {
        sections++;
        const pieces = splitSectionPieces(s.content);
        expect(pieces.length).toBeGreaterThan(0);
        const joined = letters(pieces.map(pieceText).join(""));
        // 本文の文字の並びがそのまま残る（「例」「用例」の付け替えと記号は比べない）
        const norm = (x: string) => x.replace(/例|用例/g, "").replace(/[【】]/g, "");
        expect(norm(joined)).toBe(norm(letters(s.content)));
        const tables = s.content.split("\n").filter((l, i, a) => l.includes("|") && a[i + 1]?.includes("--")).length;
        expect(pieces.filter((p) => p.type === "table")).toHaveLength(tables);
      }
    expect(sections).toBeGreaterThan(150);
  });
});

describe("レッスンの材料（節・途中の問い・ドリルの問い）", () => {
  const asksOf = (p: LessonPlan) => [...p.sections, ...(p.finalCheck ? [p.finalCheck] : [])].flatMap((s) => s.steps.flatMap((x) => (x.kind === "ask" ? [{ x, heading: s.heading }] : [])));

  it("全単元：ドリルの問いは1〜8問・重複なし・答えられる問いだけ・その節の問い。途中の問いの正解は選択肢に1つだけ", () => {
    let units = 0;
    let quicks = 0;
    for (const t of TOPICS) {
      const mine = DRILLS.filter((d) => d.topicId === t.id);
      if (mine.length === 0) continue;
      const plan = buildLessonPlan(t, mine, () => 0.5);
      const asks = asksOf(plan);
      expect(asks.length).toBeGreaterThan(0);
      expect(asks.length).toBeLessThanOrEqual(ASK_MAX);
      expect(new Set(asks.map((a) => a.x.drill.id)).size).toBe(asks.length);
      for (const a of asks) {
        expect(isAskable(a.x.drill)).toBe(true);
        if (a.heading) expect(a.x.drill.refHeading).toBe(a.heading);
      }
      for (const s of plan.sections) {
        const qs = s.steps.flatMap((x) => (x.kind === "quick" ? [x.q] : []));
        expect(qs.length).toBeLessThanOrEqual(QUICK_PER_SECTION);
        quicks += qs.length;
        for (const q of qs) {
          expect(q.choices.filter((c) => c === q.answer)).toHaveLength(1);
          expect(new Set(q.choices).size).toBe(q.choices.length);
          expect(q.choices.length).toBeGreaterThanOrEqual(2);
        }
        // 途中の問いは、もとになった表・行のすぐあと
        s.steps.forEach((x, k) => {
          if (x.kind === "quick") expect(s.steps[k - 1].kind).toBe("piece");
        });
        // ドリルの問いは節の最後にまとまっている
        const firstAsk = s.steps.findIndex((x) => x.kind === "ask");
        if (firstAsk >= 0) expect(s.steps.slice(firstAsk).every((x) => x.kind === "ask")).toBe(true);
      }
      units++;
    }
    expect(units).toBeGreaterThan(40);
    expect(quicks).toBeGreaterThan(50);
  });

  it("表から1問：活用表は同じ行のほかの欄、項目の表は同じ列のほかの行が選択肢", () => {
    const conj = tableQuiz(["| 未然形 | 連用形 | 終止形 | 連体形 | 已然形 | 命令形 |", "|:--|:--|:--|:--|:--|:--|", "| けら | − | **けり** | **ける** | **けれ** | − |"], () => 0.1)!;
    expect(conj.prompt).toMatch(/^表で「(未然形|終止形|連体形|已然形)」の欄は？$/);
    expect(["けら", "けり", "ける", "けれ"]).toContain(conj.answer);
    expect(conj.choices.every((c) => ["けら", "けり", "ける", "けれ"].includes(c))).toBe(true);
    const item = tableQuiz(["| 意味 | 訳 |", "|:--|:--|", "| **過去（伝聞）** | 〜た（という） |", "| **詠嘆** | 〜だなあ |"], () => 0.1)!;
    expect(item.prompt).toMatch(/^「(過去（伝聞）|詠嘆)」の「訳」は？$/);
    expect(item.choices.sort()).toEqual(["〜た（という）", "〜だなあ"].sort());
    // 同じ値が2つある欄（ラ変の連用形・終止形「り」）は問わない
    const rahen = tableQuiz(["| 未然形 | 連用形 | 終止形 | 連体形 | 已然形 | 命令形 |", "|:--|:--|:--|:--|:--|:--|", "| ら | り | り | る | れ | れ |"], () => 0.1)!;
    expect(["ら", "る"]).toContain(rahen.answer);
  });

  it("接続の行から1問：活用形の名前が1つだけのとき", () => {
    expect(setsuzokuQuiz("**接続**: 動詞・助動詞の**連用形**に付く。", () => 0.2)).toMatchObject({ answer: "連用形", prompt: "今の説明で、接続は何形？" });
    expect(setsuzokuQuiz("**接続**: サ変の未然形・四段の已然形に付く。")).toBeNull();
    expect(setsuzokuQuiz("**活用型**: ラ変型")).toBeNull();
  });

  it("助動詞「けり」：接続の行と活用表のあとに途中の問い、最後に節の問い。用語「接続」「連用形」が聞ける", () => {
    const t = TOPICS.find((x) => x.id === "jodoshi-keri")!;
    const plan = buildLessonPlan(t, DRILLS.filter((d) => d.topicId === t.id), () => 0.3);
    const s0 = plan.sections[0];
    expect(s0.heading).toBe("接続と活用");
    // 節の問いが「何形に接続する？」なので、「接続：連用形」の行からの問いは出さない（表からの1問だけ）
    expect(s0.steps.map((x) => x.kind)).toEqual(["piece", "piece", "quick", "piece", "ask"]);
    expect(s0.steps.some((x) => x.kind === "ask" && x.drill.prompt.includes("接続"))).toBe(true);
    expect(s0.terms.map((x) => x.term).slice(0, 2)).toEqual(["接続", "連用形"]);
  });

  it("分かっている節は「問題だけ」：その節のドリルの問い（無ければ表を使わない途中の問い）", () => {
    const t = TOPICS.find((x) => x.id === "jodoshi-keri")!;
    const plan = buildLessonPlan(t, DRILLS.filter((d) => d.topicId === t.id), () => 0.3);
    expect(skipSteps(plan.sections[1]).every((x) => x.kind === "ask")).toBe(true);
    // ドリルの問いが無い節（作ったもの）：接続の行の問いは残り、表の問いは外れる
    const q = (prompt: string) => ({ kind: "quick" as const, q: { prompt, choices: ["a", "b"], answer: "a", explain: "" } });
    const noAsk = { ...plan.sections[0], steps: [q("今の説明で、接続は何形？"), q("表で「連体形」の欄は？")] };
    expect(skipSteps(noAsk).map((x) => (x.kind === "quick" ? x.q.prompt : ""))).toEqual(["今の説明で、接続は何形？"]);
  });

  it("どの節にも問いが結びつかない単元は、最後の確かめに3問（形容詞・形容動詞の活用の、2026-11-16 より前の見出し「活用表」で確かめる）", () => {
    const t = TOPICS.find((x) => x.id === "keiyoshi-katsuyo")!;
    const old = DRILLS.filter((d) => d.topicId === t.id).map((d) => ({ ...d, refHeading: "活用表" }));
    const plan = buildLessonPlan(t, old, () => 0.3);
    expect(plan.sections.every((s) => s.steps.every((x) => x.kind !== "ask"))).toBe(true);
    expect(plan.finalCheck?.steps).toHaveLength(3);
  });

  it("形容詞・形容動詞の活用の問いは、ク活用・シク活用の活用表の節に結びつく（2026-11-16 に見出しを直した）", () => {
    const t = TOPICS.find((x) => x.id === "keiyoshi-katsuyo")!;
    const asks = asksOf(buildLessonPlan(t, DRILLS.filter((d) => d.topicId === t.id), () => 0.3));
    expect(new Set(asks.map((a) => a.heading))).toEqual(new Set(["ク活用の活用表", "シク活用の活用表"]));
  });

  it("問いが多い単元（尊敬語・8節）でも8問まで。問いのある節（7節）には少なくとも1問ずつ", () => {
    const t = TOPICS.find((x) => x.id === "keigo-sonkei")!;
    const asks = asksOf(buildLessonPlan(t, DRILLS.filter((d) => d.topicId === t.id), () => 0.3));
    expect(asks.length).toBeLessThanOrEqual(ASK_MAX);
    expect(new Set(asks.map((a) => a.heading)).size).toBe(7);
  });

  it("先生の一言：まずは／じゃあ〜を説明するね／最後は、用語の答え、はじめの問いかけ", () => {
    expect(lessonIntroLine("接続と活用", "first")).toBe("まずは「接続と活用」から。");
    expect(lessonIntroLine("意味の判別", "chosen")).toBe("じゃあ「意味の判別」を説明するね。");
    expect(lessonIntroLine("「む」と「むず」", "last")).toBe("最後は「む」と「むず」。");
    expect(termAnswerLines({ term: "接続", body: "前の語の形のきまり。例がある。" })).toEqual(["「接続」は、", "前の語の形のきまり。", "例がある。"]);
    expect(lessonStartLines("助動詞「けり」", [{ term: "接続", body: "" }, { term: "連用形", body: "" }])).toEqual([
      "助動詞「けり」を、少しずつ説明していくね。",
      "説明には「接続」「活用形」などの言葉が出てくるよ。",
      "意味は分かる？",
    ]);
    expect(lessonWrapLines(["a", "b"])).toEqual(["ここまでのまとめ。", "a", "b", "あとはドリルで仕上げよう。"]);
  });
});

describe("「分からない言葉」の選択肢は、先に要る言葉だけ・抽象度をそろえる（2026-11-15 ユーザー指摘）", () => {
  const T = (id: string) => TOPICS.find((x) => x.id === id)!;
  it("単元そのものが教える言葉は出さない（動詞の活用の「活用」「四段活用」、けりの「過去」「詠嘆」）", () => {
    const katsuyo = T("doushi-katsuyo");
    const kt = prerequisiteTerms(katsuyo, termsIn(katsuyo.sections.map((s) => s.content).join(" "))).map((e) => e.term);
    expect(kt).not.toContain("活用");
    expect(kt).not.toContain("四段活用");
    expect(kt).toContain("語幹");
    const keri = T("jodoshi-keri");
    const kk = prerequisiteTerms(keri, termsIn(keri.sections.map((s) => s.content).join(" "))).map((e) => e.term);
    expect(kk).not.toContain("過去");
    expect(kk).not.toContain("詠嘆");
    expect(kk).toEqual(expect.arrayContaining(["接続", "連用形"])); // 要約に出てきても、先に要る言葉は残す
  });

  it("同じ種類の用語は1つの選択肢にまとめ、1語でも種類の名前で出す", () => {
    const e = (term: string) => ({ term, body: "" });
    const opts = termOptions([e("活用"), e("未然形"), e("連用形"), e("終止形"), e("確定"), e("語幹")]);
    expect(opts.map((o) => o.label)).toEqual(["「活用」", "活用形（未然形・連用形など）", "接続（つながり方：確定）", "「語幹」"]);
    // はじめの「説明には〜」は文法用語で、やさしい言い方は（ ）書き（2026-11-16 ユーザー指示）
    expect(termOptionNames(opts)).toBe("「活用」「活用形」「接続（つながり方）」「語幹」");
    expect(opts[1].entries.map((x) => x.term)).toEqual(["未然形", "連用形", "終止形"]);
  });

  it("全単元：はじめの選択肢は4つまで・重なりなし", () => {
    for (const t of TOPICS) {
      if (t.id.startsWith("vocab")) continue;
      const opts = termOptions(buildLessonPlan(t, [], () => 0.5).startTerms);
      expect(opts.length).toBeLessThanOrEqual(4);
      expect(new Set(opts.map((o) => o.key)).size).toBe(opts.length);
    }
  });
});

describe("先生の台本からレッスンを組む（public/grammar-lessons、2026-11-16）", () => {
  const ids: string[] = JSON.parse(fs.readFileSync("public/grammar-lessons/index.json", "utf8"));
  const scripts = ids.map((id) => JSON.parse(fs.readFileSync(`public/grammar-lessons/${id}.json`, "utf8")) as LessonScript);

  it("44単元の台本がそろい、どれも使える形", () => {
    expect(ids.length).toBe(44);
    for (const L of scripts) expect(isLessonScript(L, L.id)).toBe(true);
    expect(isLessonScript({ id: "x", parts: [] }, "x")).toBe(false);
    expect(isLessonScript(scripts[0], "ちがう単元")).toBe(false);
  });

  it("台本の1部分＝1節：説明 → 表 → 確かめ → ドリルの問い。確かめの正解は先頭、問いは8問まで", () => {
    for (const L of scripts) {
      const topic = TOPICS.find((t) => t.id === L.id)!;
      const plan = buildScriptPlan(topic, L, DRILLS.filter((d) => d.topicId === L.id), () => 0.3);
      expect(plan.sections.map((s) => s.heading)).toEqual(L.parts.map((p) => p.title));
      plan.sections.forEach((sec, i) => {
        const part = L.parts[i];
        const kinds = sec.steps.map((x) => x.kind);
        // 並び：piece が先、quick、ask の順
        expect([...kinds].sort((a, b) => ["piece", "quick", "ask"].indexOf(a) - ["piece", "quick", "ask"].indexOf(b))).toEqual(kinds);
        expect(sec.steps.filter((x) => x.kind === "piece" && x.piece.type === "text")).toHaveLength(part.say.length);
        // table の節は、表・段の図か、表の無い節なら「解説を見る」カードで必ず出る
        if (part.table) expect(sec.steps.some((x) => x.kind === "piece" && ["table", "dan", "ref"].includes(x.piece.type)), `${L.id} ${part.title}`).toBe(true);
        for (const st of sec.steps) {
          if (st.kind === "quick") expect(st.q.choices[0]).toBe(st.q.answer);
          if (st.kind === "ask") expect(st.drill.refHeading).toBe(part.drillHeading);
        }
        expect(sec.ask).toBe(part.ask);
        expect(sec.known).toBe(part.known);
      });
      const asks = plan.sections.flatMap((s) => s.steps.filter((x) => x.kind === "ask"));
      expect(asks.length).toBeLessThanOrEqual(SCRIPT_ASK_MAX);
      expect(plan.keyPoints).toEqual(L.wrap?.length ? L.wrap : topic.keyPoints ?? []);
    }
  });

  it("はじめの用語は台本の terms から、単元そのものが教える言葉（題名の語）は外す", () => {
    const L = scripts.find((x) => x.id === "doushi-yodan")!;
    const topic = TOPICS.find((t) => t.id === L.id)!;
    const plan = buildScriptPlan(topic, L, [], () => 0.3);
    expect(plan.startTerms.map((e) => e.term)).not.toContain("四段活用");
  });
});
