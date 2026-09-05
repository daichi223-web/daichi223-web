// POST /api/mergeAccount  { ticket }
//   Authorization: Bearer <登録済みアカウントの access_token>
//   → { ok, merged: { word_stats:{merged,moved}, srs_state:{...}, grammar_topic_progress:{...} } }
// 検証: 呼び出し元は非匿名 / チケットは有効 / チケットの uid は匿名ユーザー / 両者は別人。
// 実行は SQL 関数 merge_user_progress（service_role のみ実行可）。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { isAnonymousUser, userFromBearer, verifyTicket } from "./_mergeTicket.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const toUser = await userFromBearer(req);
    if (!toUser) return res.status(401).json({ error: "unauthorized" });
    if (isAnonymousUser(toUser)) return res.status(403).json({ error: "sign in with a registered email first" });

    const { ticket } = (req.body || {}) as { ticket?: string };
    if (!ticket) return res.status(400).json({ error: "ticket required" });
    const t = verifyTicket(ticket);
    if (!t) return res.status(400).json({ error: "invalid or expired ticket" });
    if (t.fromUid === toUser.id) return res.status(400).json({ error: "same user" });

    // チケットの uid が本当に匿名ユーザーか（登録済みアカウント同士の統合はさせない）
    const { data: fromData, error: fromErr } = await supabaseAdmin.auth.admin.getUserById(t.fromUid);
    if (fromErr || !fromData?.user) return res.status(400).json({ error: "source user not found" });
    if (!isAnonymousUser(fromData.user)) return res.status(403).json({ error: "source must be anonymous" });

    const { data, error } = await supabaseAdmin.rpc("merge_user_progress", { from_uid: t.fromUid, to_uid: toUser.id });
    if (error) return res.status(500).json({ error: `merge failed: ${error.message}` });
    return res.json({ ok: true, merged: data });
  } catch (err) {
    return res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
}
