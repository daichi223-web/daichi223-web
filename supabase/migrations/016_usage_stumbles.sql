-- ============================================================
-- 016_usage_stumbles.sql
--
-- 教員画面「利用状況」の組み直し（2026-11-10）。
--   1. usage_by_area に p_users（集計する生徒の user_id の一覧）を足す。
--      組・番号は暗号化されていて DB では絞れないので、API が復号して該当する生徒の ID を渡す。
--      NULL なら全員（015 と同じ結果）。2 引数の旧関数は落とす（名前つき引数の呼び出しが曖昧になるため）。
--      旧アプリの 2 引数の呼び出しは、既定値つきの新関数がそのまま受ける。
--   2. usage_stumbles … 「何でつまずいているか」。単語（意味ごと）・文法ドリル・文法の単元ごとの誤答。
--   3. usage_stumble_users … 1 つの語・ドリル・単元を、誰が何回まちがえたか。
--   4. usage_ranges … 「誰がどの範囲をやっているか」。生徒ごとの 単語の番号帯（50語ごと）・文法の単元・教材。
--
-- 回答の数え方（2〜4 共通）:
--   learning_events の answer のうち、単語クイズ（word）と文法ドリル（drill）で、正誤が付いた行。
--   「もう一度」の再出題（単語 ctx.retry / ドリル ctx.role = retry）は数えない。
--   単元はドリルの表（grammar_drills.topic_id）から引き、無ければ ctx.topic。
-- 呼び出しは service_role（api/teacher）からのみ。期間は [p_from, p_to)。NULL は無制限。
-- ============================================================

drop function if exists usage_by_area(timestamptz, timestamptz);

create or replace function usage_by_area(p_from timestamptz, p_to timestamptz, p_users text[] default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ev as (
    select user_id, at, session_id, area, action, target_type, target_id, correct, ctx,
           (at at time zone 'Asia/Tokyo')::date as day,
           case when area = 'text' and target_type in ('text', 'guide') then target_id
                when area = 'text' then ctx->>'text' end as slug
      from learning_events
     where (p_from is null or at >= p_from)
       and (p_to   is null or at <  p_to)
       and (p_users is null or user_id = any(p_users))
  ),
  u as (
    select user_id,
           bool_or(area = 'vocab')   as v,
           bool_or(area = 'text')    as t,
           bool_or(area = 'grammar') as g
      from ev group by user_id
  ),
  term as (
    select slug, target_type as kind,
           case when target_type = 'token' then coalesce(nullif(ctx->>'base', ''), ctx->>'t', target_id)
                else target_id end as label,
           count(*) as n, count(distinct user_id) as users
      from ev
     where area = 'text' and action = 'open' and slug is not null
     group by 1, 2, 3
  ),
  term_ranked as (
    select *, row_number() over (partition by slug order by n desc, users desc, label) as rk from term
  )
  select jsonb_build_object(
    'first', (select min(at) from ev),
    'last',  (select max(at) from ev),
    'events', (select count(*) from ev),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'area', area, 'users', users, 'sessions', sessions, 'events', events,
               'answers', answers, 'correct', correct) order by area)
        from (select area,
                     count(distinct user_id)    as users,
                     count(distinct session_id) as sessions,
                     count(*)                   as events,
                     count(*) filter (where action = 'answer')                as answers,
                     count(*) filter (where action = 'answer' and correct)    as correct
                from ev group by area) a), '[]'::jsonb),
    'kinds', coalesce((
      select jsonb_agg(jsonb_build_object('area', area, 'action', action, 'type', target_type, 'n', n)
                       order by area, n desc)
        from (select area, action, target_type, count(*) as n from ev group by 1, 2, 3) k), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'area', area, 'users', users, 'events', events)
                       order by day, area)
        from (select day, area, count(distinct user_id) as users, count(*) as events
                from ev group by day, area) d), '[]'::jsonb),
    'overlap', (
      select jsonb_build_object(
               'all',        count(*),
               'vocabOnly',  count(*) filter (where v and not t),
               'textOnly',   count(*) filter (where t and not v),
               'both',       count(*) filter (where v and t),
               'grammar',    count(*) filter (where g),
               'grammarOnly',count(*) filter (where g and not v and not t))
        from u),
    'texts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', slug, 'users', users, 'views', views, 'guide', guide,
               'lemmaOpen', lemma_open, 'tokenOpen', token_open) order by users desc, views desc, slug)
        from (select slug,
                     count(distinct user_id) as users,
                     count(*) filter (where target_type = 'text')  as views,
                     count(*) filter (where target_type = 'guide') as guide,
                     count(*) filter (where target_type = 'lemma') as lemma_open,
                     count(*) filter (where target_type = 'token') as token_open
                from ev where area = 'text' and slug is not null group by slug) x), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object('slug', slug, 'kind', kind, 'label', label, 'n', n, 'users', users)
                       order by slug, rk)
        from term_ranked where rk <= 10), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'uid', user_id,
               'vocab', vocab, 'vocabAns', vocab_ans, 'vocabCorrect', vocab_correct,
               'text', text, 'textViews', text_views, 'texts', texts,
               'grammar', grammar, 'grammarAns', grammar_ans, 'grammarCorrect', grammar_correct,
               'days', days, 'last', last) order by last desc)
        from (select user_id,
                     count(*) filter (where area = 'vocab')                                   as vocab,
                     count(*) filter (where area = 'vocab' and action = 'answer')             as vocab_ans,
                     count(*) filter (where area = 'vocab' and action = 'answer' and correct) as vocab_correct,
                     count(*) filter (where area = 'text')                                    as text,
                     count(*) filter (where area = 'text' and target_type = 'text')           as text_views,
                     count(distinct slug)                                                      as texts,
                     count(*) filter (where area = 'grammar')                                 as grammar,
                     count(*) filter (where area = 'grammar' and action = 'answer')           as grammar_ans,
                     count(*) filter (where area = 'grammar' and action = 'answer' and correct) as grammar_correct,
                     count(distinct day)                                                       as days,
                     max(at)                                                                   as last
                from ev group by user_id) p), '[]'::jsonb)
  );
$$;

revoke all on function usage_by_area(timestamptz, timestamptz, text[]) from public;
revoke all on function usage_by_area(timestamptz, timestamptz, text[]) from anon;
revoke all on function usage_by_area(timestamptz, timestamptz, text[]) from authenticated;
grant execute on function usage_by_area(timestamptz, timestamptz, text[]) to service_role;

-- ------------------------------------------------------------
-- 2. 何でつまずいているか
-- ------------------------------------------------------------
create or replace function usage_stumbles(
  p_from timestamptz, p_to timestamptz, p_users text[] default null,
  p_min_n int default 5, p_min_users int default 3)
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

revoke all on function usage_stumbles(timestamptz, timestamptz, text[], int, int) from public;
revoke all on function usage_stumbles(timestamptz, timestamptz, text[], int, int) from anon;
revoke all on function usage_stumbles(timestamptz, timestamptz, text[], int, int) from authenticated;
grant execute on function usage_stumbles(timestamptz, timestamptz, text[], int, int) to service_role;

-- ------------------------------------------------------------
-- 3. 1 つの語・ドリル・単元を、誰が何回まちがえたか
--    p_type: 'word'（p_id = qid）/ 'drill'（p_id = ドリルの id）/ 'topic'（p_id = 単元の id）
-- ------------------------------------------------------------
create or replace function usage_stumble_users(
  p_from timestamptz, p_to timestamptz, p_users text[], p_type text, p_id text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ans as (
    select e.user_id, e.target_type as type, e.target_id as id, e.correct, e.at,
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
  )
  select coalesce(jsonb_agg(jsonb_build_object('uid', user_id, 'n', n, 'wrong', wrong, 'last', last)
                            order by wrong desc, n desc, user_id), '[]'::jsonb)
    from (select user_id, count(*) as n, count(*) filter (where not correct) as wrong, max(at) as last
            from ans
           where (p_type = 'topic' and type = 'drill' and topic = p_id)
              or (p_type in ('word', 'drill') and type = p_type and id = p_id)
           group by user_id) u;
$$;

revoke all on function usage_stumble_users(timestamptz, timestamptz, text[], text, text) from public;
revoke all on function usage_stumble_users(timestamptz, timestamptz, text[], text, text) from anon;
revoke all on function usage_stumble_users(timestamptz, timestamptz, text[], text, text) from authenticated;
grant execute on function usage_stumble_users(timestamptz, timestamptz, text[], text, text) to service_role;

-- ------------------------------------------------------------
-- 4. 誰がどの範囲をやっているか
--    vocab   … 生徒 × 単語の番号帯（band = 帯の先頭の番号。1, 51, 101, …）ごとの 回答・正解・触れた語（意味）の数
--    grammar … 生徒 × 単元ごとの 回答・正解
--    text    … 生徒 × 教材ごとの 本文を開いた回数・解説を開いた回数
-- ------------------------------------------------------------
create or replace function usage_ranges(p_from timestamptz, p_to timestamptz, p_users text[] default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ev as (
    select e.user_id, e.area, e.action, e.target_type, e.target_id, e.correct, e.ctx
      from learning_events e
     where (p_from is null or e.at >= p_from)
       and (p_to   is null or e.at <  p_to)
       and (p_users is null or e.user_id = any(p_users))
  ),
  ans as (
    select ev.user_id, ev.target_type as type, ev.target_id as id, ev.correct,
           case when ev.target_type = 'drill' then coalesce(d.topic_id, ev.ctx->>'topic') end as topic
      from ev
      left join grammar_drills d on ev.target_type = 'drill' and d.id = ev.target_id
     where ev.action = 'answer' and ev.correct is not null
       and ev.target_type in ('word', 'drill')
       and coalesce(ev.ctx->>'retry', '') <> 'true'
       and coalesce(ev.ctx->>'role', '')  <> 'retry'
  ),
  tx as (
    select user_id, action, target_type,
           case when target_type in ('text', 'guide') then target_id else ctx->>'text' end as slug
      from ev where area = 'text'
  )
  select jsonb_build_object(
    'vocab', coalesce((
      select jsonb_agg(jsonb_build_object('uid', user_id, 'band', band, 'n', n, 'correct', correct, 'words', words)
                       order by user_id, band)
        from (select user_id,
                     ((split_part(id, '-', 1)::int - 1) / 50) * 50 + 1 as band,
                     count(*) as n, count(*) filter (where correct) as correct,
                     count(distinct id) as words
                from ans where type = 'word' and id ~ '^[0-9]+-[0-9]+$'
               group by 1, 2) v), '[]'::jsonb),
    'grammar', coalesce((
      select jsonb_agg(jsonb_build_object('uid', user_id, 'topic', topic, 'n', n, 'correct', correct)
                       order by user_id, topic)
        from (select user_id, topic, count(*) as n, count(*) filter (where correct) as correct
                from ans where type = 'drill' and topic is not null
               group by 1, 2) g), '[]'::jsonb),
    'text', coalesce((
      select jsonb_agg(jsonb_build_object('uid', user_id, 'slug', slug, 'views', views, 'opens', opens)
                       order by user_id, slug)
        from (select user_id, slug,
                     count(*) filter (where target_type = 'text') as views,
                     count(*) filter (where action = 'open')      as opens
                from tx where slug is not null
               group by 1, 2) t), '[]'::jsonb)
  );
$$;

revoke all on function usage_ranges(timestamptz, timestamptz, text[]) from public;
revoke all on function usage_ranges(timestamptz, timestamptz, text[]) from anon;
revoke all on function usage_ranges(timestamptz, timestamptz, text[]) from authenticated;
grant execute on function usage_ranges(timestamptz, timestamptz, text[]) to service_role;
