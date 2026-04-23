-- ============================================================
-- 教材公開制御: デフォルト非公開、teacher が明示公開した slug だけ
-- 生徒に表示される
-- ============================================================

create table if not exists text_publications (
  slug text primary key,
  published boolean not null default false,
  title text,
  note text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_text_publications_published
  on text_publications (published)
  where published = true;

alter table text_publications enable row level security;

-- 公開中slug一覧は anon で読み取り可 (生徒画面で使う)
create policy "Anyone can read published rows"
  on text_publications for select
  using (published = true);

-- 書き込みは service_role のみ (API経由でstaff tokenを検証後に書く)
-- → anon向けの insert/update ポリシーは作らない
