-- ============================================================
-- 文法道場 seed: 助動詞「む」（縦通し用 1 単元）
-- 適用順: 007_grammar_dojo.sql の後。再実行可能（topic 単位で delete→insert）。
-- 動画 jodoshi-mu.mp4 はバケット grammar-videos へ別途アップロードすること。
-- ============================================================

delete from grammar_media  where topic_id = 'jodoshi-mu';
delete from grammar_drills where topic_id = 'jodoshi-mu';

-- 講義動画（デ板 PPT → mp4 化したもの）
insert into grammar_media (topic_id, kind, storage_path, title, sec, sort) values
  ('jodoshi-mu', 'mp4', 'jodoshi-mu.mp4', '助動詞「む」講義（デ板）', 540, 0);

-- ドリル 5 問
insert into grammar_drills (id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort) values
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
   '「む」は 推量・意志・勧誘・仮定・婉曲（すいかかえ）。詠嘆は含まない。', '意味の判別', 5);
