-- ============================================================
-- 小テスト範囲: 教員が「今週ここ」を1回設定すると、生徒のホーム最上段に出る
-- ============================================================
-- 生徒は範囲を自分で指定できる（それは残す）。この表は「指定の手間を消す」ためのもの。
-- 利用実態として出題は小テスト範囲に張り付くので、来た時に迷わせないことを狙う。
--
-- cohort ごとに1件（= 今の範囲）。過去分は保持しない（履歴が要るなら別表）。
-- cohort = 'default' は全員向け。生徒は (自分の cohort) を優先し、無ければ default。

create table if not exists quiz_ranges (
  cohort text primary key default 'default',
  label text,                        -- 例: 「金曜の小テスト」
  range_from integer not null,
  range_to integer not null,
  due_date date,                     -- テスト実施日（あれば「あとN日」を出す）
  note text,
  active boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint quiz_ranges_range_valid check (range_from >= 1 and range_to >= range_from)
);

alter table quiz_ranges enable row level security;

-- 有効な範囲は anon で読める（生徒ホームで使う）
drop policy if exists "Anyone can read active quiz ranges" on quiz_ranges;
create policy "Anyone can read active quiz ranges"
  on quiz_ranges for select
  using (active = true);

-- 書き込みは service_role のみ（/api/teacher?action=setQuizRange 経由）
