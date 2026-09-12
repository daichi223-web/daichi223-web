// /api/profile の呼び出し（プロフィール＝学校メール＋学年・組・番号。サーバ側で暗号化保存）。
// health-check の src/lib/pii.ts と同型：ユーザートークンはヘッダとボディの両方で送る
// （ブラウザ拡張が Authorization ヘッダを落とすことがあるため）。
import { supabase } from './supabase';
import { setCohort } from './cohort';

export type Profile = {
  registered: boolean;
  cohort?: string;
  grade?: number | null;
  class?: number | null;
  number?: number | null;
};

const CACHE_KEY = 'kobun:profile';

async function accessToken(): Promise<string> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  if (!session?.access_token) throw new Error('ログインしていません');
  return session.access_token;
}

export async function callProfile<T>(action: 'register' | 'me', body: Record<string, unknown> = {}): Promise<T> {
  const token = await accessToken();
  const resp = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body, _accessToken: token }),
  });
  const json = (await resp.json().catch(() => ({}))) as { error?: string } & T;
  if (!resp.ok || json.error) throw new Error(json.error || `サーバエラー（${resp.status}）`);
  return json;
}

export function cachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch { return null; }
}

export function clearProfileCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
}

/** サーバから自分のプロフィールを取り、登録済みならキャッシュし cohort（学校）も端末に反映する */
export async function fetchProfile(): Promise<Profile> {
  const p = await callProfile<Profile>('me');
  if (p.registered) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* noop */ }
    if (p.cohort) setCohort(p.cohort);
  } else {
    clearProfileCache();
  }
  return p;
}

export async function registerProfile(input: { grade: number | null; class: number; number: number; cohort: string }): Promise<Profile> {
  await callProfile<{ ok: true }>('register', input);
  return fetchProfile();
}
