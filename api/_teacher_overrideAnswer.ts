import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

type ResultLabel = "OK" | "NG";
type FinalSource = "auto" | "manual" | "override";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { actor } = await requireStaff(req);

    const { answerId, result, note } = req.body as {
      answerId: string;
      result: ResultLabel | null;
      note?: string;
    };

    if (!answerId || typeof result === "undefined") {
      return res.status(400).json({ error: "answerId/result required" });
    }
    if (note && note.length > 500) return res.status(400).json({ error: "note too long" });

    const { data: cur, error: getErr } = await supabaseAdmin
      .from("answers")
      .select("id, qid, answer_norm, raw, manual, final")
      .eq("id", answerId)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!cur) throw new Error("answer not found");

    const nowIso = new Date().toISOString();
    const auto = (cur.raw as any)?.auto ?? { result: "ABSTAIN", reason: "auto_missing" };

    const nextManual =
      result === null
        ? null
        : {
            result,
            reason: `teacher_override${note ? ": " + String(note) : ""}`,
            note: note ?? "",
            by: actor,
            at: nowIso,
            version: ((cur.manual as any)?.version ?? 0) + 1,
          };

    const nextFinal:
      | { result: ResultLabel | "ABSTAIN"; source: FinalSource; reason: string; by?: string; at?: string }
      = result === null
        ? { result: auto.result ?? "ABSTAIN", source: "auto", reason: auto.reason ?? "auto_missing" }
        : { result, source: "override", reason: "teacher_override", by: actor, at: nowIso };

    const { error: updErr } = await supabaseAdmin
      .from("answers")
      .update({ manual: nextManual, final: nextFinal })
      .eq("id", answerId);
    if (updErr) throw updErr;

    // audit log
    const { error: audErr } = await supabaseAdmin.from("override_audit").insert({
      ts: nowIso,
      action: result === null ? "revert" : "teacher_override",
      actor,
      answer_id: answerId,
      qid: cur.qid,
      answer_norm: cur.answer_norm,
      final: nextFinal,
    });
    if (audErr) throw audErr;

    return res.json({ ok: true, final: nextFinal, manual: nextManual });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
