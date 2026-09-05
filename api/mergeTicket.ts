// POST /api/mergeTicket
//   Authorization: Bearer <匿名ユーザーの access_token>
//   → { ticket, counts: { word_stats, srs_state } }
// 匿名ユーザーだけがチケットを取れる（登録済みアカウントの記録を他人へ流し込ませない）。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { issueTicket, isAnonymousUser, userFromBearer } from "./_mergeTicket.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const user = await userFromBearer(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (!isAnonymousUser(user)) return res.status(403).json({ error: "only anonymous users can request a merge ticket" });

    // この端末の匿名記録の量（統合するか本人に確認するための表示用）
    const [ws, srs] = await Promise.all([
      supabaseAdmin.from("word_stats").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabaseAdmin.from("srs_state").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    return res.json({
      ticket: issueTicket(user.id),
      counts: { word_stats: ws.count ?? 0, srs_state: srs.count ?? 0 },
    });
  } catch (err) {
    return res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
}
