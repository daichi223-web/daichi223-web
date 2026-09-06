import { supabase } from './supabase';
import { getUserId } from './wordStats';

/**
 * Leitner 5-box spaced repetition system.
 *
 * Box intervals:
 *   Box 1: always due (review every session)
 *   Box 2: review after 1 day
 *   Box 3: review after 3 days
 *   Box 4: review after 7 days
 *   Box 5: review after 14 days (mastered)
 */

export const BOX_INTERVALS_DAYS: Record<number, number> = {
  1: 0,   // always due
  2: 1,   // 1 day
  3: 3,   // 3 days
  4: 7,   // 7 days
  5: 14,  // 14 days
};

/**
 * 既存 box と正誤から次の box 番号を算出するピュア関数。
 * - 正解: +1（上限 5）
 * - 不正解: 常に 1（最下段まで落とす）
 * 初回（既存データ無し）の場合、isCorrect=true なら 2、false なら 1。
 */
export function nextBox(currentBox: number | null, isCorrect: boolean): number {
  if (currentBox == null) return isCorrect ? 2 : 1;
  if (!isCorrect) return 1;
  return Math.min(currentBox + 1, 5);
}

/**
 * Calculate the next review date based on the Leitner box number.
 */
export function getNextReviewDate(box: number, now: Date = new Date()): string {
  const days = BOX_INTERVALS_DAYS[box] ?? 0;
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

/**
 * Get all words due for review for the current user.
 * A word is "due" when next_review <= now.
 *
 * @returns array of qid strings that are due for review.
 */
export async function getDueWords(): Promise<string[]> {
  const userId = await getUserId();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('srs_state')
    .select('qid')
    .eq('user_id', userId)
    .lte('next_review', now);

  if (error || !data) {
    console.warn('Failed to fetch due words:', error);
    return [];
  }

  return data.map((row) => row.qid);
}

/**
 * 指定 qid 群の現在の箱(1-5)を返す。未学習の qid は結果に含まれない。
 * （箱＝単語のレベル。箱が上がった語は教材の実戦例文に切り替える等に使う）
 */
export async function getSrsBoxes(qids: string[]): Promise<Record<string, number>> {
  if (qids.length === 0) return {};
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('srs_state')
    .select('qid, box')
    .eq('user_id', userId)
    .in('qid', qids);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const r of data) out[r.qid as string] = r.box as number;
  return out;
}

/**
 * Get count of words due for review (useful for badge display).
 */
export async function getDueCount(): Promise<number> {
  const userId = await getUserId();
  const now = new Date().toISOString();

  const { count, error } = await supabase
    .from('srs_state')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('next_review', now);

  if (error || count === null) {
    console.warn('Failed to fetch due count:', error);
    return 0;
  }

  return count;
}

/**
 * Update SRS state after answering a question.
 *
 * - Correct: move up one box (max 5), set next_review based on new box interval.
 * - Incorrect: move back to box 1, set next_review to now (immediately due).
 */
export async function updateSrsState(qid: string, isCorrect: boolean): Promise<void> {
  const userId = await getUserId();

  // Get current SRS state
  const { data: existing } = await supabase
    .from('srs_state')
    .select('id, box')
    .eq('user_id', userId)
    .eq('qid', qid)
    .single();

  const now = new Date().toISOString();

  if (existing) {
    const newBox = nextBox(existing.box, isCorrect);

    await supabase
      .from('srs_state')
      .update({
        box: newBox,
        next_review: getNextReviewDate(newBox),
        last_review: now,
      })
      .eq('id', existing.id);
  } else {
    // Word not yet in SRS -- initialize it
    const newBox = nextBox(null, isCorrect);

    await supabase
      .from('srs_state')
      .insert({
        user_id: userId,
        qid,
        box: newBox,
        next_review: getNextReviewDate(newBox),
        last_review: now,
      });
  }
}

/**
 * Initialize SRS for a word (called when first encountered).
 * If the word already exists in srs_state, this is a no-op.
 */
export async function initSrsWord(qid: string): Promise<void> {
  const userId = await getUserId();

  // Check if already exists
  const { data: existing } = await supabase
    .from('srs_state')
    .select('id')
    .eq('user_id', userId)
    .eq('qid', qid)
    .single();

  if (existing) {
    return; // Already initialized
  }

  await supabase
    .from('srs_state')
    .insert({
      user_id: userId,
      qid,
      box: 1,
      next_review: new Date().toISOString(),
    });
}

// ---------------------------------------------------------------------------
// 「戻ってきやすい」復習
//   - 期限到来の語が何千あっても、今日出すのは上限まで（溜まりは消さず・見せない）
//   - 長い空白のあとは、箱4〜5（覚えていた語）から数語のウォームアップを先頭に置く
// ---------------------------------------------------------------------------

/** 1日に出す復習語の上限 */
export const DAILY_REVIEW_CAP = 10;
/** これ以上空くと「おかえり」扱い（休み明け想定） */
export const WELCOME_BACK_GAP_DAYS = 14;
/** おかえり時に先頭へ置く、覚えていた語の数 */
export const WELCOME_WARMUP_COUNT = 5;

/** ローカル時間の今日0時（ISO）。「今日すでに解いた語」の判定に使う */
export function startOfToday(now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * 今日の復習セット。期限が古い順に DAILY_REVIEW_CAP 語まで。
 * 今日すでに解いた語は除く（箱1は「常に期限到来」なので、誤答した語が
 * その場でまた「今日の復習」に戻り、「今日はここまで」が終わらなくなるため）。
 * totalDue は残りの把握用で、UI には出さない前提。
 */
export async function getTodayReviewSet(cap = DAILY_REVIEW_CAP): Promise<{ qids: string[]; totalDue: number }> {
  const userId = await getUserId();
  const now = new Date().toISOString();
  const today0 = startOfToday();
  const [{ data, error }, totalDue] = await Promise.all([
    supabase
      .from('srs_state')
      .select('qid')
      .eq('user_id', userId)
      .lte('next_review', now)
      .or(`last_review.is.null,last_review.lt.${today0}`)
      .order('next_review', { ascending: true })
      .limit(cap),
    getDueCount(),
  ]);
  if (error || !data) {
    console.warn('Failed to fetch today review set:', error);
    return { qids: [], totalDue: 0 };
  }
  return { qids: data.map((r) => r.qid as string), totalDue };
}

/** 最後に復習した日時（srs_state.last_review の最大）。未学習なら null。 */
export async function getLastActivity(): Promise<Date | null> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('srs_state')
    .select('last_review')
    .eq('user_id', userId)
    .not('last_review', 'is', null)
    .order('last_review', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0 || !data[0].last_review) return null;
  return new Date(data[0].last_review as string);
}

/** 空白日数。last が null（初回）なら null。 */
export function gapDays(last: Date | null, now: Date = new Date()): number | null {
  if (!last) return null;
  return Math.floor((now.getTime() - last.getTime()) / 86400000);
}

/**
 * おかえりウォームアップ用: 箱4〜5の語からランダムに n 語。
 * 「まだ覚えている」を先に体験させるためのもので、正誤は通常どおり SRS に反映する。
 */
export async function getWarmupWords(n = WELCOME_WARMUP_COUNT): Promise<string[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('srs_state')
    .select('qid')
    .eq('user_id', userId)
    .gte('box', 4)
    .limit(200);
  if (error || !data || data.length === 0) return [];
  const pool = data.map((r) => r.qid as string);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
