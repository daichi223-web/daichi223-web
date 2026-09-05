import { supabase } from './supabase';
import { ensureAnonSession, resetAnonSessionCache } from './anonAuth';

/**
 * 匿名アカウント → 学校メール＋パスワード への紐づけ（health-check と同じ方式）。
 *
 * - linkEmailPassword:  今の匿名アカウントにメールとパスワードを付ける。Dashboard で「Confirm email」が
 *                       OFF なら即時に永続化（メール送信なし）。同じ user_id のまま＝記録は1行も動かない
 * - signInWithPassword: 別の端末から、登録済みのメール＋パスワードでログイン（送信なし）
 * - sendResetLink:      パスワードを忘れた時だけマジックリンク（/auth/callback → /account でパスワード変更）
 * - changePassword:     ログイン中のパスワード変更
 * - signOutToAnonymous: 共用PC向け。ログアウトして新しい匿名セッションに戻す
 */

export type AccountStatus = {
  uid: string | null;
  /** メール未登録（匿名のまま） */
  isAnonymous: boolean;
  email: string | null;
  /** 確認待ちのメール（Confirm email が ON の場合のみ発生） */
  pendingEmail: string | null;
};

export type AuthResult = { ok: true } | { ok: false; message: string };

const MIN_PASSWORD = 6;

function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function getAccountStatus(): Promise<AccountStatus> {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return { uid: null, isAnonymous: true, email: null, pendingEmail: null };
  return {
    uid: u.id,
    isAnonymous: u.is_anonymous ?? !u.email,
    email: u.email ?? null,
    pendingEmail: u.new_email ?? null,
  };
}

/** Supabase の英語エラーを生徒向けの短い日本語に */
function humanize(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'メールアドレスかパスワードが違います。';
  if (m.includes('rate limit') || m.includes('too many')) return '回数の上限に達しました。しばらく待ってからもう一度お試しください。';
  if (m.includes('password should be') || m.includes('password is too short') || m.includes('weak password'))
    return `パスワードは${MIN_PASSWORD}文字以上にしてください。`;
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists'))
    return 'このメールは登録済みです。「登録済みのメールでログイン」から入ってください。';
  if (m.includes('signups not allowed')) return 'このメールはまだ登録されていません。最初に使った端末で登録してください。';
  if (m.includes('email not confirmed')) return 'メールの確認が終わっていません。届いたメールのリンクを開いてください。';
  if (m.includes('invalid') && m.includes('email')) return 'メールアドレスの形式が正しくありません。';
  return `できませんでした（${message}）`;
}

export async function linkEmailPassword(email: string, password: string): Promise<AuthResult> {
  const trimmed = email.trim();
  if (!validEmail(trimmed)) return { ok: false, message: 'メールアドレスの形式が正しくありません。' };
  if (password.length < MIN_PASSWORD) return { ok: false, message: `パスワードは${MIN_PASSWORD}文字以上にしてください。` };
  await ensureAnonSession();
  const { error } = await supabase.auth.updateUser({ email: trimmed, password }, { emailRedirectTo: callbackUrl() });
  if (error) return { ok: false, message: humanize(error.message) };
  return { ok: true };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const trimmed = email.trim();
  if (!validEmail(trimmed)) return { ok: false, message: 'メールアドレスの形式が正しくありません。' };
  if (!password) return { ok: false, message: 'パスワードを入力してください。' };
  // 端末統合の準備: この端末が匿名で記録を持っていれば、ログイン後に統合できるようチケットを取っておく
  await requestMergeTicket();
  const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
  if (error) return { ok: false, message: humanize(error.message) };
  return { ok: true };
}

/** パスワードを忘れた時: マジックリンク（登録済みメールのみ）。着地後 /account でパスワードを変える */
export async function sendResetLink(email: string): Promise<AuthResult> {
  const trimmed = email.trim();
  if (!validEmail(trimmed)) return { ok: false, message: 'メールアドレスの形式が正しくありません。' };
  await requestMergeTicket();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: callbackUrl(), shouldCreateUser: false },
  });
  if (error) return { ok: false, message: humanize(error.message) };
  return { ok: true };
}

export async function changePassword(password: string): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD) return { ok: false, message: `パスワードは${MIN_PASSWORD}文字以上にしてください。` };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: humanize(error.message) };
  return { ok: true };
}

export async function signOutToAnonymous(): Promise<void> {
  await supabase.auth.signOut();
  resetAnonSessionCache();
  await ensureAnonSession();
}

// ---------------------------------------------------------------------------
// 端末統合（Phase 2）
//   別端末のログイン前に匿名 uid の署名チケットを受け取り、ログイン後に本人確認のうえ統合する。
//   共用PCで前の生徒が残した記録を勝手に取り込まないよう、統合は必ず本人が「統合する」を押してから。
// ---------------------------------------------------------------------------

const MERGE_TICKET_KEY = 'kobun-merge-ticket';

export type PendingMerge = { ticket: string; counts: { word_stats: number; srs_state: number } };
export type MergeResult = {
  word_stats: { merged: number; moved: number };
  srs_state: { merged: number; moved: number };
  grammar_topic_progress: { merged: number; moved: number };
};

async function requestMergeTicket(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s?.user || !(s.user.is_anonymous ?? !s.user.email)) return;
    // Hobby の関数数上限のため /api/submitAnswer に同居（action で分岐）
    const resp = await fetch('/api/submitAnswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify({ action: 'mergeTicket' }),
    });
    if (!resp.ok) return;
    const j = (await resp.json()) as { ticket?: string; counts?: PendingMerge['counts'] };
    if (!j.ticket) return;
    const counts = j.counts ?? { word_stats: 0, srs_state: 0 };
    // 記録が無い端末なら統合の必要もない
    if (counts.word_stats === 0 && counts.srs_state === 0) return;
    localStorage.setItem(MERGE_TICKET_KEY, JSON.stringify({ ticket: j.ticket, counts } satisfies PendingMerge));
  } catch { /* 統合は任意機能なので失敗しても続行 */ }
}

/** ログイン後に統合待ちがあれば返す（無ければ null）。実行は confirmPendingMerge で */
export function getPendingMerge(): PendingMerge | null {
  try {
    const raw = localStorage.getItem(MERGE_TICKET_KEY);
    return raw ? (JSON.parse(raw) as PendingMerge) : null;
  } catch { return null; }
}

export function discardPendingMerge(): void {
  try { localStorage.removeItem(MERGE_TICKET_KEY); } catch { /* noop */ }
}

export async function confirmPendingMerge(): Promise<{ ok: true; merged: MergeResult } | { ok: false; message: string }> {
  const pending = getPendingMerge();
  if (!pending) return { ok: false, message: '統合待ちの記録がありません。' };
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s?.user || (s.user.is_anonymous ?? !s.user.email)) return { ok: false, message: '先にメールでログインしてください。' };
  const resp = await fetch('/api/submitAnswer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ action: 'mergeAccount', ticket: pending.ticket }),
  });
  const j = (await resp.json().catch(() => ({}))) as { ok?: boolean; merged?: MergeResult; error?: string };
  if (resp.ok && j.ok && j.merged) {
    discardPendingMerge();
    return { ok: true, merged: j.merged };
  }
  // 期限切れ・無効チケットは持っていても使えないので捨てる。サーバ障害(5xx)は再試行できるよう残す
  if (resp.status === 400 || resp.status === 401 || resp.status === 403) discardPendingMerge();
  return { ok: false, message: j.error ? `統合できませんでした（${j.error}）` : '統合できませんでした。' };
}
