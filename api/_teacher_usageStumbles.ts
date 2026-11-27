// api/_teacher_usageStumbles.ts
//
// 教員画面「利用状況」の「何でつまずいているか」のデータ源（設計 = docs/learning-events-design.md §10.5）。
//   GET /api/teacher?action=usageStumbles&from=YYYY-MM-DD&to=YYYY-MM-DD[&school=KU][&grade=1][&cls=3]
//     → 単語（意味ごと）・文法ドリル・文法の単元ごとの、解いた人数・間違えた人数・初回の誤答・
//       2回以上間違えた人数・何と間違えたか。
//   同 &type=word|drill|topic&id=…
//     → その語・ドリル・単元を、誰が何回まちがえたか（学校コード＋年-組-番号）。
// 誤答は選んだ期間の learning_events だけで数える（累計の表 word_stats は混ぜない）。
// 集計は DB 関数 usage_stumbles / usage_stumble_users（migration 016）。対象は登録済みの生徒だけ。
//   書き出し用（教員画面「単語の誤答を書き出す」）:
//     &export=words … 単語だけを返す（文法とドリルの問題文は引かない）。下限なし（1回答・1人から）。
//       数えるのは選択式の回答だけ（CHOICE_WORD_FORMATS。○×・記述は入れない。migration 019 の p_word_formats）。
//     &range=101-150 … 単語の番号（qid の「-」の前）で絞る。両端を含む。省略は全範囲。
//     このとき rangeTotals に、範囲内の単語の回答数・誤答数・語数の合計を返す
//     （解いた人の重複なしの数は DB 関数に無いので出さない）。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import { loadIdentities, makeUserIndex, dayParam, jstStartIso, parseUsageFilter, pickUsers } from "./_usageIdentity.js";
import { CHOICE_WORD_FORMATS, parseWordRange, wordNo } from "./_wordRange.js";

const TYPES = new Set(["word", "drill", "topic"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    if ((req.method || "GET").toUpperCase() !== "GET") {
      return res.status(405).json({ error: "GET only" });
    }
    const from = dayParam(req.query.from);
    const to = dayParam(req.query.to);
    const filter = parseUsageFilter(req.query as Record<string, unknown>);
    const type = typeof req.query.type === "string" ? req.query.type : "";
    const id = typeof req.query.id === "string" ? req.query.id.slice(0, 200) : "";

    const ids = await loadIdentities();
    const picked = pickUsers(ids.identity, filter);
    const period = { p_from: from ? jstStartIso(from) : null, p_to: to ? jstStartIso(to, 1) : null, p_users: picked };
    res.setHeader("Cache-Control", "no-store");

    // ---- 誰が何回まちがえたか ----
    if (type) {
      if (!TYPES.has(type) || !id) return res.status(400).json({ error: "type / id が不正です" });
      const r = await supabaseAdmin.rpc("usage_stumble_users", { ...period, p_type: type, p_id: id });
      if (r.error) throw new Error(`usage_stumble_users: ${r.error.message}`);
      const { users, uOf } = makeUserIndex(ids.identity);
      const rows = ((r.data ?? []) as any[]).map(({ uid, ...rest }) => ({ who: users[uOf(uid)], ...rest }));
      return res.json({ type, id, rows });
    }

    // ---- 書き出し用：単語だけ・下限なし・番号の範囲 ----
    if (req.query.export === "words") {
      const rawRange = typeof req.query.range === "string" ? req.query.range : "";
      const range = parseWordRange(rawRange);
      if (rawRange && !range) return res.status(400).json({ error: "range は 101-150 の形で指定してください" });
      const r = await supabaseAdmin.rpc("usage_stumbles", { ...period, p_min_n: 1, p_min_users: 1, p_word_formats: CHOICE_WORD_FORMATS });
      if (r.error) throw new Error(`usage_stumbles: ${r.error.message}`);
      const all =((r.data as Record<string, any>)?.words ?? []) as any[];
      const words = range
        ? all.filter((w) => {
            const no = wordNo(String(w.id));
            return no != null && no >= range[0] && no <= range[1];
          })
        : all;
      const rangeTotals = words.reduce(
        (t, w) => ({ words: t.words + 1, n: t.n + (w.n ?? 0), wrong: t.wrong + (w.wrong ?? 0) }),
        { words: 0, n: 0, wrong: 0 },
      );
      return res.json({
        generatedAt: new Date().toISOString(),
        from,
        to,
        filter,
        range,
        formats: CHOICE_WORD_FORMATS,
        registered: picked.length,
        rangeTotals,
        words,
      });
    }

    // ---- 語・ドリル・単元ごと ----
    // 組まで絞ると人数が少ないので、出す下限を下げる（全体・学年 = 5回答3人、組 = 3回答2人）
    const narrow = filter.cls != null;
    const r = await supabaseAdmin.rpc("usage_stumbles", {
      ...period,
      p_min_n: narrow ? 3 : 5,
      p_min_users: narrow ? 2 : 3,
    });
    if (r.error) throw new Error(`usage_stumbles: ${r.error.message}`);
    const data = r.data as Record<string, any>;

    // ドリルの問題文（集計に出てきたものだけ）
    const drillIds: string[] = (data.drills ?? []).map((d: any) => d.id);
    const drillInfo: Record<string, { prompt: string; context: string | null; answer: unknown }> = {};
    for (let i = 0; i < drillIds.length; i += 200) {
      const q = await supabaseAdmin
        .from("grammar_drills")
        .select("id,prompt,context,answer")
        .in("id", drillIds.slice(i, i + 200));
      if (q.error) throw new Error(`grammar_drills: ${q.error.message}`);
      for (const d of q.data ?? []) drillInfo[d.id] = { prompt: d.prompt, context: d.context, answer: d.answer };
    }

    res.json({
      generatedAt: new Date().toISOString(),
      from,
      to,
      filter,
      registered: picked.length,
      ...data,
      drillInfo,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
