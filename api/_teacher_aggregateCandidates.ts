import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);

    const minFreq = Number(req.query.minFreq || 3);
    const lookbackDays = Number(req.query.lookbackDays || 7);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffIso = cutoff.toISOString();

    // Page through large result sets (Supabase default range max is 1000)
    const pageSize = 1000;
    let offset = 0;
    type Row = { qid: string; answer_norm: string; raw: any; manual: any; final: any; created_at: string };
    const all: Row[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("answers")
        .select("qid, answer_norm, raw, manual, final, created_at")
        .gte("created_at", cutoffIso)
        .eq("question_type", "writing")
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const batch = (data ?? []) as Row[];
      all.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    const aggregated = new Map<string, {
      qid: string;
      answerNorm: string;
      freq: number;
      lastSeen: string;
      scores: number[];
      sampleRaw: string;
    }>();

    for (const row of all) {
      const qid = row.qid;
      const answerNorm = row.answer_norm;
      const answerRaw = row.raw?.answerRaw ?? "";
      if (!qid || !answerNorm) continue;

      let score = row.raw?.auto?.score ?? 0;
      let finalResult = row.final?.result;

      if (row.manual?.result) {
        finalResult = row.manual.result;
        if (finalResult === "PARTIAL") continue;
        score = finalResult === "OK" ? 100 : finalResult === "NG" ? 0 : 50;
      }

      const key = `${qid}::${answerNorm}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.freq++;
        existing.scores.push(score);
        if (row.created_at > existing.lastSeen) existing.lastSeen = row.created_at;
      } else {
        aggregated.set(key, {
          qid,
          answerNorm,
          freq: 1,
          lastSeen: row.created_at,
          scores: [score],
          sampleRaw: answerRaw,
        });
      }
    }

    let saved = 0;
    const rowsToSave: any[] = [];
    for (const agg of aggregated.values()) {
      if (agg.freq < minFreq) continue;
      const avgScore = agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length;
      const bandMode = avgScore >= 80 ? "HIGH" : avgScore >= 50 ? "MID" : "LOW";
      const proposedRole = avgScore >= 80 ? "accept" : avgScore < 50 ? "negative" : "review";
      rowsToSave.push({
        qid: agg.qid,
        answer_norm: agg.answerNorm,
        freq: agg.freq,
        last_seen: agg.lastSeen,
        band_mode: bandMode,
        proposed_role: proposedRole,
        avg_score: Math.round(avgScore),
        sample_any: agg.sampleRaw,
        updated_at: new Date().toISOString(),
      });
    }

    // Batch upsert in chunks
    const chunkSize = 500;
    for (let i = 0; i < rowsToSave.length; i += chunkSize) {
      const chunk = rowsToSave.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin
        .from("candidates")
        .upsert(chunk, { onConflict: "qid,answer_norm" });
      if (error) throw error;
      saved += chunk.length;
    }

    return res.json({
      ok: true,
      processed: all.length,
      aggregated: aggregated.size,
      saved,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
