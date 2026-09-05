// api/deleteAllData.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { confirm } = req.body;
    if (confirm !== "DELETE_ALL_DATA") {
      return res.status(400).json({
        error: "確認用キーワードが必要です。body に { confirm: 'DELETE_ALL_DATA' } を送信してください。",
      });
    }

    const tables = ["answers", "candidates", "overrides", "override_audit"];
    const deleted: Record<string, number> = {};

    for (const name of tables) {
      const { count } = await supabaseAdmin.from(name).select("*", { count: "exact", head: true });
      // `.gte('created_at', epoch)` matches every row; all four tables have a created_at-like column
      // but to stay simple we use a filter that every row satisfies on *any* timestamp column.
      // Supabase requires at least one filter on .delete(), so we use `.not('qid', 'is', null)` for tables
      // that have qid, and similar for id tables.
      let deleteQuery;
      if (name === "answers" || name === "override_audit") {
        deleteQuery = supabaseAdmin.from(name).delete().not("id", "is", null);
      } else {
        deleteQuery = supabaseAdmin.from(name).delete().not("qid", "is", null);
      }
      const { error } = await deleteQuery;
      if (error) throw error;

      deleted[name] = count ?? 0;
    }

    return res.json({ ok: true, message: "全データを削除しました", deleted });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
