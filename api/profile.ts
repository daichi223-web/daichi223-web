// /api/profile — 生徒プロフィール（学校メール＋学年・組・番号）の登録と取得。
//
// 個人情報は AES-GCM で暗号化して profiles.profile_enc に置く（api/_pii.ts）。
// テーブルは RLS でクライアントから閉じてあり、この API（service_role）だけが触る。
//
// POST { action: "register", grade, class, number, cohort, _accessToken? }
//   → { ok: true }
//   * 本人確認は Bearer トークン（ヘッダ、またはボディの _accessToken＝拡張機能がヘッダを落とす対策）
//   * メールは JWT のユーザーのものだけを信用する（ボディの email は受け取らない）
//   * 匿名ユーザーは 403（先に linkEmailPassword でメールを付ける）
//   * ドメインは st.spec.ed.jp / spec.ed.jp のみ
// POST { action: "me", _accessToken? }
//   → { registered: true, cohort, grade, class, number } | { registered: false }
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { isAnonymousUser } from "./_mergeTicket.js";
import { decrypt, encrypt, getEncryptionKey, sha256hex } from "./_pii.js";

const ALLOWED_DOMAINS = ["st.spec.ed.jp", "spec.ed.jp"];
const COHORT_RE = /^[A-Za-z0-9_-]{1,40}$/;

type ProfilePlain = { email: string; grade: number | null; class: number | null; number: number | null };

function domainOk(email: string): boolean {
  const d = email.split("@")[1]?.toLowerCase();
  return !!d && ALLOWED_DOMAINS.includes(d);
}

/** 1〜max の整数、または null（空欄）。それ以外は undefined＝不正 */
function intOrNull(v: unknown, max: number): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isInteger(n) || n < 1 || n > max) return undefined;
  return n;
}

async function userFromRequest(req: VercelRequest): Promise<User | null> {
  const body = (req.body || {}) as { _accessToken?: string };
  let token: string | null = null;
  const h = (req.headers?.authorization || "").toString();
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) token = m[1];
  if (body._accessToken && typeof body._accessToken === "string") token = body._accessToken;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const body = (req.body || {}) as Record<string, unknown>;
    const action = body.action;
    if (action !== "register" && action !== "me") return res.status(400).json({ error: "unknown action" });

    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (isAnonymousUser(user) || !user.email) {
      return res.status(403).json({ error: "先に学校のメールとパスワードを登録してください" });
    }
    if (!domainOk(user.email)) {
      return res.status(403).json({ error: "学校のメールアドレス（@st.spec.ed.jp）で登録してください" });
    }

    const key = await getEncryptionKey();

    if (action === "me") {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("profile_enc, cohort")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.json({ registered: false });
      const plain = await decrypt(data.profile_enc, key);
      if (!plain) return res.json({ registered: false });
      const p = JSON.parse(plain) as ProfilePlain;
      return res.json({ registered: true, cohort: data.cohort, grade: p.grade, class: p.class, number: p.number });
    }

    // register
    const grade = intOrNull(body.grade, 3);
    const cls = intOrNull(body.class, 20);
    const number = intOrNull(body.number, 60);
    if (grade === undefined || cls === undefined || number === undefined) {
      return res.status(400).json({ error: "学年・組・番号の形式が正しくありません" });
    }
    if (cls === null || number === null) {
      return res.status(400).json({ error: "組と出席番号を入力してください" });
    }
    const cohortRaw = typeof body.cohort === "string" ? body.cohort.trim() : "";
    const cohort = cohortRaw && COHORT_RE.test(cohortRaw) ? cohortRaw : "default";

    const plain: ProfilePlain = { email: user.email, grade, class: cls, number };
    const row = {
      id: user.id,
      email_hash: await sha256hex(user.email),
      profile_enc: await encrypt(JSON.stringify(plain), key),
      cohort,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("profiles").upsert(row, { onConflict: "id" });
    if (error) {
      // email_hash unique 違反＝同じメールが別 uid で登録済み（別端末で先に登録した等）
      if (/duplicate key|unique/i.test(error.message)) {
        return res.status(409).json({ error: "このメールは別のアカウントで登録済みです。「登録済みのメールでログイン」から入ってください" });
      }
      throw error;
    }
    return res.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[profile]", message);
    const status = /PII_ENCRYPTION_KEY/.test(message) ? 500 : 500;
    return res.status(status).json({ error: /PII_ENCRYPTION_KEY/.test(message) ? "サーバの設定が未完了です（暗号化キー）" : "server error" });
  }
}
