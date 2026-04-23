import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    // Public endpoint (students need this data). Server uses service role so it bypasses RLS.
    const candidatesByQid: Record<string, Array<{ answerNorm: string; freq: number; avgScore: number }>> = {};

    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("candidates")
        .select("qid, answer_norm, freq, avg_score")
        .eq("proposed_role", "accept")
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const batch = data ?? [];
      for (const r of batch) {
        const qid = r.qid;
        const answerNorm = r.answer_norm;
        if (!qid || !answerNorm) continue;
        if (!candidatesByQid[qid]) candidatesByQid[qid] = [];
        candidatesByQid[qid].push({
          answerNorm,
          freq: r.freq ?? 0,
          avgScore: r.avg_score ?? 0,
        });
      }
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    res.setHeader("Cache-Control", "s-maxage=300");
    return res.json(candidatesByQid);
  } catch (e: any) {
    console.error("getAcceptedCandidates error:", e);
    return res.json({});
  }
}
