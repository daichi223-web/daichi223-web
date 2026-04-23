// api/_requireStaff.ts
//
// 認可は以下のいずれかを満たせば通す:
// - Authorization: Bearer <CRON_SECRET>   （Vercel Cron 用）
// - Cookie: admin_session=<ADMIN_VIEW_TOKEN>   （httpOnly cookie 経路、推奨）
//     + 状態変更リクエスト時は Cookie admin_csrf と header x-csrf-token の一致（double-submit）
// - header: x-admin-token = <ADMIN_VIEW_TOKEN>   （レガシー、段階移行中のみ残す）
// - query:  ?token=<ADMIN_VIEW_TOKEN>             （同上）
//
// 戻り値 actor は監査ログに使う。

function parseCookie(raw: string | undefined | null, key: string): string | null {
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function isUnsafeMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(m);
}

export async function requireStaff(req: any): Promise<{ actor: string }> {
  // 1. Cron
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = (req.headers?.authorization || req.headers?.Authorization || "").toString();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { actor: "cron" };
  }

  const tokenEnv = process.env.ADMIN_VIEW_TOKEN;
  if (!tokenEnv) throw new Error("PERMISSION_DENIED");

  const cookieRaw = (req.headers?.cookie || "").toString();

  // 2. Cookie 経路（推奨）
  const sessionCookie = parseCookie(cookieRaw, "admin_session");
  if (sessionCookie && sessionCookie === tokenEnv) {
    if (isUnsafeMethod(req.method)) {
      const csrfCookie = parseCookie(cookieRaw, "admin_csrf");
      const csrfHeader = (req.headers?.["x-csrf-token"] || req.headers?.["X-CSRF-Token"] || "").toString();
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        throw new Error("PERMISSION_DENIED");
      }
    }
    return { actor: "admin-cookie" };
  }

  // 3. レガシー header / query 経路（段階移行中）
  const headerTok = req.headers?.["x-admin-token"] || req.headers?.["X-Admin-Token"];
  const queryTok = (req.query && (req.query.token as string)) || undefined;
  const token = (headerTok || queryTok)?.toString();
  if (token && token === tokenEnv) {
    return { actor: "admin-token-legacy" };
  }

  throw new Error("PERMISSION_DENIED");
}
