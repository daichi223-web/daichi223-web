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

const BOX_INTERVALS_DAYS: Record<number, number> = {
  1: 0,   // always due
  2: 1,   // 1 day
  3: 3,   // 3 days
  4: 7,   // 7 days
  5: 14,  // 14 days
};

/**
 * Calculate the next review date based on the Leitner box number.
 */
function getNextReviewDate(box: number): string {
  const days = BOX_INTERVALS_DAYS[box] ?? 0;
  const next = new Date();
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
    const currentBox = existing.box;
    const newBox = isCorrect ? Math.min(currentBox + 1, 5) : 1;

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
    const newBox = isCorrect ? 2 : 1;

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
