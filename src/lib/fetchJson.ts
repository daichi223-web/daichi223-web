/**
 * JSON を期待する static アセットの fetch。
 *
 * SSO 認証壁 (Cisco Umbrella 等) にリダイレクトされた場合や、SPA fallback
 * rewrite の誤動作で index.html が返された場合、見かけ上 200 でも
 * content-type が text/html で body は HTML。そのまま .json() すると
 * SyntaxError で「not found」に誤解されるため、ここで明示的に分岐する。
 */

export type FetchJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'not-found' | 'intercepted' | 'network'; status?: number; message?: string };

export async function fetchJsonAsset<T>(path: string): Promise<FetchJsonResult<T>> {
  let r: Response;
  try {
    r = await fetch(path);
  } catch (e: any) {
    return { ok: false, kind: 'network', message: String(e?.message || e) };
  }
  if (r.status === 404) {
    return { ok: false, kind: 'not-found', status: 404 };
  }
  if (!r.ok) {
    return { ok: false, kind: 'network', status: r.status, message: `HTTP ${r.status}` };
  }
  const ctype = r.headers.get('content-type') || '';
  if (ctype.includes('text/html')) {
    // 200 だが HTML = Umbrella 認証壁 or Vercel SPA fallback の誤動作
    return { ok: false, kind: 'intercepted', status: r.status };
  }
  try {
    const data = (await r.json()) as T;
    return { ok: true, data };
  } catch (e: any) {
    // Content-Type が application/json でも壊れている場合
    return { ok: false, kind: 'intercepted', message: String(e?.message || e) };
  }
}
