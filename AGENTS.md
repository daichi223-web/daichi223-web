# kobun-tan（古文単）— エージェント向け規約

古文の単語・文法道場・読解を扱う学習アプリ。Vite + React + TypeScript。
本番 = Vercel、DB = Supabase（動画配信は R2、`VITE_VIDEO_BASE_URL`）。

規約の本体は `CLAUDE.md`。要点をここにも書くが、作業前に `CLAUDE.md` も読むこと。

## 絶対に守る

- 単語データの **qid は不変**（変えるとユーザーの学習履歴が壊れる）。
  正本 Excel = `F:\古文単語テストリスト(回復済み).xlsx`
- 読解教材の正本 = `public/texts-v3/*.json` ＋ `public/reading/` ＋ `public/analysis/`
  ＋ kokugo-vault の MD の**並行層**。1つ直したら他の層の参照も確かめる。
  検査は `node scripts/check-texts.mjs`（read-only・T1〜T13）。**直す前と後に必ず走らせる**
- データ修正は `.claude/skills/` に確立済みの手順があるか先に確認する（車輪の再発明をしない）
- 事実（本文・語義・出典・数値）を推測で埋めない。判読不能・不明は `〔　〕` で明示する
- **破壊的操作**（削除・移動・上書き・`git reset --hard`）と**外部影響**（`git push`・deploy・
  Supabase 本番 SQL・メール送信）は、実行前に人へ確認する

## git

- **`git add -A` / `git add .` を使わない。** 自分が触ったファイルだけを名指しで `add` する
  - 同じ作業ツリーを別のエージェントと共有している（下記）。担当外の変更を巻き込まない
- **肖像の原本（`assets-src/portraits/`）は git で持つ方針**（`.gitignore` に入れない）。
  ただし PNG は1枚 2〜3MB で、1世代ぶんで約 139MB。git の履歴は縮まないので、
  **試作は commit せず、採用が決まった版だけ** commit する
- push は人の承認を得てから。Vercel Hobby は commit の author email が verified と
  一致しないと deploy が ERROR になるので、push 前に `git config user.email` を確かめる
- コミット前に `git status` を見て、意図しないファイルが混ざっていないか確かめる

## いま並行で動いている作業（2026-09-07）

| 担当 | 触っている範囲 |
|---|---|
| CODEX（2026-09-19 機能公開済み・ホームUIは旧版へ復元） | 単語ホームUI・復習判定・文法の自力回答→下位問題→再挑戦 = `src/components/HomeReiwa.*` / `src/App.tsx` / `src/lib/{srsEngine,wordStats,quizSelector}.ts` / `src/lib/kobun/drillSupport.ts` / `src/components/grammar/DrillSession.tsx` / `src/pages/GrammarDojo{Topic,Review}.tsx` / 関連テスト。詳細 `docs/adaptive-learning-review.md` |
| CODEX | 位階システム = `src/lib/nobleData.ts` / `src/lib/portraitTone.ts` / `src/components/noble/` / `public/portraits/` / `assets-src/portraits/` / `docs/noble-rank-system.md` |
| Claude Code | 読解教材データ = `public/texts-v3/` / `public/analysis/` / `public/reading/` / `scripts/check-texts.mjs` ほか検査・修正スクリプト / 接頭語・接尾語一覧（2026-09-29〜）= `public/affixes.json`（配布プリントと共通の正本）/ `src/pages/AffixList.tsx` / `src/lib/kobun/affixes.ts` / 教材トークンの `affixRefs` |
| Claude Code | 登録必須化＋暗号化プロフィール（2026-09-12〜）= `api/profile.ts` / `api/_pii.ts` / `src/lib/{profile,schools,auth}.ts` / `src/components/RequireAccount.tsx` / `src/pages/AccountPage.tsx` / `src/main.tsx` / `supabase/migrations/013_profiles.sql` / 利用状況 `scripts/usage-*` / 教員画面の利用状況タブ `api/_teacher_usageData.ts` / `api/teacher.ts` / `src/pages/Teacher.tsx`（UsageView のみ） |
| Claude Code | 学習の出来事の記録（2026-10-04〜、設計 `docs/learning-events-design.md`）= `supabase/migrations/014_learning_events.sql` / `src/lib/learningEvents.ts` / `src/tests/learningEvents.test.ts`。各画面には `logEvent(...)` / `markQuestionShown()` の呼び出しを足してある（`src/App.tsx`・`DrillSession.tsx`・`GrammarDojoTopic.tsx`・`ReibunQuiz.tsx`・`progress.ts` ほか）。**呼び出しは分析用の記録なので、画面を直すときも消さずに残す** |
| Claude Code | 記述（意味を書く）の判定（2026-10-05〜）= `src/lib/writingJudge.ts` / `src/lib/writingJudgeRuntime.ts` / `src/components/quiz/{writingVerdict.ts,ContextWritingContent.tsx}` / `src/components/quiz/WordQuizContent.tsx`（記述の結果表示）/ `src/App.tsx`（`finalizeWriting`・`handleWriting*`・`handleContextWritingJudged`）/ `src/utils/dataParser.ts`（v2 フィールドの受け渡し）/ `src/tests/writingJudge.test.ts` / 正解の辞書 = `api/getAcceptedCandidates.ts`・`api/_teacher_{aggregateCandidates,listCandidates}.ts`・`src/pages/Teacher.tsx`（候補タブ）。点数ではなく「正解／別義／現代語の罠／無回答／保留」を返す。自己判定は保留のときだけ、SRS の更新は最終判定の1回。正解の辞書に入るのは教員が候補タブで決めた言い方（overrides 表）だけ。`src/App.tsx` の記述まわりは CODEX から Claude Code が引き取った（2026-10-05 ユーザー指示）。正解欄の示し方（どこまで書けばよいか）= `src/components/quiz/SenseAnswerGuide.tsx`・`describeNorm`。例文の対象語の印（2026-10-05〜）= `src/components/quiz/MarkedSentence.tsx` / `src/lib/targetMark.ts` / `src/tests/targetMark.test.ts` / `scripts/target_marks.py` / `scripts/check-target-marks.py`（位置は `scripts/build-kobunq-slim.py` が slim の `examples[].mark` に生成。slim は手で編集しない）/ `src/components/ExampleDisplay.tsx`・`src/components/quiz/{ExampleComprehensionContent,TrueFalseQuizContent}.tsx` の例文1行の描画。単語クイズの答えやすさ（2026-10-06〜）= 4択の表示（`WordQuizContent.tsx`: 指示文・選択肢の 〔 〕 を外す・回答前の訳を伏せる・正誤の色）/ 例文理解・○×の表示（`ExampleComprehensionContent.tsx`・`TrueFalseQuizContent.tsx`）/ 表示用の小さな関数 = `writingVerdict.ts`（`stripSenseBrackets`・`maskTranslation`・`quizMeanings` ほか）・`src/tests/quizDisplay.test.ts` / `src/App.tsx` は2点だけ（検索ボタンに答えの語を出さない `currentVisibleLemma`、例文理解の採点を画面に出した意味だけにする `handleExampleComprehensionCheck`。2026-10-06 ユーザー指示） |

**自分の担当外のファイルは add もコミットもしない。** 作業が終わったらこの表を更新する。

## 引き継ぎ（2026-10-06、単語クイズのデザイン点検より）

今回は直していない3点。方針の判断か実機の確認が先に要る。

1. 4択・○×で正解したとき、親（`src/App.tsx`）が約0.5秒で問題ごと外すため、`WordQuizContent` / `TrueFalseQuizContent` の「核イメージを1.6秒見せてから進む」処理が働いていない（核イメージの1行が一度も表示されない）。見せるなら1問あたり約1秒延びる。方針の判断が要る
2. 出題中も設定パネル（形式・範囲・問題数）が出たままで、スマホでは問題が画面の上から約3分の1（273px）の位置から始まる。iPad では固定ツールバーがモード切替タブに16px重なる
3. 選択肢を辞書形（`senseNorm`）で出す案は見送り（併記・注記つきの扱いと重複の確認が先）。主ボタンを画面下に固定する案も見送り（ソフトキーボードとの重なりの実機確認が先）

**CODEX へ（2026-10-06、Claude Code がユーザー指示で HomeReiwa を1か所変更）**: ホームの Today's Quest で、肖像＋位階名の上に `/stats`（学習履歴）への透明な `<Link aria-label="学習履歴を見る">` を重ねた。button の中に a を置けないので、button を `<div className="relative mb-4">` で包み、兄弟として絶対配置（top/left 12px・148×62px。p-4 と装束ストリップ幅 140px に連動）。位階の判定・肖像・データは変えていない。ストリップの幅や余白を変えるときはこの位置も合わせて直す

## 環境

- 作業機は RAM 8GB。並列エージェントは最大3本、重い処理は逐次。画像・PDF は開かない
- F: は FAT32（単一ファイル 4GB 上限・シンボリックリンク不可）
- `.env*`・鍵ファイルは読まない・出力しない・コミットしない

## 注意

- ルート直下の `test-*.html`・`kobun-app-*.html`・`範囲選択*.txt` は過去の試行の残骸。参照も編集もしない
- 大きなバイナリ（動画等）は Supabase Storage に置かない（egress 超過の実績あり。R2 へ）
