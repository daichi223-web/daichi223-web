-- ============================================================
-- お試し（ゲスト）のパスワード（2026-11-13 ユーザー指示「パスワード制にして。教員画面でパスワード設定できるように」）
-- ============================================================
-- 1行だけの表。パスワードはそのまま持たず、scrypt のハッシュと salt だけを持つ（照合は /api/teacher の guestLogin）。
-- version はパスワードを変えるたび・止めるたびに +1。ゲストの端末は入ったときの version を覚えていて、
-- 起動時に照合して食い違えば（パスワードが変わった・止めた）ゲストの扱いを外す。
-- 読み書きは service_role だけ（RLS を有効にして policy を作らない＝anon からは見えない）。

create table if not exists guest_access (
  id smallint primary key default 1,
  enabled boolean not null default false,
  pass_hash text,
  pass_salt text,
  version integer not null default 0,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint guest_access_single_row check (id = 1)
);

alter table guest_access enable row level security;

-- 最初のパスワードは「guest1」（全角で打っても同じ。照合の前に NFKC で正規化する）。
-- 値は scrypt(N=16384, r=8, p=1, 32バイト)。教員画面で変えれば上書きされる。
insert into guest_access (id, enabled, pass_hash, pass_salt, version, updated_by)
values (1, true, '4f63b442158f89524c944f91f43c66c96211b2bdd2cf4c43288b3efd1179f454', '2a3c563c095e0d4e35d4300a389b3e99', 1, 'migration-018')
on conflict (id) do nothing;
