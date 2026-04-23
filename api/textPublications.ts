// GET  /api/textPublications          -> { rows: [{slug, published, title, note, updated_at, updated_by}] }
// POST /api/textPublications          body: { slug, published, title?, note? }
//
// Staff token required (x-admin-token header).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { actor } = await requireStaff(req);

    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("text_publications")
        .select("slug, published, title, note, updated_at, updated_by")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return res.json({ rows: data ?? [] });
    }

    if (req.method === "POST") {
      const { slug, published, title, note } = req.body as {
        slug: string;
        published: boolean;
        title?: string;
        note?: string;
      };
      if (!slug || typeof published !== "boolean") {
        return res.status(400).json({ error: "slug and published required" });
      }
      const { error } = await supabaseAdmin.from("text_publications").upsert(
        {
          slug,
          published,
          title: title || null,
          note: note || null,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" }
      );
      if (error) throw error;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
