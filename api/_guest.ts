// お試し（ゲスト）のパスワード（2026-11-13 ユーザー指示）。/api/teacher の束ね口から呼ぶ。
//
//   POST /api/teacher  body: { action: "guestLogin", password }        → { ok: true, version } | 401（認証不要）
//   GET  /api/teacher?action=guestCheck&v=<version>                     → { ok: boolean }（認証不要。端末の印がまだ有効か）
//   GET  /api/teacher?action=getGuestAccess                             → { enabled, version, updated_at, updated_by }（教員のみ）
//   POST /api/teacher  body: { action: "setGuestAccess", password }     → 新しいパスワードにして有効化（教員のみ）
//   POST /api/teacher  body: { action: "setGuestAccess", enabled: false } → 止める（教員のみ）
//
// パスワードは scrypt のハッシュだけを guest_access 表に持つ（supabase/migrations/018_guest_access.sql）。
// 照合の前に NFKC で正規化し、前後の空白を落とす（全角の「ｇｕｅｓｔ１」も「guest1」と同じ）。
// version はパスワードを変える・止めるたびに +1。端末は入ったときの version を持ち、食い違えばゲストを外す。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import { hashGuestPassword, normalizeGuestPassword } from "./_guestHash.js";

type Row = { enabled: boolean; pass_hash: string | null; pass_salt: string | null; version: number; updated_at: string; updated_by: string | null };

async function readRow(): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from("guest_access")
    .select("enabled, pass_hash, pass_salt, version, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Row | null) ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function guestLogin(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const password = normalizeGuestPassword((req.body as { password?: unknown } | undefined)?.password);
    const row = await readRow();
    if (!row || !row.enabled || !row.pass_hash || !row.pass_salt) {
      return res.status(403).json({ error: "guest_disabled" });
    }
    const got = Buffer.from(hashGuestPassword(password, row.pass_salt), "hex");
    const want = Buffer.from(row.pass_hash, "hex");
    if (password === "" || got.length !== want.length || !timingSafeEqual(got, want)) {
      await sleep(600); // 総当たりを遅らせる
      return res.status(401).json({ error: "invalid_password" });
    }
    return res.status(200).json({ ok: true, version: row.version });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

export async function guestCheck(req: VercelRequest, res: VercelResponse) {
  try {
    const v = Number(typeof req.query.v === "string" ? req.query.v : NaN);
    const row = await readRow();
    const ok = !!row && row.enabled && Number.isInteger(v) && v === row.version;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

export async function getGuestAccess(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    const row = await readRow();
    return res.status(200).json({
      enabled: !!row?.enabled && !!row?.pass_hash,
      version: row?.version ?? 0,
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "PERMISSION_DENIED") return res.status(401).json({ error: "unauthorized" });
    return res.status(500).json({ error: msg });
  }
}

export async function setGuestAccess(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const { actor } = await requireStaff(req);
    const body = (req.body ?? {}) as { password?: unknown; enabled?: unknown };
    const row = await readRow();
    const nextVersion = (row?.version ?? 0) + 1;
    const now = new Date().toISOString();

    let update: Record<string, unknown>;
    if (body.enabled === false) {
      update = { id: 1, enabled: false, version: nextVersion, updated_by: actor, updated_at: now };
    } else {
      const password = normalizeGuestPassword(body.password);
      if (password.length < 4 || password.length > 64) {
        return res.status(400).json({ error: "パスワードは4〜64文字にしてください" });
      }
      const salt = randomBytes(16).toString("hex");
      update = {
        id: 1, enabled: true, pass_hash: hashGuestPassword(password, salt), pass_salt: salt,
        version: nextVersion, updated_by: actor, updated_at: now,
      };
    }
    const { error } = await supabaseAdmin.from("guest_access").upsert(update, { onConflict: "id" });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, enabled: update.enabled, version: nextVersion, updated_at: now });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "PERMISSION_DENIED") return res.status(401).json({ error: "unauthorized" });
    return res.status(500).json({ error: msg });
  }
}
