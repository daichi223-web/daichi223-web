# トークン整合性 修復履歴

## 完了状態 (2026-04-28)

**全 105 教材の構造健全性確認済み** (token concat ≡ originalText / start/end 整合)。

## 修復履歴

| ステップ | コミット | 件数 | スクリプト |
|---|---|---|---|
| 個別修復 | `0155862` | 3 (ちごのそらね/絵仏師良秀/芥川) | `fix-token-alignment.cjs` (手動 pre-fix 込み) |
| バッチ自動修復 (1次) | `bd250e7` | 25 | `fix-token-alignment.cjs` |
| バッチ再構築 (2次) | (このコミット) | 77 | `rebuild-from-tokens.cjs` |
| **合計** | | **105** | |

## アプローチ

### `fix-token-alignment.cjs`
tokens を文に再分配。token 連結 ≒ originalText 連結 の場合に有効。

### `rebuild-from-tokens.cjs`
existing originalText を fullText 中の anchor として、各 sentence の originalText を tokens に合わせて再生成。
sentence 数・ID・modernTranslation を保持するため reading guide 整合を維持。

## 修復済み教材リスト (rebuild-from-tokens.cjs によるもの 77 件)

### orphan_tail_only だったもの (32 件)
1689245ecd とみの文 / 1a7c595329 賀茂の祭りを見物する翁 / 249a2e97df 廃院の怪 / 2e45c61a81 万葉の歌 / 326aeccd6c 岩鼻や / 364673ceb1 車争ひ / 431b9a342b 落窪の君 / 467249bc39 萩のうは露 / 4a48018f8b 隠岐配流 / 4c5d7950dd 髪の香 / 61ad02e1df 雲林院にて / 66a65f25ad 連歌 / 815a43f9e7 鹿の声 / 84bdc39850 九月二十日のころ / 956e5deab8 刑部卿敦兼の北の方 / 9e0911918f 鷲にさらわれた赤子 / a2a8093ed5 土佐日記（帰京） / aa8770b881 文ことばなめき人こそ / b1d89ce45e 近世の句 / b34f00e739 菅公配流 / c185d4aa03 里にまかでたるに / d073576d89 千早城の戦い / dd1c1e0d14 筑紫に、なにがしの押領使など / e084e77e15 【参考】日本武尊の死（日本書紀） / f0740d6350 王朝の歌 / f78ab86be9 心づくしの秋 / f7aee682ff 花山院の出家 / faa890f809 中世の歌 / fb6b5ebd33 忠度 / fd3012c216 若紫の君 / fe466e5a11 霧の中のかいま見 / ff4fa387b4 倭建命

### orphan_tail+mismatch だったもの (45 件)
0213bea23e 嘆きつつ / 03a2e8e8af 大事を思ひ立たむ人は / 08ac4e0173 南の院の競射 / 0a93657296 母子の別離 / 0c82b558fc 不易流行 / 0f5e09d145 世に語り伝ふること / 0fa06efdfe 夢よりもはかなき世の中を / 18019954e6 二月つごもりごろに / 1811f6888e 野分のまたの日こそ / 1af601c3ea 東下り（都鳥） / 30e5ed715f 袴垂、保昌にあふこと / 3b84921e74 肝試し / 3cd78122cb つひにゆく / 44bbd6ede4 姨捨 / 4c8f90856b 忠度の都落ち / 51b3d11f10 愛児さと / 58646d5f6d 道綱鷹を放つ / 5ce9ba8c46 すさまじきもの / 622041c1e6 久しく隔たりて会ひたる人の / 63601d9bac 忍び扇の長歌 / 693237f7b2 行く春を / 6f8c66024b 中納言参りたまひて / 83e7b6a341 飽かぬ別れ / 8e08e3212f 狩りの使ひ / 9662ce1347 土佐日記（かしらの雪） / a957893493 千里に旅立ちて / ab2e5ff73a 行く蛍 / b621d6ca53 土佐日記（門出） / b6f9644033 小野の雪 / bf90ae8299 北寿老仙をいたむ / bfa5b23cf2 東下り（宇津の山） / cbf3db0edb 能登殿の最期 / cd99eca887 渚の院 / cec7f3b46f 光源氏の誕生 / d1e41d3f09 これも仁和寺の法師 / da30d34a6c 暁の雪 / da80b8aade 世の中になほいと心憂きものは / df401947a0 浅茅が宿 / e1e23236de 道長、栄華への第一歩 / e245dd3617 東下り（八橋） / e9d989b44a 春は、あけぼの / f1c4b82dd3 公任、三船の誉れ / f84b5ac5c5 月やあらぬ / f9c215dd74 初冠 / ff9c2346eb 上にさぶらふ御猫は

## 注意点

- rebuild-from-tokens によって各 sentence の `originalText` が tokens に揃って**拡張**された。元々短すぎた originalText (例: 和歌部分のみ等) は周囲の散文も含む形に展開されている。
- modernTranslation は sentence 単位で保持。教材によっては既存訳と新しい originalText がカバーする本文範囲がズレている可能性あり。教材レビュー時に再翻訳推奨。
- アンカーが tokens に見つからない sentence (例: 出典「（第八四段）」「（巻第三）」など) は元の originalText を維持し filler token を補填。
