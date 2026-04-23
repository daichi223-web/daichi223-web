-- ============================================================
-- 004_rls_tighten.sql
--
-- word_stats / srs_state の RLS を `using (true)` から
-- `auth.uid()::text = user_id` ベースに締める。
--
-- 前提: アプリ起動時に supabase.auth.signInAnonymously() で
--       匿名 auth セッションが確立していること（src/lib/anonAuth.ts）。
--
-- 影響: 既存の `user_id = 'anon_<uuid>'` 形式の行は auth.uid と
--       一致しないため、anon key からは UNREACHABLE になる
--       （DB には残るが事実上オーファン化）。service_role では到達可能。
-- ============================================================

-- 既存の緩い policy を全削除
drop policy if exists "Users can read own word_stats"   on word_stats;
drop policy if exists "Users can insert own word_stats" on word_stats;
drop policy if exists "Users can update own word_stats" on word_stats;
drop policy if exists "Users can read own srs_state"    on srs_state;
drop policy if exists "Users can insert own srs_state"  on srs_state;
drop policy if exists "Users can update own srs_state"  on srs_state;

-- word_stats: 自分の行のみ read / insert / update 可能
create policy "own_word_stats_select"
  on word_stats for select
  using (auth.uid()::text = user_id);

create policy "own_word_stats_insert"
  on word_stats for insert
  with check (auth.uid()::text = user_id);

create policy "own_word_stats_update"
  on word_stats for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- srs_state: 同上
create policy "own_srs_state_select"
  on srs_state for select
  using (auth.uid()::text = user_id);

create policy "own_srs_state_insert"
  on srs_state for insert
  with check (auth.uid()::text = user_id);

create policy "own_srs_state_update"
  on srs_state for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
