import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { normalize } from "./_normalize.js";
import crypto from "crypto";

type ResultLabel = "OK" | "NG" | "ABSTAIN";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { qid, answerRaw, uid, anonId, autoScore, autoResult, autoReason, questionType } = req.body as {
      qid: string;
      answerRaw: string;
      uid?: string | null;
      anonId?: string;
      autoScore: number;
      autoResult: ResultLabel;
      autoReason: string;
      questionType?: 'writing' | 'selection';
    };

    if (!qid || !answerRaw) {
      return res.status(400).json({ error: "qid and answerRaw required" });
    }

    const nowIso = new Date().toISOString();
    const answerNorm = normalize(answerRaw);
    const dedupeKey = crypto.createHash("sha1").update(`${qid}::${answerNorm}`).digest("hex");
    const qType = questionType || "writing";

    const raw = {
      ts: nowIso,
      qid,
      uid: uid || null,
      anonId: anonId || null,
      answerRaw,
      autoAt: nowIso,
      questionType: qType,
      auto: { result: autoResult, score: autoScore, reason: autoReason },
    };
    const curated = {
      v: 1,
      answerNorm,
      dedupeKey,
      flags: {
        pii: false,
        tooLong: answerRaw.length > 200,
        regexRisk: /[.*+?^${}()|[\]\\]/.test(answerRaw),
      },
    };
    let finalObj: any = {
      result: autoResult,
      source: "auto",
      reason: autoReason,
      at: nowIso,
    };

    // Check for existing override
    const { data: ov, error: ovErr } = await supabaseAdmin
      .from("overrides")
      .select("label, active, reason, created_by")
      .eq("qid", qid)
      .eq("answer_norm", answerNorm)
      .maybeSingle();
    if (ovErr) throw ovErr;

    if (ov && ov.active) {
      finalObj = {
        result: ov.label,
        source: "override",
        reason: `override:${qid}::${answerNorm}${ov.reason ? " - " + ov.reason : ""}`,
        by: ov.created_by || "system",
        at: nowIso,
      };
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("answers")
      .insert({
        qid,
        answer_norm: answerNorm,
        question_type: qType,
        raw,
        curated,
        manual: null,
        final: finalObj,
        created_at: nowIso,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return res.json({
      ok: true,
      answerId: inserted!.id,
      final: finalObj,
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
