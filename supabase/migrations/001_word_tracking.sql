-- ============================================================
-- Word Tracking & SRS Schema for kobun-tan
-- ============================================================

-- 1. word_stats: per-user, per-word correct/incorrect tracking
create table word_stats (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,          -- anonymous ID (anonId from localStorage) or auth user ID
  qid text not null,              -- e.g., "1-1"
  correct int default 0,
  incorrect int default 0,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id, qid)
);

-- 2. srs_state: Leitner box state for spaced repetition
create table srs_state (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  qid text not null,
  box int default 1 check (box between 1 and 5),  -- Leitner box 1-5
  next_review timestamptz default now(),
  last_review timestamptz,
  created_at timestamptz default now(),
  unique(user_id, qid)
);

-- ============================================================
-- Indexes for common queries
-- ============================================================

-- Fast lookup by user for word_stats
create index idx_word_stats_user_id on word_stats (user_id);

-- Fast lookup by user + qid for word_stats
create index idx_word_stats_user_qid on word_stats (user_id, qid);

-- Fast lookup by user for srs_state
create index idx_srs_state_user_id on srs_state (user_id);

-- Due words query: user + next_review
create index idx_srs_state_user_next_review on srs_state (user_id, next_review);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Enable RLS on both tables
alter table word_stats enable row level security;
alter table srs_state enable row level security;

-- word_stats policies
-- Note: For anonymous users, we pass user_id as a request header or use
-- Supabase's anon key with a custom claim. Since we're using anonymous
-- IDs (not Supabase Auth), we use a service-level policy that checks
-- the user_id column against the value provided in the request.
-- In practice, with the anon key, we allow all operations but filter
-- by user_id in the application layer. For extra security, we can use
-- Supabase's request headers or RPC functions.

-- Policy: Users can SELECT their own rows
create policy "Users can read own word_stats"
  on word_stats for select
  using (true);

-- Policy: Users can INSERT their own rows
create policy "Users can insert own word_stats"
  on word_stats for insert
  with check (true);

-- Policy: Users can UPDATE their own rows
create policy "Users can update own word_stats"
  on word_stats for update
  using (true);

-- srs_state policies
create policy "Users can read own srs_state"
  on srs_state for select
  using (true);

create policy "Users can insert own srs_state"
  on srs_state for insert
  with check (true);

create policy "Users can update own srs_state"
  on srs_state for update
  using (true);
