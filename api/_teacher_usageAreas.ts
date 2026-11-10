// api/_teacher_usageAreas.ts
//
// 教員画面「利用状況」の「誰が使っているか」のデータ源（設計 = docs/learning-events-design.md §7・§10.5）。
//   GET /api/teacher?action=usageAreas&from=YYYY-MM-DD&to=YYYY-MM-DD[&school=KU][&grade=1][&cls=3]
//     期間は JST の日付で両端を含む（省略すると記録の全期間）。
// 集計に入れるのは登録済みの生徒だけ（学校・年・組で絞れる）。組・番号は暗号化されているので、
// ここで該当する生徒の user_id を選び、DB 関数（migration 016）の p_users に渡す。
//   usage_by_area … 領域別・重なり・日ごと・教材別・生徒別
//   usage_ranges  … 生徒ごとの 単語の番号帯・文法の単元・教材（どの範囲をやっているか）
// 集計結果だけを返す。生徒ごとの行の user_id は「学校コード＋年・組・番号」（users の index）に置き換える。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import {
  loadIdentities,
  makeUserIndex,
  dayParam,
  jstStartIso,
  parseUsageFilter,
  pickUsers,
  buildRoster,
} from "./_usageIdentity.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    if ((req.method || "GET").toUpperCase() !== "GET") {
      return res.status(405).json({ error: "GET only" });
    }
    const from = dayParam(req.query.from);
    const to = dayParam(req.query.to);
    const filter = parseUsageFilter(req.query as Record<string, unknown>);

    const ids = await loadIdentities();
    const picked = pickUsers(ids.identity, filter);
    const args = {
      p_from: from ? jstStartIso(from) : null,
      p_to: to ? jstStartIso(to, 1) : null,
      p_users: picked,
    };
    const [agg, rng] = await Promise.all([
      supabaseAdmin.rpc("usage_by_area", args),
      supabaseAdmin.rpc("usage_ranges", args),
    ]);
    if (agg.error) throw new Error(`usage_by_area: ${agg.error.message}`);
    if (rng.error) throw new Error(`usage_ranges: ${rng.error.message}`);
    const data = agg.data as Record<string, any>;
    const ranges = rng.data as Record<string, any[]>;

    const { users, uOf } = makeUserIndex(ids.identity);
    const swap = (rows: any[] | undefined) => (rows ?? []).map(({ uid, ...rest }: { uid: string }) => ({ u: uOf(uid), ...rest }));

    res.setHeader("Cache-Control", "no-store");
    res.json({
      generatedAt: new Date().toISOString(),
      from,
      to,
      filter,
      ...data,
      people: swap(data.people),
      ranges: { vocab: swap(ranges.vocab), grammar: swap(ranges.grammar), text: swap(ranges.text) },
      users,
      registered: picked.length,
      roster: buildRoster(ids.identity),
      piiDecrypted: ids.piiDecrypted,
      schools: ids.schools,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
