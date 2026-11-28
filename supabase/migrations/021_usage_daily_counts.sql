-- 021_usage_daily_counts.sql
--
-- 教員画面「利用状況」の時系列グラフに「回数」を足す（2026-11-28）。
--   017 の usage_daily_users は日ごとの「使った人」。usage_by_area の days.events は画面を開いただけの記録も含む操作数で、
--   「どれくらいやったか」の量にならない。そこで日ごと（JST）・領域ごとに、
--     answers … 解いた問題の数（action = 'answer'。単語・文法。「もう一度」の再出題も練習の量として数える）
--     correct … そのうち正解
--     opens   … 教材を開いた回数（area = 'text' かつ target_type = 'text'。016 の texts.views・people.textViews と同じ数え方）
--   を返す。
--   usage_daily_counts(p_from, p_to, p_users) → [{ day, area, answers, correct, opens }]（日付・領域の昇順。記録の無い日は行が無い）
-- 期間・対象の絞り方は usage_by_area と同じ（p_users が null なら全員）。実行権は service_role だけ。
-- 追加だけで、既存の関数・表は変えない。何度流しても同じ結果になる。

begin;

create or replace function usage_daily_counts(p_from timestamptz, p_to timestamptz, p_users text[] default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', day, 'area', area, 'answers', answers, 'correct', correct, 'opens', opens) order by day, area), '[]'::jsonb)
    from (select (at at time zone 'Asia/Tokyo')::date as day,
                 area,
                 count(*) filter (where action = 'answer')                           as answers,
                 count(*) filter (where action = 'answer' and correct)               as correct,
                 count(*) filter (where area = 'text' and target_type = 'text')      as opens
            from learning_events
           where (p_from is null or at >= p_from)
             and (p_to   is null or at <  p_to)
             and (p_users is null or user_id = any(p_users))
           group by 1, 2) d;
$$;

revoke all on function usage_daily_counts(timestamptz, timestamptz, text[]) from public;
revoke all on function usage_daily_counts(timestamptz, timestamptz, text[]) from anon;
revoke all on function usage_daily_counts(timestamptz, timestamptz, text[]) from authenticated;
grant execute on function usage_daily_counts(timestamptz, timestamptz, text[]) to service_role;

notify pgrst, 'reload schema';

commit;
