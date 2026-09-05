import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getAccountStatus, linkEmail, signInWithEmail, signOutToAnonymous,
  getPendingMerge, confirmPendingMerge, discardPendingMerge,
  type AccountStatus, type PendingMerge,
} from '@/lib/auth';

// 記録の引き継ぎ（メール登録／別端末ログイン）。
// 匿名のままだと記録は「このブラウザだけ」に紐づく。メールを付けると同じ記録のまま
// 別の端末からも続けられる。

type Phase = 'idle' | 'sending' | 'sent';

export default function AccountPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 別端末ログイン後の統合待ち（この端末の匿名記録）。本人が押すまで実行しない
  const [pending, setPending] = useState<PendingMerge | null>(null);
  const [merging, setMerging] = useState(false);

  const refresh = async () => {
    const st = await getAccountStatus();
    setStatus(st);
    setPending(!st.isAnonymous ? getPendingMerge() : null);
  };
  useEffect(() => { void refresh(); }, []);

  const onMerge = async () => {
    setMerging(true); setError(null);
    const r = await confirmPendingMerge();
    setMerging(false);
    if (r.ok) {
      const w = r.merged.word_stats, sr = r.merged.srs_state;
      setMessage(`統合しました（単語の記録 ${w.merged + w.moved} 件、復習の箱 ${sr.merged + sr.moved} 件）。`);
      setPending(null);
    } else setError(r.message);
  };
  const onDiscard = () => { discardPendingMerge(); setPending(null); };

  const justLinked = params.get('linked') === '1';
  const callbackError = params.get('error');

  const run = async (fn: (e: string) => Promise<{ ok: true } | { ok: false; message: string }>, sentText: string) => {
    setPhase('sending'); setError(null); setMessage(null);
    const r = await fn(email);
    if (r.ok) { setPhase('sent'); setMessage(sentText); await refresh(); }
    else { setPhase('idle'); setError(r.message); }
  };

  const onLink = () => run(linkEmail, `${email.trim()} に確認メールを送りました。届いたリンクを開くと登録が完了します。`);
  const onSignIn = () => run(signInWithEmail, `${email.trim()} にログイン用のリンクを送りました。この端末で開いてください。`);
  const onSignOut = async () => {
    if (!confirm('この端末からログアウトします。記録はアカウントに残ります。よろしいですか？')) return;
    await signOutToAnonymous();
    navigate('/');
  };

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-4">
          <Link to="/" className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">← ホーム</Link>
          <h1 className="mt-3 text-[28px] font-black tracking-tight text-rw-ink leading-none">📮 記録の引き継ぎ</h1>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2 leading-relaxed">
            今の記録は「このブラウザだけ」に紐づいています。メールを登録すると、同じ記録のままスマホやPCから続けられます。
          </p>
        </header>

        {justLinked && (
          <Notice tone="ok">✓ メールの確認ができました。この端末の記録がアカウントに紐づきました。</Notice>
        )}
        {callbackError && <Notice tone="err">リンクを開けませんでした（{callbackError}）。もう一度送信してください。</Notice>}

        {/* 現在の状態 */}
        <section className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-black text-rw-ink mb-1.5">いまの状態</h2>
          {!status ? (
            <p className="text-sm text-rw-ink-soft">確認中…</p>
          ) : status.pendingEmail && status.isAnonymous ? (
            <p className="text-sm text-rw-ink leading-relaxed">
              <span className="font-black">{status.pendingEmail}</span> に確認メールを送ってあります。届いたリンクを開くと登録が完了します。
            </p>
          ) : status.isAnonymous ? (
            <p className="text-sm text-rw-ink leading-relaxed">メール未登録。<span className="font-black">この端末だけ</span>の記録です。</p>
          ) : (
            <p className="text-sm text-rw-ink leading-relaxed">
              ✓ <span className="font-black">{status.email}</span> で登録済み。別の端末でも、このメールでログインすれば続きからできます。
            </p>
          )}
        </section>

        {message && <Notice tone="ok">{message}</Notice>}
        {error && <Notice tone="err">{error}</Notice>}

        {/* 統合の確認: 共用PCで他人の記録を取り込まないよう、必ず本人に選ばせる */}
        {pending && status && !status.isAnonymous && (
          <section className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-black text-rw-ink mb-1">この端末に、メール登録前の記録があります</h2>
            <p className="text-[12px] text-rw-ink font-semibold mb-2.5 leading-relaxed">
              単語の記録 {pending.counts.word_stats} 件・復習の箱 {pending.counts.srs_state} 件。
              <span className="font-black">あなた自身の記録なら</span>統合できます。学校の共用PCなど、他の人が使った可能性があれば「統合しない」を選んでください。
            </p>
            <div className="flex gap-2">
              <button onClick={onMerge} disabled={merging} className="flex-1 rounded-xl py-2.5 text-[14px] font-black text-rw-paper disabled:opacity-60" style={{ background: 'var(--rw-accent)' }}>
                {merging ? '統合中…' : '自分の記録なので統合する'}
              </button>
              <button onClick={onDiscard} disabled={merging} className="rounded-xl px-4 py-2.5 text-[13px] font-bold border border-rw-rule text-rw-ink-soft">
                統合しない
              </button>
            </div>
          </section>
        )}

        {/* 匿名なら: メール登録 */}
        {status?.isAnonymous && (
          <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-black text-rw-ink mb-1">この端末の記録にメールを付ける</h2>
            <p className="text-[11px] text-rw-ink-soft font-semibold mb-2.5 leading-snug">
              学校の Google アカウントがおすすめ。パスワードは不要で、届いたリンクを開くだけです。
            </p>
            <EmailForm email={email} setEmail={setEmail} disabled={phase === 'sending'} onSubmit={onLink} label="確認メールを送る" />
          </section>
        )}

        {/* 別端末ログイン（登録済みのメールで） */}
        <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-black text-rw-ink mb-1">登録済みのメールでログイン</h2>
          <p className="text-[11px] text-rw-ink-soft font-semibold mb-2.5 leading-snug">
            別の端末で先にメール登録した人はこちら。この端末で匿名のまま進めた記録があれば、ログイン後に統合するか選べます。
          </p>
          <EmailForm email={email} setEmail={setEmail} disabled={phase === 'sending'} onSubmit={onSignIn} label="ログイン用リンクを送る" />
        </section>

        {/* 登録済みなら: ログアウト（共用PC向け） */}
        {status && !status.isAnonymous && (
          <section className="rounded-2xl p-4 mb-4">
            <button onClick={onSignOut} className="text-[12px] font-bold text-rw-ink-soft underline">
              この端末からログアウトする（学校の共用PCなど）
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function EmailForm({ email, setEmail, disabled, onSubmit, label }: {
  email: string; setEmail: (v: string) => void; disabled: boolean; onSubmit: () => void; label: string;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!disabled) onSubmit(); }}
      className="flex flex-col gap-2"
    >
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="メールアドレス"
        className="w-full rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2.5 text-sm text-rw-ink outline-none focus:border-rw-ink"
        required
      />
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-xl py-3 text-[15px] font-black text-rw-paper disabled:opacity-60"
        style={{ background: 'var(--rw-accent)' }}
      >
        {disabled ? '送信中…' : label}
      </button>
    </form>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'err'; children: ReactNode }) {
  return (
    <div
      className="rounded-xl px-3.5 py-2.5 mb-4 text-[13px] font-bold leading-relaxed"
      style={
        tone === 'ok'
          ? { background: 'color-mix(in srgb, var(--rw-accent) 12%, transparent)', color: 'var(--rw-ink)' }
          : { background: 'var(--rw-primary-soft)', color: 'var(--rw-primary)' }
      }
    >
      {children}
    </div>
  );
}
