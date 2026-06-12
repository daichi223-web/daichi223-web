-- ============================================================
-- 文法道場 seed: 動詞の活用（用言 Layer 1）
-- 既存 public/grammar の各 doushi-*.json の解説・例文・活用表に整合。
-- 動画は デ板「動詞の活用」.pptx → doushi-katsuyo.mp4 を想定（総論ページに付与）。
-- 適用: 007_grammar_dojo.sql の後。再実行可能。
-- ============================================================

delete from grammar_media where topic_id in
  ('doushi-katsuyo','doushi-yodan','doushi-kami-ichidan','doushi-shimo-nidan',
   'doushi-kahen','doushi-sahen','doushi-rahen');
delete from grammar_drills where topic_id in
  ('doushi-katsuyo','doushi-yodan','doushi-kami-ichidan','doushi-shimo-nidan',
   'doushi-kahen','doushi-sahen','doushi-rahen');

-- 講義動画（総論ページに付与。各型ページはドリル中心）
insert into grammar_media (topic_id, kind, storage_path, title, sec, sort) values
  ('doushi-katsuyo', 'mp4', 'doushi-katsuyo.mp4', '動詞の活用 講義（デ板）', 600, 0);

insert into grammar_drills (id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort) values
-- 動詞の活用（総論・見分け）
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

-- 四段活用
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

-- 上一段活用
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

-- 下二段活用
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

-- カ行変格活用
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

-- サ行変格活用
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

-- ラ行変格活用
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
   '「はべり」は丁寧語。「いまそかり」は尊敬語。','ラ変動詞一覧',4);
