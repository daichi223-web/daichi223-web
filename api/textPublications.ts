// GET  /api/textPublications                           -> { rows: [{slug, published, title, note, updated_at, updated_by}] }
// POST /api/textPublications                           body: { slug, published, title?, note? }
// POST /api/textPublications  action=login             body: { action: "login", username, password }
//      -> Set-Cookie admin_session (HttpOnly) + admin_csrf, { ok, token } (backward compat)
// POST /api/textPublications  action=logout            body: { action: "logout" }
//      -> Set-Cookie で両 cookie を失効させる
//
// login / logout は認証不要。それ以外は requireStaff を通過。
// Vercel Hobby の Serverless Functions 12 本上限対策で同居させている。

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
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

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 日

function buildSessionCookies(token: string, csrf: string): string[] {
  // 本番は HTTPS 必須（Vercel は自動で HTTPS）。dev（localhost）で Secure 属性があると
  // cookie が送信されないため NODE_ENV で分岐。
  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  const secure = isProd ? " Secure;" : "";
  const base = `HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
  // CSRF cookie は JS から読む必要があるので HttpOnly を外す
  const csrfBase = `${secure.trim()} SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}`.trim();
  return [
    `admin_session=${encodeURIComponent(token)}; ${base}`,
    `admin_csrf=${encodeURIComponent(csrf)}; ${csrfBase}`,
  ];
}

function buildClearCookies(): string[] {
  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  const secure = isProd ? " Secure;" : "";
  return [
    `admin_session=; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=0`,
    `admin_csrf=;${secure} SameSite=Strict; Path=/; Max-Age=0`,
  ];
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

  const csrf = randomUUID().replace(/-/g, "");
  res.setHeader("Set-Cookie", buildSessionCookies(adminToken, csrf));
  // Step 1 移行期: token を JSON にも返してレガシー localStorage パスを維持。
  // Step 2 でここから token を削除する。
  return res.status(200).json({ ok: true, token: adminToken });
}

async function handleLogout(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Set-Cookie", buildClearCookies());
  return res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 認証不要のアクション（login / logout）
    if (req.method === "POST") {
      const action = (req.body as any)?.action;
      if (action === "login") return handleLogin(req, res);
      if (action === "logout") return handleLogout(req, res);
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
