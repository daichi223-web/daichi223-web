import { supabase } from './supabase';

/**
 * Supabase Anonymous Sign-in によるセッションを保証する。
 * 既にセッションがあれば何もせず、user.id を返す。
 * Dashboard で Anonymous sign-ins が有効である必要あり。
 *
 * 失敗時は null を返し、呼び出し側はレガシー anonId（localStorage）にフォールバック可能。
 */
let ensurePromise: Promise<string | null> | null = null;

export function ensureAnonSession(): Promise<string | null> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.user) return sess.session.user.id;

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn('[anonAuth] signInAnonymously failed:', error.message);
        return null;
      }
      return data.user?.id ?? null;
    } catch (e) {
      console.warn('[anonAuth] unexpected error:', e);
      return null;
    } finally {
      // 次回呼び出しでは fresh check が走るよう cache をクリア
      // ただし同一ブート中の重複呼び出しは promise 共有で抑止する
    }
  })();
  return ensurePromise;
}

/**
 * 現在の auth.uid を返す（セッションが無い場合は Anonymous Sign-in を試行）。
 * それも失敗したら null。呼び出し側は localStorage anonId にフォールバックすること。
 */
export async function currentAuthUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id) return data.session.user.id;
  return ensureAnonSession();
}
