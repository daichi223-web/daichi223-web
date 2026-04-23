// api/listCandidates.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);

    const limit = Number(req.query.limit || 100);
    const qid = req.query.qid ? String(req.query.qid) : null;
    const role = req.query.role ? String(req.query.role) : null;

    let query = supabaseAdmin
      .from("candidates")
      .select("qid, answer_norm, freq, last_seen, band_mode, proposed_role, avg_score, sample_any, updated_at");

    if (qid) query = query.eq("qid", qid);
    if (role) query = query.eq("proposed_role", role);

    const { data, error } = await query.order("freq", { ascending: false }).limit(limit);
    if (error) throw error;

    // Preserve frontend-facing field names
    const candidates = (data ?? []).map(r => ({
      id: `${r.qid}::${r.answer_norm}`,
      qid: r.qid,
      answerNorm: r.answer_norm,
      freq: r.freq,
      lastSeen: r.last_seen,
      bandMode: r.band_mode,
      proposedRole: r.proposed_role,
      avgScore: r.avg_score,
      sampleAny: r.sample_any,
      updatedAt: r.updated_at,
    }));

    return res.json({ ok: true, candidates, total: candidates.length });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
