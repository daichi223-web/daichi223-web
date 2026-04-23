-- ============================================================
-- Migrated Firestore collections: answers / candidates / overrides
-- ============================================================

-- ---------- answers ----------
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  qid text not null,
  answer_norm text not null,
  question_type text not null default 'writing' check (question_type in ('writing','selection')),
  raw jsonb not null,
  curated jsonb not null,
  manual jsonb,
  final jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_answers_qid_norm on answers(qid, answer_norm);
create index if not exists idx_answers_created_qtype on answers(created_at, question_type);
create index if not exists idx_answers_created_desc on answers(created_at desc);

-- ---------- candidates ----------
create table if not exists candidates (
  qid text not null,
  answer_norm text not null,
  freq int not null default 1,
  last_seen timestamptz not null default now(),
  band_mode text,
  proposed_role text check (proposed_role in ('accept','negative','review')),
  avg_score int check (avg_score between 0 and 100),
  sample_any text,
  updated_at timestamptz not null default now(),
  primary key (qid, answer_norm)
);

create index if not exists idx_candidates_role_freq on candidates(proposed_role, freq desc);
create index if not exists idx_candidates_qid_role_freq on candidates(qid, proposed_role, freq desc);

-- ---------- overrides (current rule) ----------
create table if not exists overrides (
  qid text not null,
  answer_norm text not null,
  label text not null check (label in ('OK','NG','ABSTAIN')),
  active boolean not null default true,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (qid, answer_norm)
);

-- ---------- override_audit (history) ----------
create table if not exists override_audit (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  action text not null check (action in ('override_apply','override_cancel','teacher_override','revert')),
  actor text,
  answer_id uuid,
  qid text,
  answer_norm text,
  label text,
  reason text,
  affected int,
  final jsonb
);

create index if not exists idx_override_audit_ts on override_audit(ts desc);

-- ============================================================
-- Row Level Security
-- Student-facing tables use anon key; staff-only tables use service role.
-- We block anon writes on everything except word_stats/srs_state (already
-- permissive from 001 migration). answers/candidates/overrides are only
-- touched through server-side API using service role, so RLS is strict.
-- ============================================================

alter table answers enable row level security;
alter table candidates enable row level security;
alter table overrides enable row level security;
alter table override_audit enable row level security;

-- no policies on these tables -> anon key blocked; service role bypasses RLS

-- ============================================================
-- Helper RPCs
-- ============================================================

-- increment freq and update aggregated stats in one call (used by aggregateCandidates)
create or replace function upsert_candidate(
  p_qid text,
  p_answer_norm text,
  p_freq int,
  p_last_seen timestamptz,
  p_band_mode text,
  p_proposed_role text,
  p_avg_score int,
  p_sample_any text
) returns void language plpgsql as $$
begin
  insert into candidates (qid, answer_norm, freq, last_seen, band_mode, proposed_role, avg_score, sample_any, updated_at)
  values (p_qid, p_answer_norm, p_freq, p_last_seen, p_band_mode, p_proposed_role, p_avg_score, p_sample_any, now())
  on conflict (qid, answer_norm) do update set
    freq = excluded.freq,
    last_seen = excluded.last_seen,
    band_mode = excluded.band_mode,
    proposed_role = excluded.proposed_role,
    avg_score = excluded.avg_score,
    sample_any = excluded.sample_any,
    updated_at = now();
end;
$$;
