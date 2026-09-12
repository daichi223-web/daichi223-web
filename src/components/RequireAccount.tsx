import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ensureAnonSession } from '@/lib/anonAuth';
import { getAccountStatus } from '@/lib/auth';
import { cachedProfile, fetchProfile } from '@/lib/profile';
import { AUTH_REQUIRED } from '@/lib/authFlags';

// 初回起動時の登録ガード。
//   匿名のまま（メール未登録）→ /account?required=1 へ
//   メールは付いているがプロフィール（組・番号）未登録 → 同じく /account へ
// 登録前の匿名記録は同じ uid に残るので、登録後そのまま引き継がれる。
// /account 自身と、認証コールバック・教師画面・採点テストは対象外。
//
// 安全弁: 既定はオフ。Vercel の環境変数 VITE_AUTH_REQUIRED=1 を入れて再デプロイした時だけ必須になる。
// 生徒が入れなくなる等のトラブルが起きたら、この変数を消して再デプロイすれば元に戻る
// （コードを revert する必要はない）。オフの間は /account から任意で登録できる。

const EXEMPT = ['/account', '/auth/callback', '/teacher', '/test-grading'];

export default function RequireAccount({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const exempt = !AUTH_REQUIRED || EXEMPT.some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/'));
  const [state, setState] = useState<'checking' | 'ok' | 'redirect'>(exempt ? 'ok' : 'checking');

  useEffect(() => {
    if (exempt) { setState('ok'); return; }
    let alive = true;
    setState('checking'); // 前のページで決めた結果を持ち越さない（/account から戻った時に再確認）
    (async () => {
      try {
        await ensureAnonSession();
        const st = await getAccountStatus();
        if (!alive) return;
        if (st.isAnonymous) { setState('redirect'); return; }
        if (cachedProfile()?.registered) { setState('ok'); return; }
        const p = await fetchProfile();
        if (!alive) return;
        setState(p.registered ? 'ok' : 'redirect');
      } catch {
        // サーバ側の一時障害で学習を止めない（メールが付いている人だけここに来る）
        if (alive) setState('ok');
      }
    })();
    return () => { alive = false; };
  }, [loc.pathname, exempt]);

  // 除外ページは状態に関係なく素通し（前ページの 'redirect' が残っていても /account でループさせない）
  if (exempt || state === 'ok') return <>{children}</>;
  if (state === 'redirect') {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/account?required=1&next=${next}`} replace />;
  }
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <p className="text-scaffold">確認中…</p>
    </div>
  );
}
