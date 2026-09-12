-- 013_profiles: 生徒プロフィール（学校メール＋学年・組・番号）を暗号化して保存する。
--
-- 方針（health-check と同じ）:
--   * 個人情報は AES-GCM でサーバ側（/api/profile）暗号化し、平文を DB に置かない
--   * 照合用に sha256(lower(email)) だけ平文で持つ（email_hash）
--   * cohort（学校＝教材公開の単位）は個人情報ではないので平文
--   * RLS を有効にしポリシーを作らない＝anon/authenticated からは一切読めない・書けない。
--     読み書きは service_role を持つ /api/profile だけ
--
-- 適用: supabase db query -f supabase/migrations/013_profiles.sql（db push は使わない）

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email_hash   text not null unique,                 -- sha256(lower(email))
  profile_enc  text not null,                        -- base64(iv(12) + AES-GCM(JSON{email,grade,class,number}))
  cohort       text not null default 'default',     -- 学校（?cohort= で配った値）
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_profiles_cohort on profiles(cohort);

alter table profiles enable row level security;
-- ポリシーは意図的に作らない（service_role のみ）

revoke all on table profiles from anon, authenticated;
