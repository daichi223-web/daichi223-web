-- ============================================================
-- 007_grammar_dojo.sql
--
-- 文法道場（Grammar Dojo）のスキーマ。
-- - コンテンツ（grammar_media / grammar_drills）は公開read・書込は
--   service_role / Dashboard のみ（insert/update policy を作らない）。
-- - 反復は既存 srs_state / word_stats を qid 流用するため新テーブル不要。
-- - 単元到達度（grammar_topic_progress）は per-user, RLS=auth.uid。
--   既存 004_rls_tighten.sql と同じ `auth.uid()::text = user_id` 方式。
-- - 動画 mp4 は Storage 公開バケット grammar-videos に格納。
-- ============================================================

-- ① 講義動画メタ（mp4 本体は Storage、ここは参照情報）
create table if not exists grammar_media (
  id uuid default gen_random_uuid() primary key,
  topic_id text not null,
  kind text not null default 'mp4',
  storage_path text not null,       -- 例 'jodoshi-mu.mp4'（bucket: grammar-videos）
  title text not null,
  sec int,
  poster_path text,
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_grammar_media_topic on grammar_media (topic_id);

-- ② ドリル。id = srs_state / word_stats の qid に流用（例 'jodoshi-mu-01'）
create table if not exists grammar_drills (
  id text primary key,
  topic_id text not null,
  kind text not null,               -- katsuyo-type/katsuyo-fill/table-complete/setsuzoku/imi/shikibetsu
  prompt text not null,
  context text,
  choices jsonb,                    -- string[]（選択式のみ）
  answer jsonb not null,            -- string | string[]
  explanation text not null,
  ref_heading text,                 -- 該当リファレンス節の heading
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_grammar_drills_topic on grammar_drills (topic_id);

-- ③ 単元到達度（per-user）。視聴フラグ + ドリル集計 + 到達度
create table if not exists grammar_topic_progress (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  topic_id text not null,
  watched boolean default false,
  drill_total int default 0,
  drill_correct int default 0,
  mastery_pct int default 0,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, topic_id)
);
create index if not exists idx_gtp_user on grammar_topic_progress (user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- コンテンツ: 公開read のみ（書込 policy なし = anon/authenticated からは書込不可）
alter table grammar_media  enable row level security;
alter table grammar_drills enable row level security;

drop policy if exists "public_read_grammar_media"  on grammar_media;
drop policy if exists "public_read_grammar_drills" on grammar_drills;
create policy "public_read_grammar_media"  on grammar_media  for select using (true);
create policy "public_read_grammar_drills" on grammar_drills for select using (true);

-- 到達度: 本人のみ read/insert/update（004 と同方式）
alter table grammar_topic_progress enable row level security;

drop policy if exists "own_gtp_select" on grammar_topic_progress;
drop policy if exists "own_gtp_insert" on grammar_topic_progress;
drop policy if exists "own_gtp_update" on grammar_topic_progress;
create policy "own_gtp_select" on grammar_topic_progress for select
  using (auth.uid()::text = user_id);
create policy "own_gtp_insert" on grammar_topic_progress for insert
  with check (auth.uid()::text = user_id);
create policy "own_gtp_update" on grammar_topic_progress for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- ============================================================
-- Storage: 公開バケット grammar-videos（mp4 配信用）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('grammar-videos', 'grammar-videos', true)
on conflict (id) do nothing;
