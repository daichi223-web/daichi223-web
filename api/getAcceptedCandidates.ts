import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Public endpoint — no authentication required (students need this data)
    const snap = await db
      .collection("candidates")
      .where("proposedRole", "==", "accept")
      .get();

    // qid別に正解候補をグループ化
    const candidatesByQid: Record<string, Array<{
      answerNorm: string;
      freq: number;
      avgScore: number;
    }>> = {};

    for (const doc of snap.docs) {
      const data = doc.data();
      const qid = data.qid;
      const answerNorm = data.answerNorm;
      const freq = data.freq || 0;
      const avgScore = data.avgScore || 0;

      if (!qid || !answerNorm) continue;

      if (!candidatesByQid[qid]) {
        candidatesByQid[qid] = [];
      }

      candidatesByQid[qid].push({ answerNorm, freq, avgScore });
    }

    // 5 minute CDN cache
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.json(candidatesByQid);
  } catch (e: any) {
    console.error("getAcceptedCandidates error:", e);
    // Graceful fallback: return empty object on failure
    return res.json({});
  }
}
