import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { makeKey } from "./_normalize.js";
import { requireStaff } from "./_requireStaff.js";

type Label = "OK" | "NG" | "ABSTAIN";

type Body =
  | { key: string; label?: Label; reason?: string; active?: boolean; limit?: number }
  | { qid: string; answerRaw: string; label?: Label; reason?: string; active?: boolean; limit?: number };

function deriveKey(b: Body): string {
  // @ts-ignore
  if (b.key) return (b as any).key as string;
  // @ts-ignore
  return makeKey((b as any).qid as string, (b as any).answerRaw as string);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { actor } = await requireStaff(req);

    const body = req.body as Body;
    const key = deriveKey(body);
    const label = ((body as any).label ?? "OK") as Label;
    const reason = ((body as any).reason ?? "") as string;
    const active = ((body as any).active ?? true) as boolean;
    const limit = Number((body as any).limit ?? 500);

    if (!key) return res.status(400).json({ error: "key(or qid+answerRaw) required" });
    if (!["OK", "NG", "ABSTAIN"].includes(label)) return res.status(400).json({ error: "invalid label" });
    if (reason.length > 500) return res.status(400).json({ error: "reason too long" });

    const sep = key.indexOf("::");
    if (sep <= 0) return res.status(400).json({ error: "invalid key format" });
    const qid = key.slice(0, sep);
    const norm = key.slice(sep + 2);

    const nowIso = new Date().toISOString();

    // upsert override rule
    const { error: upErr } = await supabaseAdmin
      .from("overrides")
      .upsert(
        {
          qid,
          answer_norm: norm,
          label,
          active,
          reason,
          created_by: actor,
          updated_at: nowIso,
        },
        { onConflict: "qid,answer_norm" }
      );
    if (upErr) throw upErr;

    // find matching answers (exclude ones with a manual correction)
    const { data: candidates, error: qErr } = await supabaseAdmin
      .from("answers")
      .select("id, raw, manual")
      .eq("qid", qid)
      .eq("answer_norm", norm)
      .is("manual", null)
      .limit(limit);
    if (qErr) throw qErr;

    let updated = 0;
    for (const doc of candidates ?? []) {
      const nextFinal = active
        ? {
            result: label,
            source: "override",
            reason: `override:${key}${reason ? " - " + reason : ""}`,
            by: actor,
            at: nowIso,
          }
        : (() => {
            const auto = (doc.raw as any)?.auto ?? { result: "ABSTAIN", reason: "auto_missing" };
            return { result: auto.result, source: "auto", reason: auto.reason };
          })();

      const { error: uErr } = await supabaseAdmin
        .from("answers")
        .update({ final: nextFinal })
        .eq("id", doc.id);
      if (uErr) throw uErr;
      updated++;
    }

    // audit event
    const { error: aErr } = await supabaseAdmin.from("override_audit").insert({
      ts: nowIso,
      action: active ? "override_apply" : "override_cancel",
      actor,
      qid,
      answer_norm: norm,
      label,
      reason,
      affected: updated,
    });
    if (aErr) throw aErr;

    res.json({ ok: true, key, active, label, updated });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
