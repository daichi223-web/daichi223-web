import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// マジックリンク／確認メールの着地点。
// supabase-js が URL（#access_token=… または ?code=…）からセッションを復元するのを待って、
// /account に戻す。失敗（期限切れ等）は URL の error_description を拾って伝える。

export default function AuthCallback() {
  const navigate = useNavigate();
  const [text, setText] = useState('確認しています…');

  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const err = url.searchParams.get('error_description') || hashParams.get('error_description');
    if (err) {
      navigate(`/account?error=${encodeURIComponent(err)}`, { replace: true });
      return;
    }

    let done = false;
    const finish = (linked: boolean) => {
      if (done) return;
      done = true;
      navigate(linked ? '/account?linked=1' : '/account', { replace: true });
    };

    // セッションが確定したら着地。匿名でないセッション＝紐づけ or ログイン成功
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (u && !(u.is_anonymous ?? !u.email)) finish(true);
    });
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (u && !(u.is_anonymous ?? !u.email)) finish(true);
    })();
    // 10秒待っても確定しなければ、そのまま /account へ（状態はそこで表示される）
    const timer = window.setTimeout(() => {
      setText('時間がかかっています…');
      finish(false);
    }, 10000);

    return () => { sub.subscription.unsubscribe(); window.clearTimeout(timer); };
  }, [navigate]);

  return (
    <div className="min-h-dvh bg-rw-bg flex items-center justify-center">
      <p className="text-sm font-bold text-rw-ink-soft">{text}</p>
    </div>
  );
}
