-- ============================================================
-- 文法道場 一括適用スクリプト（本番 Supabase の SQL Editor に貼り付けて1回実行）
--
-- 内容:
--   1. 007_grammar_dojo.sql の DDL（3テーブル + RLS + Storageバケット）
--   2. 既存ドリル seed（doushi 7 / jodoshi-mu 1 / keiyoshi 3 = 計11トピック）
--
-- 方針: 当面テキスト運用（Step C-a）。
--   → grammar_media（講義動画）は seed しない。mp4 実体が無いため、
--     VideoEmbed は media が無いと自動的に非表示になり「要点＋ドリル」構成になる。
--   → 動画を作ったら別途 grammar_media を seed すればよい。
--
-- 再実行可能（CREATE は IF NOT EXISTS、ドリルは topic 単位で delete→insert）。
-- ============================================================

-- ============================================================
-- PART 1: スキーマ（007_grammar_dojo.sql 相当）
-- ============================================================

create table if not exists grammar_media (
  id uuid default gen_random_uuid() primary key,
  topic_id text not null,
  kind text not null default 'mp4',
  storage_path text not null,
  title text not null,
  sec int,
  poster_path text,
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_grammar_media_topic on grammar_media (topic_id);

create table if not exists grammar_drills (
  id text primary key,
  topic_id text not null,
  kind text not null,
  prompt text not null,
  context text,
  choices jsonb,
  answer jsonb not null,
  explanation text not null,
  ref_heading text,
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_grammar_drills_topic on grammar_drills (topic_id);

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

alter table grammar_media  enable row level security;
alter table grammar_drills enable row level security;

drop policy if exists "public_read_grammar_media"  on grammar_media;
drop policy if exists "public_read_grammar_drills" on grammar_drills;
create policy "public_read_grammar_media"  on grammar_media  for select using (true);
create policy "public_read_grammar_drills" on grammar_drills for select using (true);

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

insert into storage.buckets (id, name, public)
values ('grammar-videos', 'grammar-videos', true)
on conflict (id) do nothing;

-- ============================================================
-- PART 2: ドリル seed（動画は除外＝テキスト運用）
-- ============================================================

delete from grammar_drills where topic_id in
  ('doushi-katsuyo','doushi-yodan','doushi-kami-ichidan','doushi-shimo-nidan',
   'doushi-kahen','doushi-sahen','doushi-rahen',
   'jodoshi-mu',
   'keiyoshi-katsuyo','keiyoshi-ku','keiyoshi-shiku');

insert into grammar_drills (id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort) values
-- ===== 動詞の活用（総論・見分け） =====
  ('doushi-katsuyo-01','doushi-katsuyo','shikibetsu','古文の動詞の活用型は全部で何種類？', null,
   '["6種類","7種類","8種類","9種類"]'::jsonb, '"9種類"'::jsonb,
   '四段・上二段・下二段・上一段・下一段・カ変・サ変・ナ変・ラ変 の9種類。','活用の種類',1),
  ('doushi-katsuyo-02','doushi-katsuyo','katsuyo-type','「書く」に「ず」を付けると「書か（ア段）」。活用型は？', null,
   '["四段活用","上二段活用","下二段活用","上一段活用"]'::jsonb, '"四段活用"'::jsonb,
   '「ず」を付けて未然形がア段＝四段活用。','活用の見分け方',2),
  ('doushi-katsuyo-03','doushi-katsuyo','katsuyo-type','「起く」に「ず」を付けると「起き（イ段）」。活用型は？', null,
   '["四段活用","上二段活用","下二段活用","カ変"]'::jsonb, '"上二段活用"'::jsonb,
   '未然形がイ段＝上二段活用。','活用の見分け方',3),
  ('doushi-katsuyo-04','doushi-katsuyo','katsuyo-type','「受く」に「ず」を付けると「受け（エ段）」。活用型は？', null,
   '["四段活用","上二段活用","下二段活用","下一段活用"]'::jsonb, '"下二段活用"'::jsonb,
   '未然形がエ段＝下二段活用。','活用の見分け方',4),
  ('doushi-katsuyo-05','doushi-katsuyo','katsuyo-type','終止形と連体形が同じ形になる活用型はどれ？', null,
   '["四段活用","下二段活用","上二段活用","サ変"]'::jsonb, '"四段活用"'::jsonb,
   '四段は終止＝連体（書く＝書く）。二段系やサ変は終止≠連体。','活用の見分け方',5),

-- ===== 四段活用 =====
  ('doushi-yodan-01','doushi-yodan','katsuyo-type','四段活用の未然形は何段の音になる？', null,
   '["ア段","イ段","ウ段","エ段"]'::jsonb, '"ア段"'::jsonb,
   '四段の未然形はア段（書か・思は）。','見分け方',1),
  ('doushi-yodan-02','doushi-yodan','katsuyo-fill','「書く」（カ行四段）の已然形はどれ？', null,
   '["書か","書き","書く","書け"]'::jsonb, '"書け"'::jsonb,
   '四段の已然形はエ段＝書け。','活用表',2),
  ('doushi-yodan-03','doushi-yodan','katsuyo-fill','「思ふ」に「ず」を付けた未然形はどれ？', null,
   '["思は","思ひ","思へ","思ふ"]'::jsonb, '"思は"'::jsonb,
   'ハ行四段の未然形はア段＝思は。','見分け方',3),
  ('doushi-yodan-04','doushi-yodan','katsuyo-type','次のうち四段活用の動詞はどれ？', null,
   '["書く","受く","見る","来"]'::jsonb, '"書く"'::jsonb,
   '書く＝カ行四段。受く＝下二段、見る＝上一段、来＝カ変。','活用の種類',4),
  ('doushi-yodan-05','doushi-yodan','imi','傍線部「言ひ」の活用形は？','…と言ひけるを',
   '["未然形","連用形","終止形","連体形"]'::jsonb, '"連用形"'::jsonb,
   '「言ふ」（ハ行四段）の連用形。助動詞「けり」に接続するため連用形。','活用表',5),

-- ===== 上一段活用 =====
  ('doushi-kami-ichidan-01','doushi-kami-ichidan','shikibetsu','上一段動詞を覚える語呂合わせはどれ？', null,
   '["ひいきにみゐる","すいかかえ","いろはにほへと","たちつてと"]'::jsonb, '"ひいきにみゐる"'::jsonb,
   '干る・射る・着る・似る・見る・居る（率る）＝「ひいきにみゐる」。','暗記すべき上一段動詞',1),
  ('doushi-kami-ichidan-02','doushi-kami-ichidan','katsuyo-type','「見る」に「ず」を付けると「見（み・イ段1音）」。活用型は？', null,
   '["上一段活用","上二段活用","四段活用","下二段活用"]'::jsonb, '"上一段活用"'::jsonb,
   '未然形がイ段1音＝上一段。上二段は未然形が2音以上（起き等）。','見分け方',2),
  ('doushi-kami-ichidan-03','doushi-kami-ichidan','shikibetsu','次のうち上一段活用の動詞はどれ？', null,
   '["着る","起く","受く","書く"]'::jsonb, '"着る"'::jsonb,
   '着る＝カ行上一段（ひいきにみゐるの「き」）。起く＝上二段、受く＝下二段。','暗記すべき上一段動詞',3),
  ('doushi-kami-ichidan-04','doushi-kami-ichidan','katsuyo-fill','「見る」（マ行上一段）の命令形はどれ？', null,
   '["見よ","見ろ","見れ","見"]'::jsonb, '"見よ"'::jsonb,
   '上一段の命令形は「〜よ」＝見よ。','活用表',4),
  ('doushi-kami-ichidan-05','doushi-kami-ichidan','shikibetsu','現代語の「起きる」は古文では何活用？', null,
   '["上二段活用","上一段活用","四段活用","下二段活用"]'::jsonb, '"上二段活用"'::jsonb,
   '現代語の「起きる」は古文では上一段ではなく上二段活用。','暗記すべき上一段動詞',5),

-- ===== 下二段活用 =====
  ('doushi-shimo-nidan-01','doushi-shimo-nidan','katsuyo-type','「受く」に「ず」を付けると「受け（エ段）」。活用型は？', null,
   '["下二段活用","上二段活用","四段活用","下一段活用"]'::jsonb, '"下二段活用"'::jsonb,
   '未然形がエ段＝下二段活用。','見分け方',1),
  ('doushi-shimo-nidan-02','doushi-shimo-nidan','katsuyo-fill','下二段「受く」の連体形はどれ？', null,
   '["受く","受くる","受け","受くれ"]'::jsonb, '"受くる"'::jsonb,
   '下二段の連体形はウル＝受くる。','活用表',2),
  ('doushi-shimo-nidan-03','doushi-shimo-nidan','shikibetsu','四段活用と下二段活用を見分けるポイントは？', null,
   '["終止形と連体形が異なる","未然形がア段になる","命令形がない","語幹がない"]'::jsonb, '"終止形と連体形が異なる"'::jsonb,
   '下二段は終止「受く」≠連体「受くる」。四段は終止＝連体。','見分け方',3),
  ('doushi-shimo-nidan-04','doushi-shimo-nidan','katsuyo-fill','下二段の活用語尾（え・え・う・うる・うれ・えよ）。已然形は？', null,
   '["う","うる","うれ","えよ"]'::jsonb, '"うれ"'::jsonb,
   '下二段の已然形はウレ。','活用表',4),
  ('doushi-shimo-nidan-05','doushi-shimo-nidan','shikibetsu','次のうち下二段活用の動詞はどれ？', null,
   '["いらふ（答ふ）","言ふ","見る","来"]'::jsonb, '"いらふ（答ふ）"'::jsonb,
   'いらふ＝ハ行下二段（いらへ・ず）。言ふ＝ハ行四段。','代表的な下二段動詞',5),

-- ===== カ行変格活用 =====
  ('doushi-kahen-01','doushi-kahen','shikibetsu','カ行変格活用の動詞はどれ？', null,
   '["来（く）","す","あり","死ぬ"]'::jsonb, '"来（く）"'::jsonb,
   'カ変は「来（く）」一語のみ。','カ行変格活用とは',1),
  ('doushi-kahen-02','doushi-kahen','katsuyo-fill','「来」の活用（こ・き・く・くる・くれ・こよ）。連体形は？', null,
   '["く","くる","こ","くれ"]'::jsonb, '"くる"'::jsonb,
   'カ変の連体形は「くる」。','活用表',2),
  ('doushi-kahen-03','doushi-kahen','katsuyo-fill','「来」の未然形はどれ？', null,
   '["こ","き","く","くる"]'::jsonb, '"こ"'::jsonb,
   'カ変の未然形は「こ」。','活用表',3),
  ('doushi-kahen-04','doushi-kahen','shikibetsu','複合動詞「出で来（いでく）」の活用型は？', null,
   '["カ変","四段","サ変","下二段"]'::jsonb, '"カ変"'::jsonb,
   '「来」を含む複合動詞もカ変。','複合動詞',4),

-- ===== サ行変格活用 =====
  ('doushi-sahen-01','doushi-sahen','shikibetsu','サ行変格活用の動詞（基本2語）はどれ？', null,
   '["す・おはす","来・あり","見る・着る","死ぬ・往ぬ"]'::jsonb, '"す・おはす"'::jsonb,
   'サ変は「す」「おはす」。','サ行変格活用とは',1),
  ('doushi-sahen-02','doushi-sahen','katsuyo-fill','「す」の活用（せ・し・す・する・すれ・せよ）。已然形は？', null,
   '["する","すれ","せよ","し"]'::jsonb, '"すれ"'::jsonb,
   'サ変の已然形は「すれ」。','活用表',2),
  ('doushi-sahen-03','doushi-sahen','shikibetsu','「奏す」「念ず」などの活用型は？', null,
   '["サ変","四段","カ変","下二段"]'::jsonb, '"サ変"'::jsonb,
   '「〜す」を含む複合動詞はすべてサ変。','「す」と複合動詞',3),
  ('doushi-sahen-04','doushi-sahen','imi','傍線部「せ」の活用形は？','ぼたもちをせむ',
   '["未然形","連用形","終止形","連体形"]'::jsonb, '"未然形"'::jsonb,
   '「す」（サ変）の未然形「せ」。「む」に接続するため未然形。','活用表',4),

-- ===== ラ行変格活用 =====
  ('doushi-rahen-01','doushi-rahen','shikibetsu','ラ行変格活用の4語はどれ？', null,
   '["あり・をり・はべり・いまそかり","す・おはす","来・死ぬ","見る・着る"]'::jsonb, '"あり・をり・はべり・いまそかり"'::jsonb,
   'ラ変は存在を表す4語。','ラ変動詞一覧',1),
  ('doushi-rahen-02','doushi-rahen','katsuyo-type','ラ変の最大の特徴はどれ？', null,
   '["終止形が「り」で終わる","未然形がない","命令形が2つある","語幹がない"]'::jsonb, '"終止形が「り」で終わる"'::jsonb,
   '他の動詞はウ段で終止するが、ラ変は終止形が「り」（イ段）。助動詞接続の判断で重要。','活用表',2),
  ('doushi-rahen-03','doushi-rahen','katsuyo-fill','「あり」の活用（ら・り・り・る・れ・れ）。連体形は？', null,
   '["り","る","れ","ら"]'::jsonb, '"る"'::jsonb,
   'ラ変の連体形は「る」（あ＋る）。','活用表',3),
  ('doushi-rahen-04','doushi-rahen','shikibetsu','「はべり」の種類・意味は？', null,
   '["丁寧語「おります」","尊敬語「いらっしゃる」","打消の助動詞","完了の助動詞"]'::jsonb, '"丁寧語「おります」"'::jsonb,
   '「はべり」は丁寧語。「いまそかり」は尊敬語。','ラ変動詞一覧',4),

-- ===== 助動詞「む」 =====
  ('jodoshi-mu-01', 'jodoshi-mu', 'setsuzoku',
   '助動詞「む」は何形に接続する？', null,
   '["未然形","連用形","終止形","連体形"]'::jsonb, '"未然形"'::jsonb,
   '「む」は未然形接続。例:「行か＋む」「思は＋む」。', '接続と活用', 1),
  ('jodoshi-mu-02', 'jodoshi-mu', 'imi',
   '傍線部「む」の意味として最も適切なものは？',
   '（児が心の中で）「いま一声呼ばれて、いらへむ」と思ひて、',
   '["推量","意志","勧誘","婉曲"]'::jsonb, '"意志"'::jsonb,
   '主語が一人称（児）の動作なので意志「〜しよう」。「すいかかえ」で判別。', '意味の判別', 2),
  ('jodoshi-mu-03', 'jodoshi-mu', 'imi',
   '傍線部「む」の意味として最も適切なものは？',
   '法師ばら「いざ、ぼたもちを作らむ」と言ひて、',
   '["推量","意志","勧誘","婉曲"]'::jsonb, '"勧誘"'::jsonb,
   '「いざ〜む」と相手に呼びかけ誘う形＝勧誘「〜しよう・〜しませんか」。', '意味の判別', 3),
  ('jodoshi-mu-04', 'jodoshi-mu', 'katsuyo-fill',
   '係助詞「こそ」を受けるとき、文末の「む」はどの形になる？', null,
   '["終止形「む」","連体形「む」","已然形「め」","命令形「め」"]'::jsonb, '"已然形「め」"'::jsonb,
   '係り結び：「こそ」の結びは已然形。「む」の已然形は「め」。', '接続と活用', 4),
  ('jodoshi-mu-05', 'jodoshi-mu', 'shikibetsu',
   '「む」の意味（すいかかえ）に含まれないものはどれ？', null,
   '["推量","意志","詠嘆","婉曲"]'::jsonb, '"詠嘆"'::jsonb,
   '「む」は 推量・意志・勧誘・仮定・婉曲（すいかかえ）。詠嘆は含まない。', '意味の判別', 5),

-- ===== 形容詞・形容動詞（総論／ナリ・タリ） =====
  ('keiyoshi-katsuyo-01','keiyoshi-katsuyo','shikibetsu','古文の形容詞の活用は何種類？', null,
   '["2種類","3種類","4種類","5種類"]'::jsonb, '"2種類"'::jsonb,
   '形容詞はク活用・シク活用の2種類。','形容詞の種類',1),
  ('keiyoshi-katsuyo-02','keiyoshi-katsuyo','katsuyo-type','形容動詞「あはれなり」の活用型は？', null,
   '["ナリ活用","タリ活用","ク活用","シク活用"]'::jsonb, '"ナリ活用"'::jsonb,
   '「〜なり」で終わる形容動詞はナリ活用。','形容詞の種類',2),
  ('keiyoshi-katsuyo-03','keiyoshi-katsuyo','katsuyo-type','形容動詞「堂々たり」の活用型は？', null,
   '["タリ活用","ナリ活用","ラ変","サ変"]'::jsonb, '"タリ活用"'::jsonb,
   '「〜たり」で終わる漢文調の形容動詞はタリ活用。','形容詞の種類',3),
  ('keiyoshi-katsuyo-04','keiyoshi-katsuyo','katsuyo-fill','ナリ活用（なら・なり/に・なり・なる・なれ・なれ）。連体形は？', null,
   '["なる","なり","なれ","なら"]'::jsonb, '"なる"'::jsonb,
   'ナリ活用の連体形は「なる」。','形容詞の種類',4),
  ('keiyoshi-katsuyo-05','keiyoshi-katsuyo','katsuyo-type','「をかし」の活用型は？', null,
   '["シク活用","ク活用","ナリ活用","タリ活用"]'::jsonb, '"シク活用"'::jsonb,
   '「をかし」は終止形が「〜し」＝シク活用（心情・情趣語）。','形容詞の種類',5),

-- ===== ク活用 =====
  ('keiyoshi-ku-01','keiyoshi-ku','katsuyo-type','形容詞「よし」の活用型は？', null,
   '["ク活用","シク活用","ナリ活用","タリ活用"]'::jsonb, '"ク活用"'::jsonb,
   '「よし」はク活用（連用形が「よく」）。','ク活用とは',1),
  ('keiyoshi-ku-02','keiyoshi-ku','katsuyo-fill','ク活用の本活用（く・く・し・き・けれ・○）。連体形は？', null,
   '["く","し","き","けれ"]'::jsonb, '"き"'::jsonb,
   'ク活用本活用の連体形は「き」。','活用表',2),
  ('keiyoshi-ku-03','keiyoshi-ku','shikibetsu','形容詞に助動詞が接続するとき使う活用はどれ？', null,
   '["カリ活用（補助活用）","本活用の終止形","語幹のみ","已然形"]'::jsonb, '"カリ活用（補助活用）"'::jsonb,
   '助動詞接続時はカリ活用（から・かり・かる・かれ）を使う。','活用表',3),
  ('keiyoshi-ku-04','keiyoshi-ku','shikibetsu','次のうちク活用の形容詞はどれ？', null,
   '["よし","うれし","かなし","をかし"]'::jsonb, '"よし"'::jsonb,
   '「よし」はク活用。うれし・かなし・をかしはシク活用。','代表的なク活用形容詞',4),
  ('keiyoshi-ku-05','keiyoshi-ku','imi','傍線部「わろく」の活用形は？','わろく書きける',
   '["連用形","未然形","終止形","連体形"]'::jsonb, '"連用形"'::jsonb,
   '「わろし」（ク活用）の連用形。動詞「書く」に接続するため連用形。','活用表',5),

-- ===== シク活用 =====
  ('keiyoshi-shiku-01','keiyoshi-shiku','katsuyo-type','「うれし」の活用型は？', null,
   '["シク活用","ク活用","ナリ活用","タリ活用"]'::jsonb, '"シク活用"'::jsonb,
   '「うれし」はシク活用（連用形が「うれしく」）。','シク活用とは',1),
  ('keiyoshi-shiku-02','keiyoshi-shiku','shikibetsu','ク活用とシク活用の見分け方として正しいのは？', null,
   '["「〜しく」と言えるか","未然形がア段か","命令形があるか","語幹がないか"]'::jsonb, '"「〜しく」と言えるか"'::jsonb,
   '連用形に「しく」が現れればシク活用、「く」だけならク活用。','シク活用とは',2),
  ('keiyoshi-shiku-03','keiyoshi-shiku','katsuyo-fill','シク活用の本活用（しく・しく・し・しき・しけれ・○）。已然形は？', null,
   '["しき","しけれ","しく","しかれ"]'::jsonb, '"しけれ"'::jsonb,
   'シク活用本活用の已然形は「しけれ」。','活用表',3),
  ('keiyoshi-shiku-04','keiyoshi-shiku','shikibetsu','次のうちシク活用の形容詞はどれ？', null,
   '["かなし","高し","白し","多し"]'::jsonb, '"かなし"'::jsonb,
   '心情語「かなし」はシク活用。高し・白し・多しはク活用。','代表的なシク活用形容詞',4),
  ('keiyoshi-shiku-05','keiyoshi-shiku','imi','傍線部「あさましき」の活用形は？','あさましきことかな',
   '["連体形","連用形","終止形","已然形"]'::jsonb, '"連体形"'::jsonb,
   '「あさまし」（シク活用）の連体形。体言「こと」に接続するため連体形。','活用表',5);

-- ============================================================
-- 確認用（任意。実行すると現在のドリル数が出る）
--   select topic_id, count(*) from grammar_drills group by topic_id order by topic_id;
-- ============================================================
