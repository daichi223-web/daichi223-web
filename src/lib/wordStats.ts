import { supabase } from './supabase';
import { currentAuthUid } from './anonAuth';
import { updateStreak } from './streak';

/**
 * 現在のユーザー ID を返す。
 * - 第一選択: Supabase Anonymous Sign-in による auth.uid（RLS と整合）
 * - フォールバック: localStorage の legacy anonId（Anonymous Sign-in 不可環境向け）
 *
 * RLS は auth.uid ベースに締めるので、フォールバックが走った場合は
 * DB 書き込みは 401/permission_denied で失敗する（壊れずスキップされる）。
 */
export async function getUserId(): Promise<string> {
  const uid = await currentAuthUid();
  if (uid) return uid;
  let id = localStorage.getItem('anonId');
  if (!id) {
    id = `anon_${crypto.randomUUID()}`;
    localStorage.setItem('anonId', id);
  }
  return id;
}

/**
 * Record a quiz answer (correct or incorrect).
 * Uses upsert to atomically increment the correct/incorrect counter.
 */
export async function recordAnswer(qid: string, isCorrect: boolean): Promise<void> {
  // ストリークを localStorage で先に更新 (Supabase 失敗してもストリークは維持)
  try {
    updateStreak();
  } catch {
    // noop
  }
  const userId = await getUserId();

  // First, try to get the existing record
  const { data: existing, error: readError } = await supabase
    .from('word_stats')
    .select('id, correct, incorrect')
    .eq('user_id', userId)
    .eq('qid', qid)
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    // Update existing record
    const updates = isCorrect
      ? { correct: existing.correct + 1, last_seen: new Date().toISOString() }
      : { incorrect: existing.incorrect + 1, last_seen: new Date().toISOString() };

    const { error } = await supabase
      .from('word_stats')
      .update(updates)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    // Insert new record
    const { error } = await supabase
      .from('word_stats')
      .insert({
        user_id: userId,
        qid,
        correct: isCorrect ? 1 : 0,
        incorrect: isCorrect ? 0 : 1,
        last_seen: new Date().toISOString(),
      });
    if (error) throw error;
  }
}

/**
 * Get all word stats for the current user.
 * Returns a map of qid -> { correct, incorrect, lastSeen }.
 */
export async function getWordStats(): Promise<
  Record<string, { correct: number; incorrect: number; lastSeen: string }>
> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('word_stats')
    .select('qid, correct, incorrect, last_seen')
    .eq('user_id', userId);

  if (error || !data) {
    console.warn('Failed to fetch word stats:', error);
    return {};
  }

  const result: Record<string, { correct: number; incorrect: number; lastSeen: string }> = {};
  for (const row of data) {
    result[row.qid] = {
      correct: row.correct,
      incorrect: row.incorrect,
      lastSeen: row.last_seen,
    };
  }
  return result;
}

/**
 * Get weak words: qids where the error rate exceeds the threshold
 * and the user has attempted the word at least `minAttempts` times.
 *
 * @param threshold - error rate threshold (0-1). Default 0.4 means >= 40% wrong.
 * @param minAttempts - minimum total attempts to be considered. Default 1.
 * @returns array of qid strings for weak words.
 */
export async function getWeakWords(threshold = 0.4, minAttempts = 1, qids?: string[]): Promise<string[]> {
  if (qids?.length === 0) return [];
  const userId = await getUserId();
  let statsQuery = supabase.from('word_stats').select('qid, correct, incorrect').eq('user_id', userId);
  let srsQuery = supabase.from('srs_state').select('qid').eq('user_id', userId).eq('box', 1);
  if (qids) {
    statsQuery = statsQuery.in('qid', qids);
    srsQuery = srsQuery.in('qid', qids);
  }
  const [{ data, error }, { data: relearning, error: srsError }] = await Promise.all([
    statsQuery, srsQuery,
  ]);

  if (error || srsError) throw error ?? srsError;

  // 箱1は直近で忘れた語。過去の高い正答率で埋もれないように先頭へ。
  return [...new Set([...(relearning ?? []).map((row) => row.qid), ...(data ?? [])
    .filter((row) => {
      const total = row.correct + row.incorrect;
      if (total < minAttempts) return false;
      const errorRate = row.incorrect / total;
      return errorRate >= threshold;
    })
    .map((row) => row.qid)])].filter(qid => !qids || qids.includes(qid));
}
