// GET  /api/textPublications                      -> { rows: [{slug, published, title, note, updated_at, updated_by}] }
// POST /api/textPublications                      body: { slug, published, title?, note? }
// POST /api/textPublications  action=login        body: { action: "login", username, password } -> { ok, token }
//
// Login は認証不要（TEACHER_USERNAME/TEACHER_PASSWORD と照合 → ADMIN_VIEW_TOKEN を返す）。
// それ以外の分岐は x-admin-token または Authorization: Bearer <CRON_SECRET> が必要。
// Vercel Hobby の Serverless Functions 12 本上限対策で login も当エンドポイントに同居。

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return res.status(400).json({ error: "missing_credentials" });
  }

  const envUser = process.env.TEACHER_USERNAME;
  const envPass = process.env.TEACHER_PASSWORD;
  const adminToken = process.env.ADMIN_VIEW_TOKEN;

  if (!envUser || !envPass || !adminToken) {
    return res.status(500).json({ error: "server_not_configured" });
  }

  const userOk = timingSafeEqual(username, envUser);
  const passOk = timingSafeEqual(password, envPass);

  if (!userOk || !passOk) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  return res.status(200).json({ ok: true, token: adminToken });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 認証不要の login 経路
    if (req.method === "POST") {
      const action = (req.body as any)?.action;
      if (action === "login") {
        return handleLogin(req, res);
      }
    }

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
