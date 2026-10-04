import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    // Public endpoint (students need this data). Server uses service role so it bypasses RLS.
    // 教員が決めた言い方（overrides 表）だけを返す。生徒の自己判定を集計した candidates は使わない
    // （甘い自己判定が正解の辞書に混ざるため）。
    const rulesByQid: Record<string, { ok: string[]; ng: string[] }> = {};

    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("overrides")
        .select("qid, answer_norm, label")
        .eq("active", true)
        .in("label", ["OK", "NG"])
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const batch = data ?? [];
      for (const r of batch) {
        if (!r.qid || !r.answer_norm) continue;
        const rules = (rulesByQid[r.qid] ??= { ok: [], ng: [] });
        (r.label === "OK" ? rules.ok : rules.ng).push(r.answer_norm);
      }
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    res.setHeader("Cache-Control", "s-maxage=300");
    return res.json(rulesByQid);
  } catch (e: any) {
    console.error("getAcceptedCandidates error:", e);
    return res.json({});
  }
}
