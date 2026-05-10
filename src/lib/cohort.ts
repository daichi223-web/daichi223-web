// 学年・学校・クラスごとに別々の教材セットを表示する仕組み (cohort)。
// 生徒は URL `?cohort=2A-2026` を踏むと localStorage に保存され、以降そのコホートの
// 教材だけを見ることになる。`?cohort=default` または `?cohort=` で初期化。
//
// テーブル text_publications は (slug, cohort) 複合キーを持つ。
// 生徒は (cohort = self) UNION (cohort = 'default') を見る。

const STORAGE_KEY = 'kobun:cohort';
export const DEFAULT_COHORT = 'default';

export function getCohort(): string {
  if (typeof window === 'undefined') return DEFAULT_COHORT;
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_COHORT;
  } catch {
    return DEFAULT_COHORT;
  }
}

export function setCohort(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!name || name === DEFAULT_COHORT) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, name);
    }
  } catch {
    /* noop */
  }
}

/**
 * URL に `?cohort=2A-2026` が付いていたら localStorage に保存して URL から削除。
 * 起動時に `applyUnlockFromUrl()` と並行で呼ぶ想定。
 */
export function applyCohortFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const u = new URL(window.location.href);
    const v = u.searchParams.get('cohort');
    if (v == null) return;
    setCohort(v.trim());
    u.searchParams.delete('cohort');
    window.history.replaceState(null, '', u.toString());
  } catch {
    /* noop */
  }
}
