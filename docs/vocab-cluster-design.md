# Phase C 弁別クラスター設計（2026-07-03）

> 上位設計は `vocab-overhaul-design.md` のL2。文法道場の grammar_drills / DrillSession を**そのまま**流用し、
> topic_id `vocab-*` を増やす。作問1問の品質基準は `grammar-drill-design.md`（v2）に従う。

## 原則

- **例文は捏造しない**。出典は kobunQ.v2.json / public/example-bank/（B2で検証済み）から**そのまま**引く
- **誤答肢が本体**。①現代語の罠（modern_traps.v2）②同一語の別 sense ③近接語の意味 — の3種から構成。
  旧 vocab-kokon のような「毎回同じ埋め草肢」は禁止
- 解説は B1 の decider（手がかり＋判別1行）を軸に、誤答時に効く形で書く
- カテゴリは「識別」、layer 3。topic メタ（public/grammar/vocab-*.json）を各 topic に用意

## クラスター一覧（v1・7 topic 約85問）

| topic_id | 章 | 対決させるもの | 問数 | 担当 |
|---|---|---|---|---|
| vocab-kokon | 古今異義語①（v2化） | 古文の意味 ⇔ 現代語の罠（基本12語） | 12 | エージェント |
| vocab-kokon-2 | 古今異義語② | B1新規trap語の最重要14語 | 14 | エージェント |
| vocab-shiten | 視点で反転する語 | 見る側⇔見られる側（かたはらいたし・まばゆし・こころぐるし・いとほし・はづかし・つつまし） | 10 | 本体 |
| vocab-dan | 段で意味が変わる語 | 四段⇔下二段（たまふ・かづく・たのむ） | 10 | 本体 |
| vocab-kinsetsu | 似た者どうし | 近接語ペア（をかし/あはれ、なつかし/ゆかし、つれづれ/つれなし、やすらふ/ためらふ、うつくし/うるはし/きよら） | 12 | 本体 |
| vocab-koou | 呼応で決まる語 | え・よも・ゆめ・さらに・つゆ・おほかた・いかで・いつしか・かまへて＋文末 | 12 | エージェント |
| vocab-tagi | 多義語の文脈判別 | 同一語の sense 対決（よし・けしき・ほど・かぎり・たより・ふるさと） | 12 | エージェント |

- kind は既存の `imi`（意味選択）と `shikibetsu`（判別）を使い分ける
- 投入は人間検品後に `node --env-file=.env.local scripts/apply-drills.mjs supabase/seeds/<file>.json`
  （vocab-kokon は同 topic 差し替えなので --merge を付けない）
- コード変更: GrammarDojoHome の CURRICULUM と GrammarPopover の一覧に新 topic_id を追記（各1行）

## 将来（v2以降の候補）

- 敬語の絶対敬語クラスター（奏す/啓す・行幸/御幸/行啓 → 相手・主語の復元）
- missing-senses-report.md の上位（やう・うへ・あり・ただ・ほど接続用法）を sense 追加後にクラスター化
- L3（本文転移）実装後、各クラスターの「実戦」問を texts-v3 から自動供給
