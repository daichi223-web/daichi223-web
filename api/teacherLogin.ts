import type { VercelRequest, VercelResponse } from "@vercel/node";

// 教員ログイン。
// env TEACHER_USERNAME / TEACHER_PASSWORD と照合し、成功したら
// 既存の ADMIN_VIEW_TOKEN を返して、以降は x-admin-token で他 API にアクセスさせる。
//
// 所要 env:
//   TEACHER_USERNAME
//   TEACHER_PASSWORD
//   ADMIN_VIEW_TOKEN

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

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

  // 必ず両方の比較を実行する（ユーザー名だけで early-return しない）ことで
  // タイミング差から「ユーザー名は合っていた」等の情報が漏れないようにする。
  const userOk = timingSafeEqual(username, envUser);
  const passOk = timingSafeEqual(password, envPass);

  if (!userOk || !passOk) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  return res.status(200).json({ ok: true, token: adminToken });
}
