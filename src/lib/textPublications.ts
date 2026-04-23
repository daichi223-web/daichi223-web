import { supabase } from './supabase';

let publishedCache: Set<string> | null = null;
let fetchedAt = 0;
const TTL_MS = 60 * 1000;

/**
 * Get set of published text slugs (anon-readable via RLS).
 * If the table doesn't exist yet (migration not applied), falls back to "all published".
 */
export async function getPublishedSlugs(): Promise<Set<string> | null> {
  const now = Date.now();
  if (publishedCache && now - fetchedAt < TTL_MS) return publishedCache;
  try {
    const { data, error } = await supabase
      .from('text_publications')
      .select('slug')
      .eq('published', true);
    if (error) {
      // Table missing or RLS mis-config -> treat as "no restriction" (all visible)
      return null;
    }
    publishedCache = new Set((data || []).map((r: any) => r.slug));
    fetchedAt = now;
    return publishedCache;
  } catch {
    return null;
  }
}

export function invalidatePublishedSlugsCache() {
  publishedCache = null;
  fetchedAt = 0;
}
