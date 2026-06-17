-- 010_grammar_reibun_cues.sql
-- 決め手の型（後接/呼応/形/主語/文脈）と、本文中の手がかりスパン（型・理由つき）を追加。
-- すべて追加カラム＝後方互換。

alter table grammar_reibun            add column if not exists decider_type text;
alter table grammar_reibun            add column if not exists cues         jsonb;  -- [{text,type,note}]
alter table grammar_jodoshi_meanings  add column if not exists decider_type text;
