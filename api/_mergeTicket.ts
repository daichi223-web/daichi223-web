// Server-only: 端末統合チケットの発行・検証と、Bearer トークンからのユーザー取得。
//
// 流れ: 匿名の端末Bで「登録済みメールでログイン」を押す →
//   B の JWT で /api/mergeTicket → B の uid を HMAC 署名したチケットを返す（30分有効）→
//   マジックリンクで A としてログイン後、A の JWT + チケットで /api/mergeAccount →
//   両方の本人性を確認してから merge_user_progress(B → A)。
// 生の auth トークンを端末に二重保存しないための仕組み。
import type { VercelRequest } from "@vercel/node";
import type { User } from "@supabase/supabase-js";
import crypto from "crypto";
import { supabaseAdmin } from "./_supabaseAdmin.js";

const TICKET_TTL_SEC = 30 * 60;

function secret(): string {
  const s = process.env.MERGE_TICKET_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("MERGE_TICKET_SECRET / SUPABASE_SERVICE_ROLE_KEY is not set");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** uid（UUID、"." を含まない）と期限を HMAC で束ねる */
export function issueTicket(fromUid: string): string {
  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SEC;
  const payload = `${fromUid}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyTicket(ticket: string): { fromUid: string } | null {
  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  const [fromUid, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!/^[0-9a-f-]{36}$/i.test(fromUid) || !exp || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = sign(`${fromUid}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { fromUid };
}

/** Authorization: Bearer <access_token> を検証してユーザーを返す。無効なら null */
export async function userFromBearer(req: VercelRequest): Promise<User | null> {
  const h = (req.headers?.authorization || "").toString();
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(m[1]);
  if (error || !data?.user) return null;
  return data.user;
}

export function isAnonymousUser(u: User): boolean {
  return u.is_anonymous ?? !u.email;
}
