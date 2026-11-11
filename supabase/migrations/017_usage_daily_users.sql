-- 017_usage_daily_users.sql
--
-- 教員画面「利用状況」の時系列グラフ用。日ごと（JST）の「使った人」を、領域をまたいで重複なく数える。
-- usage_by_area の days は領域別の人数なので、足しても「その日に使った人」にならない（同じ人が単語と文法を使うため）。
--   usage_daily_users(p_from, p_to, p_users) → [{ day, users, events }]（日付の昇順。記録の無い日は行が無い）
-- 期間・対象の絞り方は usage_by_area と同じ（p_users が null なら全員）。実行権は service_role だけ。
-- 追加だけで、既存の関数・表は変えない。何度流しても同じ結果になる。

create or replace function usage_daily_users(p_from timestamptz, p_to timestamptz, p_users text[] default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'users', users, 'events', events) order by day), '[]'::jsonb)
    from (select (at at time zone 'Asia/Tokyo')::date as day,
                 count(distinct user_id) as users,
                 count(*)                as events
            from learning_events
           where (p_from is null or at >= p_from)
             and (p_to   is null or at <  p_to)
             and (p_users is null or user_id = any(p_users))
           group by 1) d;
$$;

revoke all on function usage_daily_users(timestamptz, timestamptz, text[]) from public;
revoke all on function usage_daily_users(timestamptz, timestamptz, text[]) from anon;
revoke all on function usage_daily_users(timestamptz, timestamptz, text[]) from authenticated;
grant execute on function usage_daily_users(timestamptz, timestamptz, text[]) to service_role;
