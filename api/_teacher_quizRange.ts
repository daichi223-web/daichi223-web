// 小テスト範囲の取得・設定（教員のみ）。
//
//   GET  /api/teacher?action=getQuizRange&cohort=default
//        -> { row: { cohort, label, range_from, range_to, due_date, note, active, updated_at } | null }
//   POST /api/teacher  body: { action: "setQuizRange", cohort?, label?, from, to, dueDate?, note?, active? }
//        -> { ok: true, row }
//   POST /api/teacher  body: { action: "setQuizRange", cohort?, active: false }  で無効化（行は残す）
//
// 生徒側は anon で quiz_ranges を直接 select する（RLS: active = true のみ）。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

const COLUMNS = "cohort, label, range_from, range_to, due_date, note, active, updated_by, updated_at";

function cohortOf(req: VercelRequest): string {
  const q = typeof req.query.cohort === "string" ? req.query.cohort : undefined;
  const b = (req.body as { cohort?: unknown } | undefined)?.cohort;
  const raw = (typeof b === "string" ? b : undefined) ?? q ?? "default";
  const trimmed = raw.trim();
  return trimmed === "" ? "default" : trimmed.slice(0, 60);
}

export async function getQuizRange(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    const cohort = cohortOf(req);
    const { data, error } = await supabaseAdmin
      .from("quiz_ranges")
      .select(COLUMNS)
      .eq("cohort", cohort)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ row: data ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "PERMISSION_DENIED") return res.status(401).json({ error: "unauthorized" });
    return res.status(500).json({ error: msg });
  }
}

export async function setQuizRange(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const { actor } = await requireStaff(req);
    const cohort = cohortOf(req);
    const body = (req.body ?? {}) as {
      label?: unknown;
      from?: unknown;
      to?: unknown;
      dueDate?: unknown;
      note?: unknown;
      active?: unknown;
    };

    const active = body.active === undefined ? true : body.active === true;

    // 無効化だけの呼び出しは範囲を要求しない
    if (!active) {
      const { data, error } = await supabaseAdmin
        .from("quiz_ranges")
        .update({ active: false, updated_by: actor, updated_at: new Date().toISOString() })
        .eq("cohort", cohort)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, row: data ?? null });
    }

    const from = Number(body.from);
    const to = Number(body.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return res.status(400).json({ error: "from/to must be integers" });
    }
    if (from < 1 || to < from || to > 999) {
      return res.status(400).json({ error: "invalid range" });
    }
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : null;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;
    let dueDate: string | null = null;
    if (typeof body.dueDate === "string" && body.dueDate.trim() !== "") {
      const d = body.dueDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: "dueDate must be YYYY-MM-DD" });
      dueDate = d;
    }

    const { data, error } = await supabaseAdmin
      .from("quiz_ranges")
      .upsert(
        {
          cohort,
          label,
          range_from: from,
          range_to: to,
          due_date: dueDate,
          note,
          active: true,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cohort" },
      )
      .select(COLUMNS)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, row: data ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "PERMISSION_DENIED") return res.status(401).json({ error: "unauthorized" });
    return res.status(500).json({ error: msg });
  }
}
