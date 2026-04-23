// api/_requireStaff.ts
//
// 認可は以下のいずれかを満たせば通す:
// - header: x-admin-token  (優先)
// - query:  ?token=
//   → env ADMIN_VIEW_TOKEN と一致
// - header: Authorization: Bearer <CRON_SECRET>
//   → env CRON_SECRET と一致（Vercel Cron 用）
// 戻り値 actor は監査ログに使う。

export async function requireStaff(req: any): Promise<{ actor: string }> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = (req.headers?.authorization || req.headers?.Authorization || "").toString();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { actor: "cron" };
  }

  const tokenEnv = process.env.ADMIN_VIEW_TOKEN;
  const headerTok = req.headers?.["x-admin-token"] || req.headers?.["X-Admin-Token"];
  const queryTok = (req.query && (req.query.token as string)) || undefined;
  const token = (headerTok || queryTok)?.toString();

  if (tokenEnv && token && token === tokenEnv) {
    return { actor: "admin-token" };
  }

  throw new Error("PERMISSION_DENIED");
}
