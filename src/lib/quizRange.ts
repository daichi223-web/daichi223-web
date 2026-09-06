/**
 * 小テスト範囲（教員が設定した「今週ここ」）。
 *
 * 生徒は範囲を自分で指定できるが、実際の学習は小テスト範囲に張り付く。
 * 教員が1回設定すれば、生徒のホーム最上段に「あと3日・101〜150」が出る。
 * 自由度は減らさず、指定の手間だけを消す。
 *
 * 読み取りは anon（RLS: active = true のみ）。書き込みは /api/teacher。
 */
import { supabase } from './supabase';
import { getCohort, DEFAULT_COHORT } from './cohort';

export type QuizRange = {
  cohort: string;
  label: string | null;
  from: number;
  to: number;
  dueDate: string | null; // YYYY-MM-DD
  note: string | null;
};

type Row = {
  cohort: string;
  label: string | null;
  range_from: number;
  range_to: number;
  due_date: string | null;
  note: string | null;
};

const TTL_MS = 5 * 60 * 1000;
let cache: { key: string; value: QuizRange | null; fetchedAt: number } | null = null;

function toRange(r: Row): QuizRange {
  return {
    cohort: r.cohort,
    label: r.label,
    from: r.range_from,
    to: r.range_to,
    dueDate: r.due_date,
    note: r.note,
  };
}

/**
 * 今の小テスト範囲。自分の cohort を優先し、無ければ default。
 * 表が無い・未設定・エラーはすべて null（ホームに何も出さない）。
 */
export async function getActiveQuizRange(): Promise<QuizRange | null> {
  const cohort = getCohort();
  const now = Date.now();
  if (cache && cache.key === cohort && now - cache.fetchedAt < TTL_MS) return cache.value;

  const cohorts = cohort === DEFAULT_COHORT ? [DEFAULT_COHORT] : [cohort, DEFAULT_COHORT];
  try {
    const { data, error } = await supabase
      .from('quiz_ranges')
      .select('cohort, label, range_from, range_to, due_date, note')
      .eq('active', true)
      .in('cohort', cohorts);
    if (error || !data || data.length === 0) {
      cache = { key: cohort, value: null, fetchedAt: now };
      return null;
    }
    const rows = data as Row[];
    const mine = rows.find((r) => r.cohort === cohort) ?? rows.find((r) => r.cohort === DEFAULT_COHORT);
    const value = mine ? toRange(mine) : null;
    cache = { key: cohort, value, fetchedAt: now };
    return value;
  } catch {
    return null;
  }
}

export function invalidateQuizRangeCache(): void {
  cache = null;
}

/**
 * テストまでの残り日数。日付が無ければ null、当日は 0、過ぎていれば負。
 * ローカル日付どうしの比較（時刻は見ない）。
 */
export function daysUntil(dueDate: string | null, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** ホームの見出し。「金曜の小テスト・あと3日」など。過ぎた範囲は null（出さない） */
export function quizRangeHeadline(r: QuizRange, now: Date = new Date()): string | null {
  const d = daysUntil(r.dueDate, now);
  if (d != null && d < 0) return null;
  const name = r.label && r.label !== '' ? r.label : '小テスト';
  if (d == null) return name;
  if (d === 0) return `${name}・今日`;
  if (d === 1) return `${name}・明日`;
  return `${name}・あと${d}日`;
}
