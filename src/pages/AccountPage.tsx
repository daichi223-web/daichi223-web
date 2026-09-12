import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getAccountStatus, linkEmailPassword, signInWithPassword, sendResetLink, changePassword, signOutToAnonymous,
  getPendingMerge, confirmPendingMerge, discardPendingMerge,
  type AccountStatus, type AuthResult, type PendingMerge,
} from '@/lib/auth';
import { fetchProfile, registerProfile, type Profile } from '@/lib/profile';
import { getCohort } from '@/lib/cohort';
import { DOMAIN_HINT, SCHOOLS, schoolLabel } from '@/lib/schools';

// 登録（学校メール＋パスワード＋学年・組・番号）。health-check と同じ方式。
//   * 初回起動時は必須（RequireAccount が ?required=1&next=<戻り先> 付きでここへ送る）
//   * 匿名セッションに updateUser でメールを付けるので uid は変わらず、この端末の記録はそのまま引き継がれる
//   * 学年・組・番号はサーバ（/api/profile）で暗号化して保存。学校は ?cohort= で配った値を固定
//   * メール送信はパスワードを忘れた時だけ

export default function AccountPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const required = params.get('required') === '1';
  const next = params.get('next') || '/';
  const justLinked = params.get('linked') === '1';
  const callbackError = params.get('error');

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [grade, setGrade] = useState('');
  const [cls, setCls] = useState('');
  const [number, setNumber] = useState('');
  const [cohort, setCohortChoice] = useState(getCohort());
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
    if (!st.isAnonymous) {
      setProfileLoading(true);
      try { setProfile(await fetchProfile()); } catch { setProfile(null); }
      setProfileLoading(false);
    } else {
      setProfile(null);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const registered = !!status && !status.isAnonymous && !!profile?.registered;
  const needsProfile = !!status && !status.isAnonymous && !!profile && !profile.registered;
  const knownCohort = cohort in SCHOOLS;

  const run = async (fn: () => Promise<AuthResult>, okText: string, after?: () => void) => {
    setBusy(true); setError(null); setMessage(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { setMessage(okText); setPassword(''); setNewPassword(''); await refresh(); after?.(); }
    else setError(r.message);
  };

  const profileInput = (): { grade: number | null; class: number; number: number; cohort: string } | string => {
    const g = grade ? parseInt(grade, 10) : null;
    const c = parseInt(cls, 10);
    const n = parseInt(number, 10);
    if (g !== null && (!Number.isInteger(g) || g < 1 || g > 3)) return '学年は 1〜3 で入力してください。';
    if (!Number.isInteger(c) || c < 1 || c > 20) return '組を数字で入力してください。';
    if (!Number.isInteger(n) || n < 1 || n > 60) return '出席番号を数字で入力してください。';
    return { grade: g, class: c, number: n, cohort };
  };

  /** 匿名 → メール＋パスワードを付け、続けて学年・組・番号を暗号化保存 */
  const onRegister = async () => {
    const input = profileInput();
    if (typeof input === 'string') { setError(input); return; }
    setBusy(true); setError(null); setMessage(null);
    const r = await linkEmailPassword(email, password);
    if (!r.ok) { setBusy(false); setError(r.message); return; }
    try {
      await registerProfile(input);
    } catch (e) {
      setBusy(false);
      setError(`メールは登録できましたが、組・番号の保存に失敗しました（${e instanceof Error ? e.message : String(e)}）。下の欄からもう一度保存してください。`);
      await refresh();
      return;
    }
    setBusy(false); setPassword('');
    setMessage('登録しました。この端末の記録はそのまま引き継がれ、別の端末からも同じメールとパスワードで続けられます。');
    await refresh();
    if (required) navigate(next, { replace: true });
  };

  /** メールは付いているが組・番号が未登録（別端末でログインした直後など） */
  const onSaveProfile = async () => {
    const input = profileInput();
    if (typeof input === 'string') { setError(input); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await registerProfile(input);
      setMessage('組・番号を保存しました。');
      await refresh();
      if (required) navigate(next, { replace: true });
    } catch (e) {
      setError(`保存できませんでした（${e instanceof Error ? e.message : String(e)}）。`);
    }
    setBusy(false);
  };

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

  // 登録が済んでいて required で来た場合は、統合待ちが無ければそのまま戻す
  useEffect(() => {
    if (required && registered && !pending) navigate(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required, registered, pending]);

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-4">
          {!required && <Link to="/" className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">← ホーム</Link>}
          <h1 className="mt-3 text-[28px] font-black tracking-tight text-rw-ink leading-none">
            {required ? '📮 登録のお願い' : '📮 アカウント'}
          </h1>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2 leading-relaxed">
            {required
              ? `古文単を使うには、${DOMAIN_HINT}とパスワード、学年・組・番号の登録が必要です。登録すると、スマホやPCなど別の端末からも同じ記録で続けられます。`
              : '学校のメールとパスワードで、別の端末からも同じ記録で続けられます。'}
          </p>
        </header>

        {/* 急にこの画面が出て驚かないように、理由と「記録は消えない」ことを先に伝える */}
        {required && status?.isAnonymous && (
          <section className="rounded-2xl border-2 border-rw-ink bg-rw-paper p-4 mb-4">
            <h2 className="text-[15px] font-black text-rw-ink mb-1">お知らせ：登録が必要になりました</h2>
            <p className="text-[12.5px] text-rw-ink-soft font-semibold mb-2.5 leading-relaxed">
              今日から、古文単を使うには学校のメールでの登録が必要になりました。急にごめんなさい。1回だけの手続きです。
            </p>
            <ul className="text-[12.5px] text-rw-ink font-semibold leading-relaxed list-none p-0 m-0 flex flex-col gap-1.5">
              <li>
                <span className="font-black">今までの記録は消えていません。</span>
                いつも使っている端末でこのまま登録すれば、単語の記録も復習の箱もそのまま続きます。
              </li>
              <li>
                これまでは「このブラウザだけ」に記録が紐づいていて、機種変更やアプリの入れ直しで消えてしまう状態でした。
                学校のメールを登録すると、スマホでもPCでも同じ続きからできます。
              </li>
              <li>
                <span className="font-black">用意するもの</span>は学校のメール（@st.spec.ed.jp）と、自分で決めるパスワード（6文字以上）だけ。
                確認メールは届きません。登録は1回で終わります。
              </li>
              <li className="text-rw-ink-soft">
                パスワードは学校のメールのものと同じでなくて構いません。忘れたときは「パスワードを忘れた」から。
                それでも入れないときは先生に伝えてください。
              </li>
            </ul>
          </section>
        )}

        {justLinked && <Notice tone="ok">✓ ログインできました。パスワードを忘れた場合は、下でパスワードを設定し直してください。</Notice>}
        {callbackError && <Notice tone="err">リンクを開けませんでした（{callbackError}）。もう一度送信してください。</Notice>}

        {/* 現在の状態 */}
        <section className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-black text-rw-ink mb-1.5">いまの状態</h2>
          {!status || (profileLoading && !profile) ? (
            <p className="text-sm text-rw-ink-soft">確認中…</p>
          ) : status.pendingEmail && status.isAnonymous ? (
            <p className="text-sm text-rw-ink leading-relaxed">
              <span className="font-black">{status.pendingEmail}</span> に確認メールを送ってあります。届いたリンクを開くと登録が完了します。
            </p>
          ) : status.isAnonymous ? (
            <p className="text-sm text-rw-ink leading-relaxed">未登録。<span className="font-black">この端末だけ</span>の記録です。</p>
          ) : registered ? (
            <p className="text-sm text-rw-ink leading-relaxed">
              ✓ <span className="font-black">{status.email}</span>{' '}
              <span className="text-rw-ink-soft">
                （{schoolLabel(profile?.cohort ?? cohort)}
                {profile?.grade ? ` ${profile.grade}年` : ''}{profile?.class ? ` ${profile.class}組` : ''}{profile?.number ? ` ${profile.number}番` : ''}）
              </span>
              。別の端末でも、このメールとパスワードでログインすれば続きからできます。
            </p>
          ) : (
            <p className="text-sm text-rw-ink leading-relaxed">
              <span className="font-black">{status.email}</span> でログイン中。学年・組・番号が未登録です。
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

        {/* 匿名なら: 新規登録（メール＋パスワード＋学年・組・番号） */}
        {status?.isAnonymous && (
          <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-black text-rw-ink mb-1">はじめて使う人：登録する</h2>
            <p className="text-[11px] text-rw-ink-soft font-semibold mb-2.5 leading-snug">
              {DOMAIN_HINT}とパスワード（6文字以上）。確認メールは送られません。この端末で進めた記録はそのまま引き継がれます。
            </p>
            <form onSubmit={(e) => { e.preventDefault(); if (!busy) void onRegister(); }} className="flex flex-col gap-2">
              <SchoolField cohort={cohort} known={knownCohort} onChange={setCohortChoice} />
              <input
                type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="example@st.spec.ed.jp" required className={inputCls}
              />
              <input
                type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="新しいパスワード（6文字以上）" minLength={6} required className={inputCls}
              />
              <ClassFields grade={grade} cls={cls} number={number} setGrade={setGrade} setCls={setCls} setNumber={setNumber} />
              <button type="submit" disabled={busy} className="w-full rounded-xl py-3 text-[15px] font-black text-rw-paper disabled:opacity-60" style={{ background: 'var(--rw-accent)' }}>
                {busy ? '処理中…' : '登録する'}
              </button>
            </form>
          </section>
        )}

        {/* メールは付いているが組・番号が未登録 */}
        {needsProfile && (
          <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-black text-rw-ink mb-1">学年・組・番号を登録する</h2>
            <form onSubmit={(e) => { e.preventDefault(); if (!busy) void onSaveProfile(); }} className="flex flex-col gap-2">
              <SchoolField cohort={cohort} known={knownCohort} onChange={setCohortChoice} />
              <ClassFields grade={grade} cls={cls} number={number} setGrade={setGrade} setCls={setCls} setNumber={setNumber} />
              <button type="submit" disabled={busy} className="w-full rounded-xl py-3 text-[15px] font-black text-rw-paper disabled:opacity-60" style={{ background: 'var(--rw-accent)' }}>
                {busy ? '処理中…' : '保存する'}
              </button>
            </form>
          </section>
        )}

        {/* 別端末ログイン */}
        {!registered && (
          <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-black text-rw-ink mb-1">登録済みのメールでログイン</h2>
            <p className="text-[11px] text-rw-ink-soft font-semibold mb-2.5 leading-snug">
              別の端末で先に登録した人はこちら。この端末で登録前に進めた記録があれば、ログイン後に統合するか選べます。
            </p>
            <form onSubmit={(e) => { e.preventDefault(); if (!busy) onSignIn(); }} className="flex flex-col gap-2">
              <input
                type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="example@st.spec.ed.jp" required className={inputCls}
              />
              <input
                type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード" required className={inputCls}
              />
              <button type="submit" disabled={busy} className="w-full rounded-xl py-3 text-[15px] font-black text-rw-paper disabled:opacity-60" style={{ background: 'var(--rw-accent)' }}>
                {busy ? '処理中…' : 'ログイン'}
              </button>
            </form>
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
        )}

        {/* 登録済みなら: パスワード変更・ログアウト */}
        {status && !status.isAnonymous && (
          <>
            <section className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-4">
              <h2 className="text-sm font-black text-rw-ink mb-2">パスワードを変更する</h2>
              <form onSubmit={(e) => { e.preventDefault(); if (!busy) onChangePassword(); }} className="flex flex-col gap-2">
                <input
                  type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="新しいパスワード（6文字以上）" minLength={6} required className={inputCls}
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

const inputCls = 'w-full rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2.5 text-sm text-rw-ink outline-none focus:border-rw-ink';

/** 学校：?cohort= で配った値が既知ならその名前を表示、未知なら選ばせる */
function SchoolField({ cohort, known, onChange }: { cohort: string; known: boolean; onChange: (v: string) => void }) {
  if (known) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2.5 text-sm">
        <span className="text-rw-ink-soft font-semibold">学校</span>
        <span className="font-black text-rw-ink">{schoolLabel(cohort)}</span>
      </div>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2 text-sm">
      <span className="text-rw-ink-soft font-semibold">学校</span>
      <select value={cohort} onChange={(e) => onChange(e.target.value)} className="bg-transparent font-black text-rw-ink outline-none">
        {!(cohort in SCHOOLS) && <option value={cohort}>{cohort}</option>}
        {Object.entries(SCHOOLS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}

function ClassFields({ grade, cls, number, setGrade, setCls, setNumber }: {
  grade: string; cls: string; number: string;
  setGrade: (v: string) => void; setCls: (v: string) => void; setNumber: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <input type="number" inputMode="numeric" min={1} max={3} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="学年" className={inputCls} />
      <input type="number" inputMode="numeric" min={1} max={20} value={cls} onChange={(e) => setCls(e.target.value)} placeholder="組" required className={inputCls} />
      <input type="number" inputMode="numeric" min={1} max={60} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="出席番号" required className={inputCls} />
    </div>
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
