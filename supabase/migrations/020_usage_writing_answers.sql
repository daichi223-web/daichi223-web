-- ============================================================
-- 020_usage_writing_answers.sql
--
-- 教員画面「誤答分析」に、学校・学年・組で絞れる記述の誤答を足す（2026-11-27）。
--   answers 表（記述の答えの本文）には誰の答えかが無いので、学校・学年で分けられない。
--   アプリが記述の判定を learning_events に記録するとき、答えの文を ctx.answer に入れるようにした（同日）。
--   この関数はその行を数える。数えるのは ctx.answer がある行だけ（＝アプリを出した日から後）。
--
-- usage_writing_answers(p_from, p_to, p_users)
--   対象: learning_events の answer で、単語（word）の記述（meaning-writing・context-writing）、正誤が付いた行。
--         「もう一度」の再出題（ctx.retry）は数えない。期間は [p_from, p_to)。NULL は無制限。
--         p_users は集計する生徒の user_id（組・番号は暗号化されているので API が復号して渡す）。NULL は全員。
--   返す値:
--     items  … 語（意味）ごと: n 回答数・wrong 誤答数・users 解いた人・wrongUsers 間違えた人
--     wrongs … 誤答の 語 × 答えの文 × 生徒 ごとの回数。表記ゆれ（normalize）は API が JS でまとめる
--              （answers 表・正解の辞書と同じ関数を使うため。user_id は API の外に出さない）
-- 正誤は最後の判定（自動判定、保留なら生徒の自己判定）。誤答分析の既存の表（candidates）は変えない。
-- 呼び出しは service_role（api/teacher）からのみ。追加だけで、既存の関数・表は変えない。
-- ============================================================

begin;

create or replace function usage_writing_answers(
  p_from timestamptz, p_to timestamptz, p_users text[] default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ans as (
    select e.user_id, e.target_id as id, e.correct, e.ctx->>'answer' as answer
      from learning_events e
     where e.action = 'answer' and e.correct is not null
       and e.target_type = 'word'
       and e.format in ('meaning-writing', 'context-writing')
       and coalesce(e.ctx->>'answer', '') <> ''
       and (p_from is null or e.at >= p_from)
       and (p_to   is null or e.at <  p_to)
       and (p_users is null or e.user_id = any(p_users))
       and coalesce(e.ctx->>'retry', '') <> 'true'
  ),
  ui as (
    select user_id, id, count(*) as n, count(*) filter (where not correct) as wrong
      from ans group by user_id, id
  ),
  item as (
    select id,
           sum(n)::int                            as n,
           sum(wrong)::int                        as wrong,
           count(*)::int                          as users,
           count(*) filter (where wrong > 0)::int as wrong_users
      from ui group by id
  ),
  wr as (
    select id, answer, user_id, count(*)::int as n
      from ans where not correct
     group by id, answer, user_id
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
               'id', id, 'n', n, 'wrong', wrong, 'users', users, 'wrongUsers', wrong_users)
               order by wrong_users desc, id) from item), '[]'::jsonb),
    'wrongs', coalesce((select jsonb_agg(jsonb_build_object(
               'id', id, 'answer', answer, 'user', user_id, 'n', n)
               order by id, answer, user_id) from wr), '[]'::jsonb)
  );
$$;

revoke all on function usage_writing_answers(timestamptz, timestamptz, text[]) from public;
revoke all on function usage_writing_answers(timestamptz, timestamptz, text[]) from anon;
revoke all on function usage_writing_answers(timestamptz, timestamptz, text[]) from authenticated;
grant execute on function usage_writing_answers(timestamptz, timestamptz, text[]) to service_role;

notify pgrst, 'reload schema';

commit;
