/**
 * 学習の記録のまとめ読み（2026-11-16）。
 *
 * ホームを開くたびに DB へ 13〜14 回問い合わせていた（苦手・今日の復習・最後に解いた日・位階・出題の準備が、
 * それぞれ word_stats と srs_state を取りに行っていた）。2つの表を同時に1回ずつ取り、あとは手元で計算する。
 *
 *   loadLearningSnapshot … 読み込み（同時に来た呼び出しは1回にまとめ、短いあいだ覚える）
 *   ○○Of(snapshot, …)   … 純関数。今までの問い合わせ（lib/wordStats・lib/srsEngine）と同じ決め方
 *
 * 覚えた中身は、回答を記録したら捨てる（bumpLearningVersion。lib/learningVersion）。
 */
import { supabase } from './supabase';
import { getUserId } from './wordStats';
import { learningVersion } from './learningVersion';
import { DAILY_REVIEW_CAP, WELCOME_WARMUP_COUNT, startOfToday } from './srsEngine';

export type StatRow = { qid: string; correct: number; incorrect: number; lastSeen: string | null };
export type SrsRow = { qid: string; box: number; nextReview: string | null; lastReview: string | null };
/** その利用者の word_stats と srs_state の全行（単語のほか文法ドリルの行も入っている） */
export type LearningSnapshot = { stats: StatRow[]; srs: SrsRow[] };

/** 記録が取れなかったときの代わり（全部「未学習」として続ける） */
export const EMPTY_SNAPSHOT: LearningSnapshot = { stats: [], srs: [] };

/** 1回の問い合わせで返る行の上限（Supabase の既定）。超える分は続きを取る */
const PAGE = 1000;
/** 覚えておく時間。この間にホームへ戻っても取り直さない（回答を記録したら、その時点で捨てる） */
const TTL_MS = 60_000;

async function fetchAllRows<T>(table: 'word_stats' | 'srs_state', columns: string, userId: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('user_id', userId)
      .order('qid', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

let cache: { snapshot: LearningSnapshot; at: number; version: number } | null = null;
let inflight: { promise: Promise<LearningSnapshot>; version: number } | null = null;

/**
 * 学習の記録を読む。取れなければ投げる（呼ぶ側が「記録なし」で続けるか決める）。
 * fresh: 覚えた中身を使わずに取り直す。
 */
export function loadLearningSnapshot(opts?: { fresh?: boolean }): Promise<LearningSnapshot> {
  const version = learningVersion();
  if (!opts?.fresh && cache && cache.version === version && Date.now() - cache.at < TTL_MS) {
    return Promise.resolve(cache.snapshot);
  }
  if (inflight && inflight.version === version) return inflight.promise;
  const promise = (async () => {
    const userId = await getUserId();
    const [stats, srs] = await Promise.all([
      fetchAllRows<{ qid: string; correct: number; incorrect: number; last_seen: string | null }>(
        'word_stats', 'qid, correct, incorrect, last_seen', userId),
      fetchAllRows<{ qid: string; box: number; next_review: string | null; last_review: string | null }>(
        'srs_state', 'qid, box, next_review, last_review', userId),
    ]);
    const snapshot: LearningSnapshot = {
      stats: stats.map((r) => ({ qid: r.qid, correct: r.correct, incorrect: r.incorrect, lastSeen: r.last_seen })),
      srs: srs.map((r) => ({ qid: r.qid, box: r.box, nextReview: r.next_review, lastReview: r.last_review })),
    };
    // 読んでいる間に回答が記録されていたら覚えない（古い中身を残さない）
    if (learningVersion() === version) cache = { snapshot, at: Date.now(), version };
    return snapshot;
  })();
  inflight = { promise, version };
  const clear = () => { if (inflight?.promise === promise) inflight = null; };
  promise.then(clear, clear);
  return promise;
}

// ───────── 純関数（今までの問い合わせと同じ決め方） ─────────

const time = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

/** 語ごとの正誤（lib/wordStats の getWordStats と同じ形） */
export function statsMapOf(s: LearningSnapshot): Record<string, { correct: number; incorrect: number; lastSeen: string }> {
  const out: Record<string, { correct: number; incorrect: number; lastSeen: string }> = {};
  for (const r of s.stats) out[r.qid] = { correct: r.correct, incorrect: r.incorrect, lastSeen: r.lastSeen as string };
  return out;
}

/** 箱（getSrsBoxes と同じ形）。qids を渡すとその語だけ。未学習の語は入らない */
export function boxesOf(s: LearningSnapshot, qids?: string[]): Record<string, number> {
  const want = qids ? new Set(qids) : null;
  const out: Record<string, number> = {};
  for (const r of s.srs) if (!want || want.has(r.qid)) out[r.qid] = r.box;
  return out;
}

/** 期限が来た語（next_review <= 今）を期限の古い順で（getDueAmong と同じ） */
export function dueAmongOf(s: LearningSnapshot, qids: string[], now: Date = new Date()): string[] {
  const want = new Set(qids);
  const t = now.getTime();
  return s.srs
    .filter((r) => want.has(r.qid) && time(r.nextReview) <= t)
    .sort((a, b) => time(a.nextReview) - time(b.nextReview))
    .map((r) => r.qid);
}

/**
 * 苦手な語（getWeakWords と同じ）。箱1（直近で忘れた語）を先頭に、続けて誤答率が threshold 以上の語。
 */
export function weakWordsOf(s: LearningSnapshot, qids: string[], threshold = 0.4, minAttempts = 1): string[] {
  const want = new Set(qids);
  const relearning = s.srs.filter((r) => r.box === 1).map((r) => r.qid);
  const byRate = s.stats
    .filter((r) => {
      const total = r.correct + r.incorrect;
      if (total < minAttempts) return false;
      return r.incorrect / total >= threshold;
    })
    .map((r) => r.qid);
  return [...new Set([...relearning, ...byRate])].filter((q) => want.has(q));
}

/**
 * 今日の復習（getTodayReviewSet と同じ）。期限が古い順に cap 語まで。今日すでに解いた語は除く。
 */
export function todayReviewOf(s: LearningSnapshot, qids: string[], now: Date = new Date(), cap = DAILY_REVIEW_CAP): string[] {
  const want = new Set(qids);
  const t = now.getTime();
  const today0 = Date.parse(startOfToday(now));
  return s.srs
    .filter((r) => want.has(r.qid) && time(r.nextReview) <= t && (!r.lastReview || time(r.lastReview) < today0))
    .sort((a, b) => time(a.nextReview) - time(b.nextReview))
    .slice(0, cap)
    .map((r) => r.qid);
}

/** 最後に復習した日時（getLastActivity と同じ。単語に限らず全部の行から）。未学習なら null */
export function lastActivityOf(s: LearningSnapshot): Date | null {
  let max = NaN;
  for (const r of s.srs) {
    const t = time(r.lastReview);
    if (!Number.isNaN(t) && !(t <= max)) max = t;
  }
  return Number.isNaN(max) ? null : new Date(max);
}

/** おかえりのウォームアップ（getWarmupWords と同じ）。箱4〜5の語からランダムに n 語 */
export function warmupWordsOf(
  s: LearningSnapshot,
  qids: string[],
  n = WELCOME_WARMUP_COUNT,
  rng: () => number = Math.random
): string[] {
  const want = new Set(qids);
  const pool = s.srs.filter((r) => r.box >= 4 && want.has(r.qid)).map((r) => r.qid);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
