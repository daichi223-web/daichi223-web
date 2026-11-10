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
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import { loadIdentities, makeUserIndex, dayParam, jstStartIso, parseUsageFilter, pickUsers } from "./_usageIdentity.js";

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
