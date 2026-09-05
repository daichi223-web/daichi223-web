import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getAccountStatus, linkEmailPassword, signInWithPassword, sendResetLink, changePassword, signOutToAnonymous,
  getPendingMerge, confirmPendingMerge, discardPendingMerge,
  type AccountStatus, type AuthResult, type PendingMerge,
} from '@/lib/auth';

// 記録の引き継ぎ（学校メール＋パスワード／別端末ログイン）。health-check と同じ方式。
// 匿名のままだと記録は「このブラウザだけ」に紐づく。メールを付けると同じ記録のまま
// 別の端末からも続けられる。メール送信はパスワードを忘れた時だけ。

export default function AccountPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  // 別端末ログイン後の統合待ち（この端末の匿名記録）。本人が押すまで実行しない
  const [pending, setPending] = useState<PendingMerge | null>(null);

  const refresh = async () => {
    const st = await getAccountStatus();
    setStatus(st);
    setPending(!st.isAnonymous ? getPendingMerge() : null);
  };
  useEffect(() => { void refresh(); }, []);

  const justLinked = params.get('linked') === '1';
  const callbackError = params.get('error');

  const run = async (fn: () => Promise<AuthResult>, okText: string, after?: () => void) => {
    setBusy(true); setError(null); setMessage(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { setMessage(okText); setPassword(''); setNewPassword(''); await refresh(); after?.(); }
    else setError(r.message);
  };

  const onLink = () => run(
    () => linkEmailPassword(email, password),
    '登録しました。この端末の記録がアカウントに紐づき、別の端末からも同じメールとパスワードで続けられます。',
  );
  const onSignIn = () => run(
    () => signInWithPassword(email, password),
    'ログインしました。',
  );
  const onReset = () => run(
    () => sendResetLink(email),
    `${email.trim()} にログイン用のリンクを送りました。開いたあと、この画面でパスワードを設定し直してください。`,
  );
  const onChangePassword = () => run(() => changePassword(newPassword), 'パスワードを変更しました。');
  const onSignOut = async () => {
    if (!confirm('この端末からログアウトします。記録はアカウントに残ります。よろしいですか？')) return;
    await signOutToAnonymous();
    navigate('/');
  };
  const onMerge = async () => {
    setBusy(true); setError(null);
    const r = await confirmPendingMerge();
    setBusy(false);
    if (r.ok) {
      const w = r.merged.word_stats, sr = r.merged.srs_state;
      setMessage(`統合しました（単語の記録 ${w.merged + w.moved} 件、復習の箱 ${sr.merged + sr.moved} 件）。`);
      setPending(null);
    } else setError(r.message);
  };
  const onDiscard = () => { discardPendingMerge(); setPending(null); };

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-4">
          <Link to="/" className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">← ホーム</Link>
          <h1 className="mt-3 text-[28px] font-black tracking-tight text-rw-ink leading-none">📮 記録の引き継ぎ</h1>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2 leading-relaxed">
            今の記録は「このブラウザだけ」に紐づいています。学校のメールとパスワードを登録すると、同じ記録のままスマホやPCから続けられます。
          </p>
        </header>

        {justLinked && <Notice tone="ok">✓ ログインできました。パスワードを忘れた場合は、下でパスワードを設定し直してください。</Notice>}
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
              ✓ <span className="font-black">{status.email}</span> で登録済み。別の端末でも、このメールとパスワードでログインすれば続きからできます。
            </p>
          )}
        </section>

        {message && <Notice tone="ok">{message}</Notice>}
        {error && <Notice tone="err">{error}</Notice>}

        {/* 統合の確認: 共用PCで他人の記録を取り込まないよう、必ず本人に選ばせる */}
        {pending && status && !status.isAnonymous && (
          <section className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-black text-rw-ink mb-1">この端末に、登録前の記録があります</h2>
            <p className="text-[12px] text-rw-ink font-semibold mb-2.5 leading-relaxed">
              単語の記録 {pending.counts.word_stats} 件・復習の箱 {pending.counts.srs_state} 件。
              <span className="font-black">あなた自身の記録なら</span>統合できます。学校の共用PCなど、他の人が使った可能性があれば「統合しない」を選んでください。
            </p>
            <div className="flex gap-2">
              <button onClick={onMerge} disabled={busy} className="flex-1 rounded-xl py-2.5 text-[14px] font-black text-rw-paper disabled:opacity-60" style={{ background: 'var(--rw-accent)' }}>
                {busy ? '統合中…' : '自分の記録なので統合する'}
              </button>
              <button onClick={onDiscard} disabled={busy} className="rounded-xl px-4 py-2.5 text-[13px] font-bold border border-rw-rule text-rw-ink-soft">
                統合しない
              </button>
            </div>
          </section>
        )}

        {/* 匿名なら: メール＋パスワード登録 */}
        {status?.isAnonymous && (
          <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-black text-rw-ink mb-1">この端末の記録に、メールとパスワードを付ける</h2>
            <p className="text-[11px] text-rw-ink-soft font-semibold mb-2.5 leading-snug">
              学校のメール（st.spec.ed.jp）とパスワード（6文字以上）。メールは送られません。
            </p>
            <AuthForm
              email={email} setEmail={setEmail}
              password={password} setPassword={setPassword} passwordPlaceholder="新しいパスワード（6文字以上）" passwordAutoComplete="new-password"
              disabled={busy} onSubmit={onLink} label="登録する"
            />
          </section>
        )}

        {/* 別端末ログイン */}
        <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-black text-rw-ink mb-1">登録済みのメールでログイン</h2>
          <p className="text-[11px] text-rw-ink-soft font-semibold mb-2.5 leading-snug">
            別の端末で先に登録した人はこちら。この端末で登録前に進めた記録があれば、ログイン後に統合するか選べます。
          </p>
          <AuthForm
            email={email} setEmail={setEmail}
            password={password} setPassword={setPassword} passwordPlaceholder="パスワード" passwordAutoComplete="current-password"
            disabled={busy} onSubmit={onSignIn} label="ログイン"
          />
          <button type="button" onClick={() => setShowReset((v) => !v)} className="mt-2.5 text-[12px] font-bold text-rw-ink-soft underline">
            パスワードを忘れた
          </button>
          {showReset && (
            <div className="mt-2 rounded-xl border border-rw-rule p-3">
              <p className="text-[11px] text-rw-ink-soft font-semibold mb-2 leading-snug">
                上のメールアドレス宛にログイン用のリンクを送ります。開いたあと、この画面でパスワードを設定し直せます。届かない時は先生に伝えてください。
              </p>
              <button type="button" onClick={onReset} disabled={busy} className="w-full rounded-xl py-2.5 text-[13px] font-black border border-rw-ink text-rw-ink disabled:opacity-60">
                リンクを送る
              </button>
            </div>
          )}
        </section>

        {/* 登録済みなら: パスワード変更・ログアウト */}
        {status && !status.isAnonymous && (
          <>
            <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
              <h2 className="text-sm font-black text-rw-ink mb-2">パスワードを変更する</h2>
              <form onSubmit={(e) => { e.preventDefault(); if (!busy) onChangePassword(); }} className="flex flex-col gap-2">
                <input
                  type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="新しいパスワード（6文字以上）" minLength={6} required
                  className="w-full rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2.5 text-sm text-rw-ink outline-none focus:border-rw-ink"
                />
                <button type="submit" disabled={busy} className="w-full rounded-xl py-2.5 text-[14px] font-black border border-rw-ink text-rw-ink disabled:opacity-60">
                  変更する
                </button>
              </form>
            </section>
            <section className="px-4 mb-4">
              <button onClick={onSignOut} className="text-[12px] font-bold text-rw-ink-soft underline">
                この端末からログアウトする（学校の共用PCなど）
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function AuthForm({ email, setEmail, password, setPassword, passwordPlaceholder, passwordAutoComplete, disabled, onSubmit, label }: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void; passwordPlaceholder: string; passwordAutoComplete: string;
  disabled: boolean; onSubmit: () => void; label: string;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!disabled) onSubmit(); }} className="flex flex-col gap-2">
      <input
        type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="example@st.spec.ed.jp" required
        className="w-full rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2.5 text-sm text-rw-ink outline-none focus:border-rw-ink"
      />
      <input
        type="password" autoComplete={passwordAutoComplete} value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder={passwordPlaceholder} required
        className="w-full rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2.5 text-sm text-rw-ink outline-none focus:border-rw-ink"
      />
      <button type="submit" disabled={disabled} className="w-full rounded-xl py-3 text-[15px] font-black text-rw-paper disabled:opacity-60" style={{ background: 'var(--rw-accent)' }}>
        {disabled ? '処理中…' : label}
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
