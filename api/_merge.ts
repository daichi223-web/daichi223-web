// Server-only: 端末統合のハンドラ2本。
// Hobby プランの Serverless Function 上限（12本）に収めるため、独立ファイルにせず
// /api/submitAnswer の action ディスパッチ（action=mergeTicket / mergeAccount）から呼ぶ。
//
// mergeTicket: Authorization: Bearer <匿名ユーザーの access_token>
//   → { ticket, counts: { word_stats, srs_state } }
//   匿名ユーザーだけがチケットを取れる（登録済みアカウントの記録を他人へ流し込ませない）
// mergeAccount: Authorization: Bearer <登録済みアカウントの access_token>, body { ticket }
//   → { ok, merged }
//   検証: 呼び出し元は非匿名 / チケット有効 / チケットの uid は匿名ユーザー / 両者は別人
//   実行は SQL 関数 merge_user_progress（service_role のみ実行可）
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { issueTicket, isAnonymousUser, userFromBearer, verifyTicket } from "./_mergeTicket.js";

export async function handleMergeTicket(req: VercelRequest, res: VercelResponse) {
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
}

export async function handleMergeAccount(req: VercelRequest, res: VercelResponse) {
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
}
