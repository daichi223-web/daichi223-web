/**
 * 学習の出来事の記録（分析専用・追記のみ）。設計 = docs/learning-events-design.md
 *
 * 単語・文法・教材の利用を同じ形で learning_events に送る。
 * - 学習を止めない: 端末内にためてまとめて送り、失敗した分は捨てる（画面にエラーを出さない）
 * - 既存の word_stats / srs_state とは独立。こちらが落ちても学習記録には影響しない
 */
import { supabase } from './supabase';
import { currentAuthUid } from './anonAuth';

export type LearningArea = 'vocab' | 'grammar' | 'text';
export type LearningAction = 'answer' | 'view' | 'open';

export interface LearningEvent {
  area: LearningArea;
  action: LearningAction;
  /** word(qid) / drill / reibun / topic / video / text / guide / lemma / token */
  targetType: string;
  targetId: string;
  correct?: boolean;
  /** 選んだ選択肢（単語は qid、文法は選択肢の文字列） */
  chosen?: string;
  /** 出題形式 */
  format?: string;
  /** 出題の経路（today / normal / weak / srs / focus など） */
  route?: string;
  ctx?: Record<string, unknown>;
}

interface Row {
  at: string;
  session_id: string;
  area: LearningArea;
  action: LearningAction;
  target_type: string;
  target_id: string;
  correct: boolean | null;
  chosen: string | null;
  format: string | null;
  route: string | null;
  ctx: Record<string, unknown> | null;
}

const FLUSH_SIZE = 10;
const FLUSH_MS = 5000;
const QUEUE_MAX = 200;
const DEDUPE_MS = 1000;
const ELAPSED_MAX_MS = 10 * 60 * 1000;

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const sessionId = newId();
let queue: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let lastKey = '';
let lastAt = 0;
let lastView: string | null = null;
let shownAt = 0;
/** 直近に確認できた本人の ID とトークン。ページを離れる瞬間は非同期で取り直せないので持っておく */
let auth: { userId: string; token: string } | null = null;

async function refreshAuth(): Promise<string | null> {
  const userId = await currentAuthUid();
  if (!userId) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    auth = token && data.session?.user?.id === userId ? { userId, token } : null;
  } catch {
    auth = null;
  }
  return userId;
}

/** 問いを画面に出した時刻を記す。次の answer に応答時間（ctx.ms）が付く */
export function markQuestionShown(): void {
  shownAt = Date.now();
}

/** 出来事を1件ためる。送信は裏で行い、呼び出し側は待たない */
export function logEvent(e: LearningEvent): void {
  try {
    if (!e.targetId) return;
    const now = Date.now();
    // 同じ閲覧・開閉が続けて来たら1件にまとめる（開発時の二重実行や連打）
    const key = `${e.action}|${e.targetType}|${e.targetId}`;
    if (e.action !== 'answer' && key === lastKey && now - lastAt < DEDUPE_MS) return;
    lastKey = key;
    lastAt = now;

    const ctx: Record<string, unknown> = { ...(e.ctx ?? {}) };
    if (e.action === 'answer' && shownAt) {
      const ms = now - shownAt;
      if (ms >= 0 && ms <= ELAPSED_MAX_MS) ctx.ms = ms;
    }
    if (e.action === 'view') {
      // 直前に開いていたもの。領域をまたぐ流れ（教材→単語カード など）をたどるのに使う
      if (lastView) ctx.from = lastView;
      lastView = `${e.targetType}:${e.targetId}`;
    }

    queue.push({
      at: new Date(now).toISOString(),
      session_id: sessionId,
      area: e.area,
      action: e.action,
      target_type: e.targetType,
      target_id: e.targetId.slice(0, 200),
      correct: e.correct ?? null,
      chosen: e.chosen != null ? String(e.chosen).slice(0, 200) : null,
      format: e.format ?? null,
      route: e.route ?? null,
      ctx: Object.keys(ctx).length ? ctx : null,
    });
    if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
    if (!auth) void refreshAuth().catch(() => {});

    if (queue.length >= FLUSH_SIZE) void flushEvents();
    else if (!timer) timer = setTimeout(() => void flushEvents(), FLUSH_MS);
  } catch {
    /* 記録の失敗で学習を止めない */
  }
}

/** たまっている出来事を送る。失敗した分は捨てる */
export function flushEvents(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing) return flushing;
  if (queue.length === 0) return Promise.resolve();
  const rows = queue;
  queue = [];
  flushing = (async () => {
    try {
      const userId = await refreshAuth();
      if (!userId) return; // 匿名セッションが無いと RLS で拒否されるので送らない
      const { error } = await supabase
        .from('learning_events')
        .insert(rows.map((r) => ({ user_id: userId, ...r })));
      if (error) console.warn('[learningEvents] insert failed:', error.message);
    } catch (err) {
      console.warn('[learningEvents] flush failed:', err);
    } finally {
      flushing = null;
      if (queue.length >= FLUSH_SIZE) void flushEvents();
      else if (queue.length > 0 && !timer) timer = setTimeout(() => void flushEvents(), FLUSH_MS);
    }
  })();
  return flushing;
}

/**
 * ページを離れる瞬間の送信。通常の送信は読み込み直しやタブを閉じると途中で切られるので、
 * keepalive つきの fetch で REST に直接送る（ブラウザがページを閉じた後も送り切る）。
 */
function flushOnLeave(): void {
  if (queue.length === 0) return;
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (!auth || !url || !key) {
    void flushEvents();
    return;
  }
  const { userId, token } = auth;
  const rows = queue;
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    void fetch(`${url}/rest/v1/learning_events`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows.map((r) => ({ user_id: userId, ...r }))),
    }).catch(() => {});
  } catch {
    /* 記録の失敗で学習を止めない */
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnLeave();
  });
  window.addEventListener('pagehide', flushOnLeave);
}
