-- 009_grammar_reibun.sql
-- 助動詞例文集（拡充版・235例）をアプリに載せるためのテーブル。
-- 単一ソース grammar_reibun から (A)意味判別ドリル と (B)例文事典 を駆動する。
-- すべて公開read・追加のみ＝既存機能に完全後方互換。

-- 例文マスタ ------------------------------------------------------------
create table if not exists grammar_reibun (
  id          text primary key,                         -- 'reibun-keri-1-01'
  jodoshi     text not null,                            -- 'けり'
  meaning_key text not null,                            -- 'keri-1'（係: 選択肢/型のキー）
  meaning     text not null,                            -- '過去'（表示ラベル）
  sentence    text not null,                            -- 本文（判定対象=【】, 決め手=《》）
  translation text not null,
  source      text not null,                            -- 出典
  work_key    text,                                     -- 作品事典キー（grammar_works と共有）
  context     text,                                     -- 場面解説
  decider     text,                                     -- 決め手
  period      text,                                     -- 成立期
  confidence  text not null check (confidence in ('high','medium','low')),
  verified    boolean not null default false,
  is_quiz     boolean not null default false,           -- 出題対象（high & verified のみ）
  layer       text check (layer in ('kata','mazeru','jissen')),
  sort        int default 0,
  created_at  timestamptz default now()
);
alter table grammar_reibun enable row level security;
drop policy if exists "public_read_grammar_reibun" on grammar_reibun;
create policy "public_read_grammar_reibun" on grammar_reibun for select using (true);
create index if not exists idx_reibun_jodoshi on grammar_reibun(jodoshi);
create index if not exists idx_reibun_quiz on grammar_reibun(is_quiz);
create index if not exists idx_reibun_meaning on grammar_reibun(meaning_key);

-- 意味マスタ（選択肢セット＋「決め手の総則」）---------------------------
create table if not exists grammar_jodoshi_meanings (
  meaning_key  text primary key,                        -- 'keri-1'
  jodoshi      text not null,                           -- 'けり'
  meaning      text not null,                           -- '過去'
  decider_rule text not null,                           -- 決め手の総則（型レイヤーで提示）
  sort         int default 0
);
alter table grammar_jodoshi_meanings enable row level security;
drop policy if exists "public_read_grammar_meanings" on grammar_jodoshi_meanings;
create policy "public_read_grammar_meanings" on grammar_jodoshi_meanings for select using (true);
create index if not exists idx_meanings_jodoshi on grammar_jodoshi_meanings(jodoshi);
