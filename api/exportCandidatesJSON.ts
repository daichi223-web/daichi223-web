import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import { promises as fs } from "fs";
import path from "path";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);

    const candidatesByQid: Record<string, Array<{ answerNorm: string; freq: number; avgScore: number }>> = {};
    let total = 0;

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
        total++;
      }
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    const publicDir = path.join(process.cwd(), "public");
    const jsonPath = path.join(publicDir, "candidates.json");
    try { await fs.access(publicDir); } catch { await fs.mkdir(publicDir, { recursive: true }); }
    await fs.writeFile(jsonPath, JSON.stringify(candidatesByQid, null, 2), "utf-8");

    const deployHook = process.env.VERCEL_DEPLOY_HOOK;
    let deployed = false;
    if (deployHook) {
      try {
        const deployRes = await fetch(deployHook, { method: "POST" });
        deployed = deployRes.ok;
      } catch (e) {
        console.warn("Deploy hook failed:", e);
      }
    }

    return res.json({
      ok: true,
      candidatesCount: total,
      qidsCount: Object.keys(candidatesByQid).length,
      filePath: jsonPath,
      deployed,
      message: deployed
        ? "Candidates exported and deployment triggered"
        : "Candidates exported to JSON (manual deploy needed)",
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
