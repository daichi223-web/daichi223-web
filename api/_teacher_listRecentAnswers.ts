// api/listRecentAnswers.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const { data, error } = await supabaseAdmin
      .from("answers")
      .select("id, raw, curated, manual, final")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    res.json(data ?? []);
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
