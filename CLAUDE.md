# kobun-tan（古文単）

古文の単語・文法道場・読解を扱う学習アプリ。Vite + React + TypeScript。
本番 = Vercel、DB = Supabase（動画配信は R2 へ移行中、`VITE_VIDEO_BASE_URL`）。

## データ層の鉄則

- 読解教材の正本 = `public/texts-v3/*.json`（meaning）＋ reading ＋ kokugo-vault の MD の並行層。修正は該当層すべてに反映する
- 単語データの正本 Excel = `F:\古文単語テストリスト (回復済み).xlsx`。**qid は不変**（変えるとユーザーの学習履歴が壊れる）
- 文法道場の投入 = `scripts/apply-drills.mjs`、例文集の全置換 = `scripts/apply-reibun.mjs`、動画 = `scripts/grammar-video.mjs`

## 作業前に必ず確認

データ修正の多くは確立済みの手順スキルがある。`.claude/skills/` を先に見る:
点検系（token-alignment / conjugation-form / jodoshi-quiz / kakari-check / meaning-label）、
付与系（token-hints / cultural-context / text-deciders / canonical-verification）、
調整系（grammar-level-calibration）。
ユーザーレベルにも /kobun-text-clean・/kobun-vocab-alias・/kobun-reibun-corpus・/kobun-tsu-nu-kakujutsu がある。

## いま並行で動いている作業（2026-09-07）

このリポジトリは Claude Code と CODEX が同じ作業ツリーを共有している。

| 担当 | 触っている範囲 |
|---|---|
| CODEX（2026-09-19 機能公開済み・ホームUIは旧版へ復元） | 単語ホームUI・復習判定・文法の自力回答→下位問題→再挑戦 = `src/components/HomeReiwa.*` / `src/App.tsx` / `src/lib/{srsEngine,wordStats,quizSelector}.ts` / `src/lib/kobun/drillSupport.ts` / `src/components/grammar/DrillSession.tsx` / `src/pages/GrammarDojo{Topic,Review}.tsx` / 関連テスト。詳細 `docs/adaptive-learning-review.md` |
| CODEX | 位階システム = `src/lib/nobleData.ts` / `src/lib/portraitTone.ts` / `src/components/noble/` / `public/portraits/` / `assets-src/portraits/` / `docs/noble-rank-system.md` |
| Claude Code | 読解教材データ = `public/texts-v3/` / `public/analysis/` / `public/reading/` / `scripts/check-texts.mjs` ほか検査・修正スクリプト / 接頭語・接尾語一覧（2026-09-29〜）= `public/affixes.json`（配布プリントと共通の正本）/ `src/pages/AffixList.tsx` / `src/lib/kobun/affixes.ts` / 教材トークンの `affixRefs` |
| Claude Code | 登録必須化＋暗号化プロフィール（2026-09-12〜）= `api/profile.ts` / `api/_pii.ts` / `src/lib/{profile,schools,auth}.ts` / `src/components/RequireAccount.tsx` / `src/pages/AccountPage.tsx` / `src/main.tsx` / `supabase/migrations/013_profiles.sql` / 利用状況 `scripts/usage-*` / 教員画面の利用状況タブ `api/_teacher_usageData.ts` / `api/teacher.ts` / `src/pages/Teacher.tsx`（UsageView 以下の利用状況の部品のみ）。「単語と教材」表示（2026-10-08〜）= `supabase/migrations/015_usage_by_area.sql`（集計関数・本番適用済み）/ `api/_teacher_usageAreas.ts` / `api/_usageIdentity.ts`（学校コード＋年-組-番号の共通部品） |
| Claude Code | 学習の出来事の記録（2026-10-04〜、設計 `docs/learning-events-design.md`）= `supabase/migrations/014_learning_events.sql` / `src/lib/learningEvents.ts` / `src/tests/learningEvents.test.ts`。各画面には `logEvent(...)` / `markQuestionShown()` の呼び出しを足してある（`src/App.tsx`・`DrillSession.tsx`・`GrammarDojoTopic.tsx`・`ReibunQuiz.tsx`・`progress.ts` ほか）。**呼び出しは分析用の記録なので、画面を直すときも消さずに残す** |
| Claude Code | 記述（意味を書く）の判定（2026-10-05〜）= `src/lib/writingJudge.ts` / `src/lib/writingJudgeRuntime.ts` / `src/components/quiz/{writingVerdict.ts,ContextWritingContent.tsx}` / `src/components/quiz/WordQuizContent.tsx`（記述の結果表示）/ `src/App.tsx`（`finalizeWriting`・`handleWriting*`・`handleContextWritingJudged`）/ `src/utils/dataParser.ts`（v2 フィールドの受け渡し）/ `src/tests/writingJudge.test.ts` / 正解の辞書 = `api/getAcceptedCandidates.ts`・`api/_teacher_{aggregateCandidates,listCandidates}.ts`・`src/pages/Teacher.tsx`（候補タブ）。点数ではなく「正解／別義／現代語の罠／無回答／保留」を返す。自己判定は保留のときだけ、SRS の更新は最終判定の1回。正解の辞書に入るのは教員が候補タブで決めた言い方（overrides 表）だけ。`src/App.tsx` の記述まわりは CODEX から Claude Code が引き取った（2026-10-05 ユーザー指示）。正解欄の示し方（どこまで書けばよいか）= `src/components/quiz/SenseAnswerGuide.tsx`・`describeNorm`。例文の対象語の印（2026-10-05〜）= `src/components/quiz/MarkedSentence.tsx` / `src/lib/targetMark.ts` / `src/tests/targetMark.test.ts` / `scripts/target_marks.py` / `scripts/check-target-marks.py`（位置は `scripts/build-kobunq-slim.py` が slim の `examples[].mark` に生成。slim は手で編集しない）/ `src/components/ExampleDisplay.tsx`・`src/components/quiz/{ExampleComprehensionContent,TrueFalseQuizContent}.tsx` の例文1行の描画。単語クイズの答えやすさ（2026-10-06〜）= 4択の表示（`WordQuizContent.tsx`: 指示文・選択肢の 〔 〕 を外す・回答前の訳を伏せる・正誤の色）/ 例文理解・○×の表示（`ExampleComprehensionContent.tsx`・`TrueFalseQuizContent.tsx`）/ 表示用の小さな関数 = `writingVerdict.ts`（`stripSenseBrackets`・`maskTranslation`・`quizMeanings` ほか）・`src/tests/quizDisplay.test.ts` / `src/App.tsx` は2点だけ（検索ボタンに答えの語を出さない `currentVisibleLemma`、例文理解の採点を画面に出した意味だけにする `handleExampleComprehensionCheck`。2026-10-06 ユーザー指示） |
| Claude Code | 単語の出題データ（2026-10-06〜）= 正解が2つになる出題の解消 `src/lib/senseEquivalence.ts` / `src/tests/senseEquivalence.test.ts` / `api/getChoices.ts`（`buildChoices`）/ `src/App.tsx`（誤答のローカル生成・○×の誤りの意味・例文理解の分母 `getTotalScore`）。実戦例文 = `scripts/build-corpus-examples.py`（重複割り当て・多義語10字未満の除外、追加分の読み込み）/ `data/enrich/corpus-additions.jsonl`（qid を明示した出典つき例文、対象語の出現形 `target`）/ `public/corpus-examples.json`（生成物。手で編集しない）/ 実戦例文の印の位置（`src/App.tsx` の差し替え箇所の `exampleMark`）。単語データの修正手順 = スキル kobun-vocab-data-fix（`F:\knowledge\skills\kobun-vocab-data-fix`）/ `scripts/apply-excel-fixes.py` / `scripts/compare-xlsx.py`。教材の語の割れの検査 = `scripts/check-texts.mjs` の T16 |
| Claude Code | 品詞分解プリント（2026-10-09〜）= 教材画面の「🖨 品詞分解PDF」→ `/read/texts/:textId/print` / `src/pages/TextPrint.tsx`（縦書きA4横が既定、`?mode=yoko` で横書き。html に `hp-tate`/`hp-yoko` を付けて組む）/ ラベル規則 `src/lib/kobun/hinshiLabel.ts` / 係り結び・断定「に」＋あり・呼応の副詞の検出 `src/lib/kobun/koou.ts`（データに無いものは推測しない）/ `src/tests/{hinshiLabel,koou}.test.ts` / `src/main.tsx`（経路の追加。「ホーム画面に追加」の案内 `PWAInstallBanner` はユーザー指示で表示をやめた。部品のファイルは残してある）/ `src/pages/TextReader.tsx`（下部ボタン1つ）。配布用の一括PDFは `F:\A2A\teaching\補助プリント\品詞分解\make_all.py`（呼応の表示はアプリ側だけ） |
| Claude Code | 教材の識別レイヤー（2026-10-12〜）= 教材画面の「5・識別」（内部の番号は 6、`?layer=6`。読解は内部 5 のまま並びだけ後ろ）/ 対象と正解の判定 `src/lib/kobun/shikibetsu.ts`（に・なり・なむ・らむ・ぬ・ね・る・れ・し。grammarTag から決められないものは出さない）/ 出題シート `src/components/kobun/ShikibetsuQuiz.tsx` / `src/components/kobun/{TokenizedText,TokenSpan}.tsx`（識別の描画）/ `src/pages/TextReader.tsx`（レイヤーの並び `LAYER_ORDER`）/ `src/lib/kobun/types.ts`（`LayerId` に 6）/ `--layer-6`（`src/index.css`・`tailwind.config.js`）/ `src/tests/shikibetsu.test.ts` / 全教材の件数 `scripts/check-shikibetsu.mjs`。回答は `logEvent`（targetType `shikibetsu`）に送る。教材データは変えていない / やり直し（1問ごとの「もう一度解く」・教材全体の「識別をすべてやり直す」）と解説の折りたたみ（2026-10-12）/ どちらとも取れる箇所の両方正解・△ = `src/lib/kobun/shikibetsuYure.ts`（教材ID:トークンID で手指定。公開教材の連体形＋「に」25か所。2026-10-13 国語学の論文で照合し、接続助詞を広く認める立場（山口1980・京極1987）で両方正解11・格助詞を△13・接続助詞を△1。格助詞を基本とする学説は△の説明に残す）/ `src/tests/shikibetsuYure.test.ts`。ログの ctx に attempt・verdict |
| Claude Code | 学び始め（2026-10-13〜、2026-10-14 に「学び直し」から改名。URL・記録の mode `manabinaoshi` はそのまま）= ホームの「🧭 学び始め」→ `/manabinaoshi` / `src/pages/Manabinaoshi.tsx` / 段・用語カード・判定 `src/lib/kobun/manabinaoshi.ts`（日本語教育の組み立て: Can-do で自分で段を選ぶ→各単元のいちばん易しいドリル1問ずつで判定→最初の × の単元へ。用語は初めて要る段で出す。補助動詞・自動詞他動詞は助動詞の後＝敬語の段。用語カードの文面は教員確認待ち）/ `src/tests/manabinaoshi.test.ts` / 単元の並び順を `src/lib/kobun/curriculum.ts` に切り出し（`GrammarDojoHome.tsx` はそこから import）/ `src/lib/kobun/dojoData.ts` の `fetchDrillsForTopics` / `src/main.tsx`（経路）。判定の回答は `logEvent`（ctx.mode `manabinaoshi`）だけで、SRS・word_stats は進めない。段ごとの見せ方 `stageStyle`（2026-10-13）= 段0は1画面1枚・3択・間違えたら答え直し、段1〜2は1枚ずつ・4択・答え直し、段3〜4は一覧で飛ばせる。判定は×2つで止め、結果から「残りも続けて確かめる」。やる気がなくても、やるうちに学べるように段0〜2は問いが先（`questionFirst`。説明は「ヒントを見る」か答えたあとに出る）。段1〜4の入口に「〜とは」（`about`）。用語のタップ解説 = `src/lib/kobun/glossary.ts`（48語。長い語を先に取り、1つの文で各語の最初の1回だけ点線）/ `src/tests/glossary.test.ts` |
| Claude Code | 浮かぶ解説カード（2026-10-16〜、2026-10-23 コミット。計画 = `docs/word-card-plan.md`）= `src/components/kobun/WordCard.tsx`（語の近くに浮かぶ短い解説：語・330の番号・意味・決め手かポイント・意味の一覧・「→ 単語カード」`/word/:lemma`・「もっと」で従来の GrammarPopover）/ `src/components/kobun/useWordCard.tsx`（操作。PC は重ねるだけで出てクリックで固定、Esc・外クリック・スクロールで閉じる。スマホは指を当てている間に出て横になぞると切り替わり、タップで固定。縦はページのスクロール `touch-action: pan-y`。文をまたいでなぞれるよう状態は教材画面に持つ）/ `src/lib/kobun/wordCardLayout.ts`（DOM に依存しない計算）＋ `src/tests/wordCardLayout.test.ts` / `src/components/kobun/TokenizedText.tsx`（`cardMode`・`highlightTokenId`・`moreRequest`）/ `src/components/kobun/TokenSpan.tsx`（記号以外の span に `data-token-id`）/ `src/pages/TextReader.tsx`（全教材で既定オン。下部の「解説：カード／従来」で端末ごとに戻せる `localStorage kobun-word-card=off`。読解(5)・識別(6)では従来どおり。画面下の帯に触れた語の文の訳）/ `src/lib/vocabLookup.ts`（下線の判定を別名表 `resolveVocabKey` にそろえた）。教材データは変えていない。元になった試作は `F:\A2A\_work\kobun-story\①月の琴.html`。2026-10-21 月の琴と照合して直した（`margin:0`・矢印が切れない構造・高さ上限・タップ固定でも上を優先・固定ヘッダを避ける・スクロール追従。表は `docs/word-card-plan.md` の「月の琴との照合」）。2026-10-25 再照合：指の操作は上に入り切れば上・入らなければ下に本来の高さで出す（縮めて中をスクロールさせない。ユーザー指示）・出る瞬間のアニメ無し・指のスクロールでは閉じない・追従中は入り切るうちは同じ側を保つ（表は同文書の「再照合」）。同日、ユーザー指示で本文の全部の語にカードを出す（句読点・記号以外。下線は単語帳の語だけ・‹ › は前後の語・中身の無い語は「解説はまだありません」。`useWordCard` の `cardIds`／`vocabIds`、`TokenSpan` の `hasCard`）。同日「もっと」をやめ、固定したカードの下に行き先（単語カード・単語クイズ／文法解説・文法のクイズ。単元の決め方 = `src/lib/kobun/grammarQuizTopic.ts`）と手がかりの注を出す。「見た」記録は固定で付ける（`onPin`）。助動詞「まじ」の参照単元を推量系に直した（texts-v3 と旧形式 public/texts。手順 `F:\A2A\_work\fix-maji-ji`）。続けて「じ」も推量系へ（推量系の解説ページに「じ」の行と節。vault も同じにそろえた）。意味の一覧の決め方 = `src/lib/kobun/wordCardSenses.ts`（まとめるのは活用違いだけ・この箇所の意味がある群を出す）＋ `src/tests/wordCardSenses.test.ts` |
| Claude Code | 単語帳の語義での訳・対応表・教材一覧（2026-10-22〜）= 訳と hint は単語帳の語義で訳す（尊敬の補助動詞は「お～になる」）。検査 `scripts/check-vocab-gloss.ts`（訳の外れがあると終了コード1・紐づけ漏れの推定つき）/ 対応表 `src/lib/vocabAlias.ts`（漢字表記・活用の種類・謙譲の聞こゆの規則。`resolveVocabKey` に grammarTag を渡す）/ `src/lib/vocabLookup.ts`（下線の判定も同じ関数）/ 品詞の補正 `scripts/fix-affix-pos.cjs`（convert-to-v3 の後に流し直す）/ `src/tests/vocabAlias.test.ts` / 残りの一覧 `docs/vocab-gloss-fix-2026-10-22.md`。教材一覧 `src/pages/HomeV3.tsx` は升目（時代×ジャンル）の中を作品→章段の二段に（作品名の（一）（二）は外してまとめる・開閉は sessionStorage `kobun-home-open-works-v1`・検索中は自動で開く） |

**2026-10-16 ユーザー指示**：CODEX の担当範囲（ホーム・単語クイズ・SRS・文法道場・位階）も Claude Code が引き取る。上の CODEX の行は履歴として残す。

- **担当外のファイルは add もコミットもしない**。`git add -A` / `git add .` は使わず名指しで add する
- 肖像の原本（`assets-src/portraits/`）は **git で持つ**（`.gitignore` に入れない）。
  PNG は1世代 約139MB で履歴は縮まないので、試作は入れず採用版だけ commit する
- 作業が終わったらこの表と `AGENTS.md` の同じ表を更新する

## 引き継ぎ（2026-10-06、単語クイズのデザイン点検より）

今回は直していない3点。方針の判断か実機の確認が先に要る。

1. 4択・○×で正解したとき、親（`src/App.tsx`）が約0.5秒で問題ごと外すため、`WordQuizContent` / `TrueFalseQuizContent` の「核イメージを1.6秒見せてから進む」処理が働いていない（核イメージの1行が一度も表示されない）。見せるなら1問あたり約1秒延びる。方針の判断が要る
2. 出題中も設定パネル（形式・範囲・問題数）が出たままで、スマホでは問題が画面の上から約3分の1（273px）の位置から始まる。iPad では固定ツールバーがモード切替タブに16px重なる
3. 選択肢を辞書形（`senseNorm`）で出す案は見送り（併記・注記つきの扱いと重複の確認が先）。主ボタンを画面下に固定する案も見送り（ソフトキーボードとの重なりの実機確認が先）

**CODEX へ（2026-10-06、Claude Code がユーザー指示で HomeReiwa を1か所変更）**: ホームの Today's Quest で、肖像＋位階名の上に `/stats`（学習履歴）への透明な `<Link aria-label="学習履歴を見る">` を重ねた。button の中に a を置けないので、button を `<div className="relative mb-4">` で包み、兄弟として絶対配置（top/left 12px・148×62px。p-4 と装束ストリップ幅 140px に連動）。位階の判定・肖像・データは変えていない。ストリップの幅や余白を変えるときはこの位置も合わせて直す

**CODEX へ（2026-10-13、Claude Code がユーザー指示で HomeReiwa を変更）**: ホーム下段のショートカットから「📒 単語帳」を外し、代わりに `/manabinaoshi`（学び直し）への横長の1行を置いた。学習履歴・テーマは2列のまま。下の「気になってる単語」（単語帳の最新5語）は残してある

## 注意

- ルート直下の `test-*.html`・`kobun-app-*.html`・`範囲選択*.txt` は過去の試行の残骸。参照も編集もしない
- Supabase egress に注意：大きなバイナリ（動画等）は Supabase Storage に置かない（R2 へ）
