-- ============================================================
-- 015_usage_by_area.sql
--
-- 教員画面「利用状況」の「単語と教材」表示の集計関数（設計 = docs/learning-events-design.md §7）。
--   learning_events を領域（vocab / grammar / text）ごとに集計し、集計結果だけを jsonb で返す。
--   生の行はブラウザへ送らない。日付は JST（Asia/Tokyo）で区切る。
--
-- 呼び出しは service_role（api/teacher?action=usageAreas）からのみ。anon/authenticated には実行権を与えない。
-- 返す user_id は API 側で「学校コード＋年-組-番号」か匿名 ID の先頭8桁に置き換える。
-- 期間は [p_from, p_to)。NULL は無制限。
-- ============================================================

create or replace function usage_by_area(p_from timestamptz, p_to timestamptz)
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

revoke all on function usage_by_area(timestamptz, timestamptz) from public;
revoke all on function usage_by_area(timestamptz, timestamptz) from anon;
revoke all on function usage_by_area(timestamptz, timestamptz) from authenticated;
grant execute on function usage_by_area(timestamptz, timestamptz) to service_role;
