// api/_teacher_usageWritingAnswers.ts
//
// 教員画面「誤答分析」の「学校・学年ごとの記述の誤答」（2026-11-27）。
//   GET /api/teacher?action=usageWritingAnswers&from=YYYY-MM-DD&to=YYYY-MM-DD[&school=KU][&grade=1][&cls=3]
//     → 記述（意味を書く・文脈から意味を書く）の 語（意味）ごとの回答・誤答の人数と、よくある誤答（表記ゆれをまとめたもの）。
// 元は learning_events の ctx.answer（アプリが記述の判定と一緒に答えの文を入れる。それより前の答えは入らない）。
// 対象は登録済みの生徒だけ（利用状況タブと同じ絞り込み。組・番号は暗号化されているので復号して user_id を渡す）。
// 誤答分析の既存の表（candidates＝answers 表から「候補を集計」で作る）とは別で、そちらは変えない。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import { loadIdentities, buildRoster, dayParam, jstStartIso, parseUsageFilter, pickUsers } from "./_usageIdentity.js";
import { groupWritingWrongs, type WritingWrongRow } from "./_writingAnswers.js";

/** よくある誤答は、間違えた人の多い順にここまで返す */
const MAX_WRONGS = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    if ((req.method || "GET").toUpperCase() !== "GET") {
      return res.status(405).json({ error: "GET only" });
    }
    const from = dayParam(req.query.from);
    const to = dayParam(req.query.to);
    const filter = parseUsageFilter(req.query as Record<string, unknown>);

    const ids = await loadIdentities();
    const picked = pickUsers(ids.identity, filter);
    res.setHeader("Cache-Control", "no-store");

    const r = await supabaseAdmin.rpc("usage_writing_answers", {
      p_from: from ? jstStartIso(from) : null,
      p_to: to ? jstStartIso(to, 1) : null,
      p_users: picked,
    });
    if (r.error) throw new Error(`usage_writing_answers: ${r.error.message}`);
    const data = (r.data ?? {}) as { items?: any[]; wrongs?: WritingWrongRow[] };
    const grouped = groupWritingWrongs(data.wrongs ?? []);
    const wrongs = grouped.slice(0, MAX_WRONGS);

    // 教員がすでに正解の辞書で決めた言い方（overrides）に印を付ける
    const decided = new Map<string, string>();
    const qids = [...new Set(wrongs.map((w) => w.id))];
    for (let i = 0; i < qids.length; i += 200) {
      const q = await supabaseAdmin
        .from("overrides")
        .select("qid, answer_norm, label")
        .eq("active", true)
        .in("qid", qids.slice(i, i + 200));
      if (q.error) throw new Error(`overrides: ${q.error.message}`);
      for (const o of q.data ?? []) decided.set(`${o.qid}::${o.answer_norm}`, o.label);
    }

    return res.json({
      generatedAt: new Date().toISOString(),
      from,
      to,
      filter,
      registered: picked.length,
      // 絞り込みの選択肢（学校・年・組ごとの登録人数）
      roster: buildRoster(ids.identity),
      piiDecrypted: ids.piiDecrypted,
      items: data.items ?? [],
      wrongs: wrongs.map((w) => ({ ...w, override: decided.get(`${w.id}::${w.answerNorm}`) ?? null })),
      wrongsTotal: grouped.length,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
