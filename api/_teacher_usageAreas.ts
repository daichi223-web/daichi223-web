// api/_teacher_usageAreas.ts
//
// 教員画面「利用状況」の「単語と教材」表示のデータ源（設計 = docs/learning-events-design.md §7）。
//   GET /api/teacher?action=usageAreas                         … 記録の全期間
//   GET /api/teacher?action=usageAreas&from=YYYY-MM-DD&to=YYYY-MM-DD  … JST の日付で両端を含む
// learning_events の集計は DB 関数 usage_by_area（migration 015）で行い、集計結果だけを返す。
// 生徒ごとの行の user_id は、_teacher_usageData と同じく「学校コード＋年・組・番号」か先頭 8 桁に置き換える。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import { loadIdentities, makeUserIndex } from "./_usageIdentity.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** JST の "YYYY-MM-DD" の 0 時を UTC の ISO に直す（shift 日ずらす） */
const jstStartIso = (day: string, shift = 0) =>
  new Date(new Date(day + "T00:00:00Z").getTime() + shift * 864e5 - 9 * 3600e3).toISOString();

const param = (raw: unknown) => {
  const s = typeof raw === "string" ? raw.trim() : "";
  return DAY.test(s) ? s : null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    if ((req.method || "GET").toUpperCase() !== "GET") {
      return res.status(405).json({ error: "GET only" });
    }
    const from = param(req.query.from);
    const to = param(req.query.to);

    const [agg, ids] = await Promise.all([
      supabaseAdmin.rpc("usage_by_area", {
        p_from: from ? jstStartIso(from) : null,
        p_to: to ? jstStartIso(to, 1) : null,
      }),
      loadIdentities(),
    ]);
    if (agg.error) throw new Error(`usage_by_area: ${agg.error.message}`);
    const data = agg.data as Record<string, any>;

    const { users, uOf } = makeUserIndex(ids.identity);
    const people = (data.people ?? []).map(({ uid, ...rest }: { uid: string }) => ({ u: uOf(uid), ...rest }));

    res.setHeader("Cache-Control", "no-store");
    res.json({
      generatedAt: new Date().toISOString(),
      from,
      to,
      ...data,
      people,
      users,
      piiDecrypted: ids.piiDecrypted,
      schools: ids.schools,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
