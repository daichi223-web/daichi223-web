import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ensureAnonSession } from '@/lib/anonAuth';
import { getAccountStatus } from '@/lib/auth';
import { cachedProfile, fetchProfile } from '@/lib/profile';
import { AUTH_REQUIRED } from '@/lib/authFlags';
import { isGuest, verifyGuest } from '@/lib/guest';

// 初回起動時の登録ガード。
//   匿名のまま（メール未登録）→ /account?required=1 へ
//   メールは付いているがプロフィール（組・番号）未登録 → 同じく /account へ
// 登録前の匿名記録は同じ uid に残るので、登録後そのまま引き継がれる。
// /account 自身と、認証コールバック・教師画面・採点テストは対象外。
//
// 安全弁: 既定はオフ。Vercel の環境変数 VITE_AUTH_REQUIRED=1 を入れて再デプロイした時だけ必須になる。
// 生徒が入れなくなる等のトラブルが起きたら、この変数を消して再デプロイすれば元に戻る
// （コードを revert する必要はない）。オフの間は /account から任意で登録できる。
//
// 2026-11-16：ページを移るたびに「確認中…」へ戻すのをやめた。
//   前は、ページを移るたびに中の画面をいったん消して確かめ直していた（中の画面が毎回作り直しになり、
//   読み込みが2回走っていた）。一度通ったあとは画面を出したまま裏で確かめ直し、だめなときだけ登録へ送る。
//   登録済みの印（プロフィールのキャッシュ）がある端末は、開いた直後も画面を先に出す。
//   /account などの除外ページを通ったあとは、今までどおり「確認中…」で確かめ直す（登録・ログアウトの直後のため）。

const EXEMPT = ['/account', '/guest', '/auth/callback', '/teacher', '/test-grading'];

/** この起動のあいだに一度「通ってよい」と確かめられたか（除外ページを通ると消す） */
let passed = false;

/** 登録の確認。通ってよければ 'ok'、登録へ送るなら 'redirect'。通信の失敗は投げる */
async function checkAccount(): Promise<'ok' | 'redirect'> {
  // お試し（パスワードで入った端末）は登録なしで通す。パスワードが変わった・止めたら印が外れて登録へ（lib/guest.ts）
  if (isGuest() && (await verifyGuest())) return 'ok';
  await ensureAnonSession();
  const st = await getAccountStatus();
  if (st.isAnonymous) return 'redirect';
  if (cachedProfile()?.registered) return 'ok';
  const p = await fetchProfile();
  return p.registered ? 'ok' : 'redirect';
}

/** 確かめる前に画面を出してよいか（一度通った・登録済みの印が端末にある） */
function canShowFirst(): boolean {
  return passed || cachedProfile()?.registered === true;
}

export default function RequireAccount({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const exempt = !AUTH_REQUIRED || EXEMPT.some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/'));
  const [state, setState] = useState<'checking' | 'ok' | 'redirect'>(exempt || canShowFirst() ? 'ok' : 'checking');

  useEffect(() => {
    if (exempt) {
      // 除外ページ（登録・ログアウトをする所）を通ったら、次のページでは確かめ終わるまで待つ
      passed = false;
      setState('ok');
      return;
    }
    let alive = true;
    // 一度通っている・登録済みの印があるなら画面は出したまま。そうでなければ確かめ終わるまで待つ
    setState(canShowFirst() ? 'ok' : 'checking');
    checkAccount()
      .then((r) => {
        passed = r === 'ok';
        if (alive) setState(r);
      })
      .catch(() => {
        // サーバ側の一時障害で学習を止めない（メールが付いている人だけここに来る）
        if (alive) setState('ok');
      });
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
