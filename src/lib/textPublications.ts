import { supabase } from './supabase';
import { getCohort, DEFAULT_COHORT } from './cohort';

// cohort 別キャッシュ。コホート切替時に re-fetch されるよう key 込みで持つ。
const cache = new Map<string, { set: Set<string>; fetchedAt: number }>();
const TTL_MS = 60 * 1000;

/**
 * Get set of published text slugs for current cohort.
 * 表示対象 = (cohort = 自分のコホート) UNION (cohort = 'default')
 *
 * テーブル未作成の場合は null を返し、呼び出し側で「制限なし=全表示」にフォールバック。
 */
export async function getPublishedSlugs(): Promise<Set<string> | null> {
  const cohort = getCohort();
  const key = cohort;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < TTL_MS) return hit.set;

  try {
    // default cohort と自分の cohort を両方取得
    const cohorts = cohort === DEFAULT_COHORT ? [DEFAULT_COHORT] : [cohort, DEFAULT_COHORT];
    const { data, error } = await supabase
      .from('text_publications')
      .select('slug')
      .eq('published', true)
      .in('cohort', cohorts);
    if (error) {
      // table missing or RLS issue → "全公開" 扱い
      return null;
    }
    const set = new Set((data || []).map((r: { slug: string }) => r.slug));
    cache.set(key, { set, fetchedAt: now });
    return set;
  } catch {
    return null;
  }
}

export function invalidatePublishedSlugsCache(): void {
  cache.clear();
}
