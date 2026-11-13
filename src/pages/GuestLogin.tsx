import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginGuest } from '@/lib/guest';

// お試し（ゲスト）のパスワードの画面（/guest）。/?guest=1 で開くとここに来る（lib/guest.ts）。
// パスワードは教員画面の「お試し」タブで設定する。合えばこの端末は登録なしで使える。

export default function GuestLogin() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const r = await loginGuest(password);
    setBusy(false);
    if (r.ok) {
      nav('/', { replace: true });
      return;
    }
    setErr(
      r.reason === 'wrong' ? 'パスワードがちがいます。'
        : r.reason === 'disabled' ? 'いまはお試しを受け付けていません。'
          : '通信できませんでした。もう一度お試しください。',
    );
  };

  return (
    <div className="min-h-dvh bg-rw-bg text-rw-ink flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-rw-paper border-2 border-rw-ink rounded-3xl p-6">
        <div className="text-2xl font-black tracking-tight">kobun.</div>
        <h1 className="mt-3 text-lg font-black">お試しで使う</h1>
        <p className="mt-1 text-[13px] text-rw-ink-soft leading-relaxed">
          先生から聞いたパスワードを入れてください。登録しなくても、この端末で使えます。
        </p>
        <label className="block mt-4">
          <span className="text-[12px] font-bold text-rw-ink-soft">パスワード</span>
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-rw-rule bg-white px-3 py-2 text-[15px] focus:border-rw-primary outline-none"
            autoFocus
          />
        </label>
        {err && <p className="mt-2 text-[12px] font-bold" style={{ color: 'var(--rw-ng)' }} role="alert">{err}</p>}
        <button
          type="submit"
          disabled={busy || !password.trim()}
          className="mt-4 w-full py-2.5 rounded-xl border-2 border-rw-ink bg-rw-primary text-white text-[14px] font-black disabled:opacity-50"
        >
          {busy ? '確かめています…' : 'はじめる'}
        </button>
        <p className="mt-4 text-[11px] text-rw-ink-soft leading-relaxed">
          お試しの間、学習の進み具合はこの端末に残りますが、分析用の記録はとりません。
          続けて使う人は <Link to="/account" className="underline">登録</Link> してください。
        </p>
      </form>
    </div>
  );
}
