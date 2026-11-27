-- ============================================================
-- 019_usage_stumbles_word_formats.sql
--
-- 教員画面「単語の誤答を書き出す」を選択式の回答だけで数えるため（2026-11-27）。
--   usage_stumbles に p_word_formats（単語の出題形式の一覧）を足す。
--   learning_events.format が一覧に入る単語の回答だけを数える。null なら全形式で、016 と同じ結果。
--   ドリルの回答は絞らない。本体は 016 のまま（絞り込みの1行だけ追加）。
--   書き出しが渡す選択式 = word-meaning / word-reverse / sentence-meaning / blank-fill / example-comprehension
--   （数えない = true-false〔○×〕・meaning-writing / context-writing〔記述〕）。
-- 引数の数が変わるので、5 引数の旧関数は落とす（名前つき引数の呼び出しが曖昧になるため。016 の usage_by_area と同じ扱い）。
-- 既存の呼び出し（p_word_formats なし）は既定値つきの新関数がそのまま受ける。何度流しても同じ結果になる。
-- ============================================================

begin;

drop function if exists usage_stumbles(timestamptz, timestamptz, text[], int, int);

create or replace function usage_stumbles(
  p_from timestamptz, p_to timestamptz, p_users text[] default null,
  p_min_n int default 5, p_min_users int default 3,
  p_word_formats text[] default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ans as (
    select e.id as eid, e.at, e.user_id, e.target_type as type, e.target_id as id, e.correct, e.chosen,
           case when e.target_type = 'drill' then coalesce(d.topic_id, e.ctx->>'topic') end as topic
      from learning_events e
      left join grammar_drills d on e.target_type = 'drill' and d.id = e.target_id
     where e.action = 'answer' and e.correct is not null
       and e.target_type in ('word', 'drill')
       and (p_from is null or e.at >= p_from)
       and (p_to   is null or e.at <  p_to)
       and (p_users is null or e.user_id = any(p_users))
       and coalesce(e.ctx->>'retry', '') <> 'true'
       and coalesce(e.ctx->>'role', '')  <> 'retry'
       -- 019: 単語の回答だけを出題形式で絞る（null なら全形式＝016 と同じ）。ドリルは絞らない
       and (p_word_formats is null or e.target_type <> 'word' or e.format = any(p_word_formats))
  ),
  -- 生徒 × 設問。first_ok = その生徒の期間内の最初の1回が正解だったか
  ui as (
    select user_id, type, id, max(topic) as topic,
           count(*) as n, count(*) filter (where not correct) as wrong,
           (array_agg(correct order by at, eid))[1] as first_ok
      from ans group by user_id, type, id
  ),
  item as (
    select type, id, max(topic) as topic,
           sum(n)::int                          as n,
           sum(wrong)::int                      as wrong,
           count(*)::int                        as users,
           count(*) filter (where wrong > 0)::int   as wrong_users,
           count(*) filter (where wrong >= 2)::int  as repeat_users,
           count(*) filter (where not first_ok)::int as first_wrong
      from ui group by type, id
  ),
  conf as (
    select type, id, chosen, count(*) as n, count(distinct user_id) as users,
           row_number() over (partition by type, id order by count(*) desc, chosen) as rk
      from ans
     where not correct and chosen is not null and chosen <> '' and chosen <> id
       and (type = 'drill' or chosen ~ '^[0-9]+-[0-9]+$')
     group by type, id, chosen
  )
  select jsonb_build_object(
    'minN', p_min_n, 'minUsers', p_min_users,
    'totals', coalesce((
      select jsonb_object_agg(type, jsonb_build_object('n', n, 'wrong', wrong, 'users', users))
        from (select type, count(*) as n, count(*) filter (where not correct) as wrong,
                     count(distinct user_id) as users
                from ans group by type) t), '{}'::jsonb),
    'words', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'n', i.n, 'wrong', i.wrong, 'users', i.users, 'wrongUsers', i.wrong_users,
               'repeatUsers', i.repeat_users, 'firstWrong', i.first_wrong,
               'confused', coalesce((select jsonb_agg(jsonb_build_object('id', c.chosen, 'n', c.n, 'users', c.users) order by c.rk)
                                       from conf c where c.type = 'word' and c.id = i.id and c.rk <= 3), '[]'::jsonb))
               order by i.repeat_users desc, i.wrong_users desc, i.id)
        from item i
       where i.type = 'word' and i.n >= p_min_n and i.users >= p_min_users), '[]'::jsonb),
    'drills', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'topic', i.topic, 'n', i.n, 'wrong', i.wrong,
               'users', i.users, 'wrongUsers', i.wrong_users,
               'repeatUsers', i.repeat_users, 'firstWrong', i.first_wrong,
               'confused', coalesce((select jsonb_agg(jsonb_build_object('id', c.chosen, 'n', c.n, 'users', c.users) order by c.rk)
                                       from conf c where c.type = 'drill' and c.id = i.id and c.rk <= 3), '[]'::jsonb))
               order by i.repeat_users desc, i.wrong_users desc, i.id)
        from item i
       where i.type = 'drill' and i.n >= p_min_n and i.users >= p_min_users), '[]'::jsonb),
    -- 単元: users = 解いた人、wrongUsers = 単元内で1回でも間違えた人、
    --       firstN / firstWrong = 「生徒×ドリル」の初回の数と、そのうち誤答
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', topic, 'n', n, 'wrong', wrong, 'users', users, 'wrongUsers', wrong_users,
               'drills', drills, 'firstN', first_n, 'firstWrong', first_wrong)
               order by first_wrong::numeric / first_n desc, n desc, topic)
        from (select topic, sum(n)::int as n, sum(wrong)::int as wrong,
                     count(distinct user_id)::int as users,
                     count(distinct user_id) filter (where wrong > 0)::int as wrong_users,
                     count(distinct id)::int as drills,
                     count(*)::int as first_n,
                     count(*) filter (where not first_ok)::int as first_wrong
                from ui where type = 'drill' and topic is not null group by topic) t), '[]'::jsonb)
  );
$$;

revoke all on function usage_stumbles(timestamptz, timestamptz, text[], int, int, text[]) from public;
revoke all on function usage_stumbles(timestamptz, timestamptz, text[], int, int, text[]) from anon;
revoke all on function usage_stumbles(timestamptz, timestamptz, text[], int, int, text[]) from authenticated;
grant execute on function usage_stumbles(timestamptz, timestamptz, text[], int, int, text[]) to service_role;

-- API（PostgREST）に新しい引数を知らせる
notify pgrst, 'reload schema';

commit;
