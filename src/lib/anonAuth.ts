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
      let authUid: string | null = sess.session?.user?.id ?? null;

      if (!authUid) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          const msg = error.message || '';
          if (/anonymous/i.test(msg) && /(disabled|not enabled|provider)/i.test(msg)) {
            // Dashboard で Anonymous Sign-in が OFF のまま。
            // RLS が auth.uid ベースだと書き込みが全て silent fail する危険。
            console.error(
              '[anonAuth] Supabase で Anonymous Sign-in が無効です。\n' +
                '  Dashboard > Authentication > Providers > "Allow anonymous sign-ins" を ON にしてください。\n' +
                '  有効化するまで word_stats / srs_state への書き込みは RLS により拒否されます。',
            );
          } else {
            console.warn('[anonAuth] signInAnonymously failed:', msg);
          }
          return null;
        }
        authUid = data.user?.id ?? null;
      }

      // C-7 Phase 4-b: legacy anonId の rekey を一度だけ試みる
      if (authUid) {
        void migrateLegacyAnonId(authUid);
      }
      return authUid;
    } catch (e) {
      console.warn('[anonAuth] unexpected error:', e);
      return null;
    }
  })();
  return ensurePromise;
}

const MIGRATION_FLAG_KEY = 'anonId_migrated';

/**
 * localStorage に残っている legacy 'anon_<uuid>' 形式の user_id を
 * 現 auth.uid に rekey するサーバ呼び出しを一度だけ試みる。
 * - 既に migrate 済みフラグが立っていたら skip
 * - legacy anonId が無ければ skip
 * - サーバ側が idempotent（toUserId にデータがあれば skip）なので
 *   並行タブからの同時実行も安全
 */
async function migrateLegacyAnonId(toUserId: string): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;
    const fromUserId = localStorage.getItem('anonId');
    if (!fromUserId || !fromUserId.startsWith('anon_')) {
      // 既に legacy ID が無い = 新規ユーザーなので migrate 不要。フラグだけ立てる
      localStorage.setItem(MIGRATION_FLAG_KEY, '1');
      return;
    }
    if (fromUserId === toUserId) return;

    const resp = await fetch('/api/submitAnswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'migrate', fromUserId, toUserId }),
    });
    if (!resp.ok) {
      console.warn('[anonAuth] migrate failed:', resp.status);
      return;
    }
    const json = await resp.json();
    if (json?.ok) {
      localStorage.setItem(MIGRATION_FLAG_KEY, '1');
      // legacy anonId は migrate 後は不要なので消す
      localStorage.removeItem('anonId');
      if (json.migrated && (json.migrated.word_stats || json.migrated.srs_state)) {
        console.info('[anonAuth] migrated', json.migrated);
      }
    }
  } catch (e) {
    console.warn('[anonAuth] migrate error:', e);
  }
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
