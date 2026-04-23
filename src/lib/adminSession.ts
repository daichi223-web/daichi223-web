/**
 * 教員セッション関連ヘルパー。
 *
 * C-8 Step 1 移行中なので cookie 経路とレガシー localStorage 経路の両方を扱う:
 *   - 正: HttpOnly cookie `admin_session` + 非 HttpOnly `admin_csrf`
 *   - 旧: localStorage `ADMIN_VIEW_TOKEN`
 *
 * HttpOnly cookie は JS から読めないので、ペアの `admin_csrf` cookie の
 * 有無で生存判定の代替をしている。
 */

/** 教員セッションが生きているかの簡易判定 */
export function hasAdminSession(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.cookie.includes('admin_csrf=')) return true;
  try {
    return !!localStorage.getItem('ADMIN_VIEW_TOKEN');
  } catch {
    return false;
  }
}

/**
 * ログアウト: サーバーに cookie 失効を要請しつつ、レガシー localStorage も消す。
 * エラーは無視（最終的に呼び出し側の reload で強制リセット）。
 */
export async function logoutAdmin(): Promise<void> {
  try {
    await fetch('/api/textPublications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'logout' }),
    });
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem('ADMIN_VIEW_TOKEN');
  } catch {
    // ignore
  }
}

/** logoutAdmin + window.reload() */
export function clearAdminToken(): void {
  void logoutAdmin().finally(() => {
    if (typeof window !== 'undefined') window.location.reload();
  });
}
