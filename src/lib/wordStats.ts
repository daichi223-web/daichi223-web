import { supabase } from './supabase';

/**
 * Get or create anonymous user ID.
 * Reuses the existing anonId from localStorage if present.
 */
export function getUserId(): string {
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
  const userId = getUserId();

  // First, try to get the existing record
  const { data: existing } = await supabase
    .from('word_stats')
    .select('id, correct, incorrect')
    .eq('user_id', userId)
    .eq('qid', qid)
    .single();

  if (existing) {
    // Update existing record
    const updates = isCorrect
      ? { correct: existing.correct + 1, last_seen: new Date().toISOString() }
      : { incorrect: existing.incorrect + 1, last_seen: new Date().toISOString() };

    await supabase
      .from('word_stats')
      .update(updates)
      .eq('id', existing.id);
  } else {
    // Insert new record
    await supabase
      .from('word_stats')
      .insert({
        user_id: userId,
        qid,
        correct: isCorrect ? 1 : 0,
        incorrect: isCorrect ? 0 : 1,
        last_seen: new Date().toISOString(),
      });
  }
}

/**
 * Get all word stats for the current user.
 * Returns a map of qid -> { correct, incorrect, lastSeen }.
 */
export async function getWordStats(): Promise<
  Record<string, { correct: number; incorrect: number; lastSeen: string }>
> {
  const userId = getUserId();

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
 * @param threshold - error rate threshold (0-1). Default 0.5 means >= 50% wrong.
 * @param minAttempts - minimum total attempts to be considered. Default 2.
 * @returns array of qid strings for weak words.
 */
export async function getWeakWords(threshold = 0.5, minAttempts = 2): Promise<string[]> {
  const userId = getUserId();

  const { data, error } = await supabase
    .from('word_stats')
    .select('qid, correct, incorrect')
    .eq('user_id', userId);

  if (error || !data) {
    console.warn('Failed to fetch word stats for weak words:', error);
    return [];
  }

  return data
    .filter((row) => {
      const total = row.correct + row.incorrect;
      if (total < minAttempts) return false;
      const errorRate = row.incorrect / total;
      return errorRate >= threshold;
    })
    .map((row) => row.qid);
}
