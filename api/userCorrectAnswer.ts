import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { answerId, userCorrection, userId } = req.body as {
      answerId: string;
      userCorrection: "OK" | "NG" | "PARTIAL" | null;
      userId: string;
    };

    if (!answerId) return res.status(400).json({ error: "answerId required" });

    const { data: cur, error: getErr } = await supabaseAdmin
      .from("answers")
      .select("id, raw, manual, final")
      .eq("id", answerId)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!cur) return res.status(404).json({ error: "Answer not found" });

    const nowIso = new Date().toISOString();
    const auto = (cur.raw as any)?.auto ?? { result: "NG", reason: "" };

    let manual: any;
    let finalObj: any;

    if (userCorrection === null) {
      manual = null;
      finalObj = {
        ...(cur.final as any),
        result: auto.result || "NG",
        source: "auto",
        reason: auto.reason || "",
        at: nowIso,
      };
    } else {
      manual = { result: userCorrection, by: { userId, at: nowIso } };
      finalObj = {
        ...(cur.final as any),
        result: userCorrection,
        source: "manual",
        reason: `user_correction:${userCorrection}`,
        at: nowIso,
      };
    }

    const { error: updErr } = await supabaseAdmin
      .from("answers")
      .update({ manual, final: finalObj })
      .eq("id", answerId);
    if (updErr) throw updErr;

    return res.json({ ok: true, answerId, updated: { manual, final: finalObj } });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
