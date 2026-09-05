-- 011_merge_user_progress.sql
-- 2台目の端末で匿名のまま進めた学習記録を、メール登録済みアカウントへ統合する。
--   呼び出しは service_role（/api/mergeAccount）からのみ。anon/authenticated には実行権を与えない。
--   重複キー（同じ qid / topic_id）は「合算・高い方・早い方」で畳み、残りは user_id を付け替える。
--   from 側の行は統合後に残らない（削除 or 付け替え）。auth.users の匿名ユーザー自体は消さない。

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

  return jsonb_build_object(
    'word_stats',  jsonb_build_object('merged', ws_merged,  'moved', ws_moved),
    'srs_state',   jsonb_build_object('merged', srs_merged, 'moved', srs_moved),
    'grammar_topic_progress', jsonb_build_object('merged', gtp_merged, 'moved', gtp_moved)
  );
end
$$;

revoke all on function merge_user_progress(text, text) from public;
revoke all on function merge_user_progress(text, text) from anon;
revoke all on function merge_user_progress(text, text) from authenticated;
grant execute on function merge_user_progress(text, text) to service_role;
