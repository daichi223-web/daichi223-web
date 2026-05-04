// 庭の公開フィルタを無視する「全閲覧」フラグ。
// `?unlock=<合言葉>` で有効化、`?unlock=off` で解除。
// 合言葉は ENV `VITE_FULL_ACCESS_PASSCODE` で上書き可。

const STORAGE_KEY = 'kobun:full-access';
const PASSCODE =
  (import.meta.env?.VITE_FULL_ACCESS_PASSCODE as string | undefined) || 'kobun-vip';

export function applyUnlockFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const u = new URL(window.location.href);
    const v = u.searchParams.get('unlock');
    if (v == null) return;
    if (v === 'off') {
      localStorage.removeItem(STORAGE_KEY);
    } else if (v === PASSCODE) {
      localStorage.setItem(STORAGE_KEY, '1');
    }
    u.searchParams.delete('unlock');
    window.history.replaceState(null, '', u.toString());
  } catch {
    /* ignore */
  }
}

export function hasFullAccess(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
