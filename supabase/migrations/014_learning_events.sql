-- ============================================================
-- 014_learning_events.sql
--
-- 学習の出来事を1行ずつ追記する分析専用の表（設計 = docs/learning-events-design.md）。
--   単語・文法・教材を同じ形（誰が・何を・どうした・どこから）で残し、教員画面でクロス集計する。
--   既存の word_stats / srs_state / grammar_topic_progress は学習機能が使うので変えない。
--
-- 権限: 生徒は自分の行の insert だけ。select / update / delete のポリシーは作らない
--       （教員画面は service_role で読む）。氏名・メール・学年組番号は入れない。
-- ============================================================

create table if not exists learning_events (
  id          bigint generated always as identity primary key,
  user_id     text not null,                 -- auth.uid()::text（004 と同じ持ち方）
  at          timestamptz not null default now(),
  session_id  text not null,                 -- 端末で起動ごとに作る乱数。流れの復元に使う
  area        text not null check (area in ('vocab','grammar','text')),
  action      text not null check (action in ('answer','view','open')),
  target_type text not null check (char_length(target_type) <= 20),
  target_id   text not null check (char_length(target_id) <= 200),
  correct     boolean,                       -- answer のみ
  chosen      text check (char_length(chosen) <= 200),  -- answer のみ。選んだ選択肢
  format      text check (char_length(format) <= 40),   -- 出題形式
  route       text check (char_length(route) <= 40),    -- 出題の経路
  ctx         jsonb check (pg_column_size(ctx) <= 4000) -- 補足（提示した選択肢、教材 slug、応答時間 など）
);

create index if not exists idx_le_user_at on learning_events (user_id, at);
create index if not exists idx_le_target  on learning_events (target_type, target_id);
create index if not exists idx_le_at      on learning_events (at);

alter table learning_events enable row level security;

drop policy if exists "own_le_insert" on learning_events;
create policy "own_le_insert" on learning_events for insert
  with check (auth.uid()::text = user_id);

revoke all on table learning_events from anon, authenticated;
grant insert on table learning_events to authenticated;

-- ------------------------------------------------------------
-- 端末統合（011）に追従: 匿名側の出来事を登録済みアカウントへ付け替える。
-- 011 の本体はそのまま、learning_events の付け替えと戻り値を足しただけ。
-- ------------------------------------------------------------
create or replace function merge_user_progress(from_uid text, to_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_merged  int := 0; ws_moved  int := 0;
  srs_merged int := 0; srs_moved int := 0;
  gtp_merged int := 0; gtp_moved int := 0;
  le_moved   int := 0;
begin
  if from_uid is null or to_uid is null or from_uid = to_uid then
    raise exception 'merge_user_progress: invalid uids';
  end if;

  -- word_stats: 同じ qid は正誤を合算、last_seen は遅い方
  update word_stats t
     set correct   = t.correct + f.correct,
         incorrect = t.incorrect + f.incorrect,
         last_seen = greatest(t.last_seen, f.last_seen)
    from word_stats f
   where t.user_id = to_uid and f.user_id = from_uid and t.qid = f.qid;
  get diagnostics ws_merged = row_count;
  delete from word_stats f
   where f.user_id = from_uid
     and exists (select 1 from word_stats t where t.user_id = to_uid and t.qid = f.qid);
  update word_stats set user_id = to_uid where user_id = from_uid;
  get diagnostics ws_moved = row_count;

  -- srs_state: 同じ qid は 箱=高い方 / next_review=早い方 / last_review=遅い方（greatest/least は NULL を無視）
  update srs_state t
     set box         = greatest(t.box, f.box),
         next_review = least(t.next_review, f.next_review),
         last_review = greatest(t.last_review, f.last_review)
    from srs_state f
   where t.user_id = to_uid and f.user_id = from_uid and t.qid = f.qid;
  get diagnostics srs_merged = row_count;
  delete from srs_state f
   where f.user_id = from_uid
     and exists (select 1 from srs_state t where t.user_id = to_uid and t.qid = f.qid);
  update srs_state set user_id = to_uid where user_id = from_uid;
  get diagnostics srs_moved = row_count;

  -- grammar_topic_progress: 同じ topic は 視聴=OR / ドリル数=合算 / 習熟=高い方
  update grammar_topic_progress t
     set watched       = t.watched or f.watched,
         drill_total   = t.drill_total + f.drill_total,
         drill_correct = t.drill_correct + f.drill_correct,
         mastery_pct   = greatest(t.mastery_pct, f.mastery_pct),
         updated_at    = greatest(t.updated_at, f.updated_at)
    from grammar_topic_progress f
   where t.user_id = to_uid and f.user_id = from_uid and t.topic_id = f.topic_id;
  get diagnostics gtp_merged = row_count;
  delete from grammar_topic_progress f
   where f.user_id = from_uid
     and exists (select 1 from grammar_topic_progress t where t.user_id = to_uid and t.topic_id = f.topic_id);
  update grammar_topic_progress set user_id = to_uid where user_id = from_uid;
  get diagnostics gtp_moved = row_count;

  -- learning_events: 追記のみの記録なので、そのまま付け替える
  update learning_events set user_id = to_uid where user_id = from_uid;
  get diagnostics le_moved = row_count;

  return jsonb_build_object(
    'word_stats',  jsonb_build_object('merged', ws_merged,  'moved', ws_moved),
    'srs_state',   jsonb_build_object('merged', srs_merged, 'moved', srs_moved),
    'grammar_topic_progress', jsonb_build_object('merged', gtp_merged, 'moved', gtp_moved),
    'learning_events', jsonb_build_object('moved', le_moved)
  );
end
$$;

revoke all on function merge_user_progress(text, text) from public;
revoke all on function merge_user_progress(text, text) from anon;
revoke all on function merge_user_progress(text, text) from authenticated;
grant execute on function merge_user_progress(text, text) to service_role;
