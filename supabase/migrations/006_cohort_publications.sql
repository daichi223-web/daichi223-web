-- ============================================================
-- text_publications を cohort 別公開対応に拡張
-- ============================================================
-- 学年・学校・クラスごとに別々の教材セットを公開できるよう、
-- 主キーを (slug) → (slug, cohort) の複合キーにする。
--
-- cohort = 'default' は「全員に共通公開」のメタ cohort。
-- 生徒側は (cohort = 自分のコホート) UNION (cohort = 'default') で
-- 公開教材を取得する。
--
-- 既存データ (cohort 列無し) は default cohort に属するように
-- 列追加時のデフォルト値で自動移行される。

alter table text_publications
  add column if not exists cohort text not null default 'default';

-- 主キー差し替え (slug 単独 → (slug, cohort) 複合)
alter table text_publications drop constraint if exists text_publications_pkey;
alter table text_publications add constraint text_publications_pkey primary key (slug, cohort);

-- 公開状態のインデックス (cohort スコープ込み)
drop index if exists idx_text_publications_published;
create index if not exists idx_text_publications_published_cohort
  on text_publications (cohort, published)
  where published = true;

-- 既存 RLS policy「Anyone can read published rows」はそのまま有効
-- (cohort カラムには触れず、published=true 行を全て読み取り可)
-- → 生徒側で cohort フィルタを行う前提。 cohort 名は秘匿性が低いことを許容。
