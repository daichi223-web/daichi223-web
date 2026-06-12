-- ============================================================
-- 文法道場 seed: 形容詞・形容動詞の活用（用言 Layer 1）
-- 既存 keiyoshi-katsuyo / keiyoshi-ku / keiyoshi-shiku.json に整合。
-- 形容動詞（ナリ/タリ）は keiyoshi-katsuyo の宣言スコープに含めて出題。
-- 動画は デ板形容詞形容動詞.pptx → keiyoshi-katsuyo.mp4 を想定。
-- 適用: 007_grammar_dojo.sql の後。再実行可能。
-- ============================================================

delete from grammar_media where topic_id in
  ('keiyoshi-katsuyo','keiyoshi-ku','keiyoshi-shiku');
delete from grammar_drills where topic_id in
  ('keiyoshi-katsuyo','keiyoshi-ku','keiyoshi-shiku');

insert into grammar_media (topic_id, kind, storage_path, title, sec, sort) values
  ('keiyoshi-katsuyo', 'mp4', 'keiyoshi-katsuyo.mp4', '形容詞・形容動詞の活用 講義（デ板）', 540, 0);

insert into grammar_drills (id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort) values
-- 形容詞・形容動詞（総論／ナリ・タリ）
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

-- ク活用
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

-- シク活用
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
