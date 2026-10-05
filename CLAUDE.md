# kobun-tan（古文単）

古文の単語・文法道場・読解を扱う学習アプリ。Vite + React + TypeScript。
本番 = Vercel、DB = Supabase（動画配信は R2 へ移行中、`VITE_VIDEO_BASE_URL`）。

## データ層の鉄則

- 読解教材の正本 = `public/texts-v3/*.json`（meaning）＋ reading ＋ kokugo-vault の MD の並行層。修正は該当層すべてに反映する
- 単語データの正本 Excel = `F:\古文単語テストリスト(回復済み).xlsx`。**qid は不変**（変えるとユーザーの学習履歴が壊れる）
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
| Claude Code | 登録必須化＋暗号化プロフィール（2026-09-12〜）= `api/profile.ts` / `api/_pii.ts` / `src/lib/{profile,schools,auth}.ts` / `src/components/RequireAccount.tsx` / `src/pages/AccountPage.tsx` / `src/main.tsx` / `supabase/migrations/013_profiles.sql` / 利用状況 `scripts/usage-*` / 教員画面の利用状況タブ `api/_teacher_usageData.ts` / `api/teacher.ts` / `src/pages/Teacher.tsx`（UsageView のみ） |
| Claude Code | 学習の出来事の記録（2026-10-04〜、設計 `docs/learning-events-design.md`）= `supabase/migrations/014_learning_events.sql` / `src/lib/learningEvents.ts` / `src/tests/learningEvents.test.ts`。各画面には `logEvent(...)` / `markQuestionShown()` の呼び出しを足してある（`src/App.tsx`・`DrillSession.tsx`・`GrammarDojoTopic.tsx`・`ReibunQuiz.tsx`・`progress.ts` ほか）。**呼び出しは分析用の記録なので、画面を直すときも消さずに残す** |
| Claude Code | 記述（意味を書く）の判定（2026-10-05〜）= `src/lib/writingJudge.ts` / `src/lib/writingJudgeRuntime.ts` / `src/components/quiz/{writingVerdict.ts,ContextWritingContent.tsx}` / `src/components/quiz/WordQuizContent.tsx`（記述の結果表示）/ `src/App.tsx`（`finalizeWriting`・`handleWriting*`・`handleContextWritingJudged`）/ `src/utils/dataParser.ts`（v2 フィールドの受け渡し）/ `src/tests/writingJudge.test.ts` / 正解の辞書 = `api/getAcceptedCandidates.ts`・`api/_teacher_{aggregateCandidates,listCandidates}.ts`・`src/pages/Teacher.tsx`（候補タブ）。点数ではなく「正解／別義／現代語の罠／無回答／保留」を返す。自己判定は保留のときだけ、SRS の更新は最終判定の1回。正解の辞書に入るのは教員が候補タブで決めた言い方（overrides 表）だけ。`src/App.tsx` の記述まわりは CODEX から Claude Code が引き取った（2026-10-05 ユーザー指示）。正解欄の示し方（どこまで書けばよいか）= `src/components/quiz/SenseAnswerGuide.tsx`・`describeNorm`。例文の対象語の印（2026-10-05〜）= `src/components/quiz/MarkedSentence.tsx` / `src/lib/targetMark.ts` / `src/tests/targetMark.test.ts` / `scripts/target_marks.py` / `scripts/check-target-marks.py`（位置は `scripts/build-kobunq-slim.py` が slim の `examples[].mark` に生成。slim は手で編集しない）/ `src/components/ExampleDisplay.tsx`・`src/components/quiz/{ExampleComprehensionContent,TrueFalseQuizContent}.tsx` の例文1行の描画 |

- **担当外のファイルは add もコミットもしない**。`git add -A` / `git add .` は使わず名指しで add する
- 肖像の原本（`assets-src/portraits/`）は **git で持つ**（`.gitignore` に入れない）。
  PNG は1世代 約139MB で履歴は縮まないので、試作は入れず採用版だけ commit する
- 作業が終わったらこの表と `AGENTS.md` の同じ表を更新する

## 注意

- ルート直下の `test-*.html`・`kobun-app-*.html`・`範囲選択*.txt` は過去の試行の残骸。参照も編集もしない
- Supabase egress に注意：大きなバイナリ（動画等）は Supabase Storage に置かない（R2 へ）
