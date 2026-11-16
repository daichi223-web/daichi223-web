# 文法道場「先生と学ぶ」レッスン（2026-11-15）

## なぜ
ユーザー指示（2026-11-15）:
- 「ガイドではなく、説明とかをしてほしい。文法道場の構造を結構大きく変える」
- 「説明→ドリル→説明をいい感じで混ぜて」「少しずつ丁寧に説明してね」
- 「単語とは違った形の先生の使い方。しっかり丁寧に説明していってくれる」
- 「途中で、いくつか質問して。今説明したことのクイズを出したり、次にどこを説明してほしいか聞く」
- 「分かっているものを選ばせたり、説明してほしいものを選ばせたり。文法用語の意味は分かる？とか、接続って？みたいな選択肢」

説明の文は**今ある解説をそのまま使う**（ユーザー選択）。`public/grammar/<id>.json` の `sections`（リファレンスと同じ文）。新しい説明の文は書いていない。

単語クイズの先生は答えに反応する役。ここでは先生が説明を進める役。

## 流れ
1. **はじめ**：先生「助動詞「けり」を、少しずつ説明していくね。」「説明には「接続」「連用形」「未然形」という言葉が出てくるよ。」「意味は分かる？」
   - 選択肢：「分かる、はじめよう」「「接続」って？」…
   - 用語の答えは用語集 `src/lib/kobun/glossary.ts`（48語）の文を1文ずつ。
   - 出す用語は最初の節に出てくるもの（品詞の名前は後回し）、最大3つ。
2. **節の中**：解説を小さなかたまりで1つずつ出す（「つぎ ▸」）。
   - 地の文は1文ずつ。箇条書きは1項目ずつ。表・図はカード。「例:」は例文。
   - 「次の問いまでまとめて見る」で先へ飛ばせる。
   - **表**を見せた直後と、「**接続**: ○○形」の行の直後に、**今見せた中身から1問**（`tableQuiz`・`setsuzokuQuiz`）。1節に最大2問。
     - 正解は本文に書いてあることだけ。答えが一つに決まる欄だけを問う。
     - その節のドリルの問いが接続を聞くときは、接続の行からの問いは出さない。
   - 節の最後に、その節の**ドリルの問い**を1〜2問。
     - ドリルの `refHeading` が節の見出しと同じもの。低いレベルから選ぶ。全体で最大8問。
     - 答え合わせはドリルと同じ `ChatFeedback`＋`drillThread`。
3. **節のあいだ**：先生「次はどこを説明しようか？」。
   - 残りの節を「「○○」を説明して」として並べ、教える順の次を（おすすめ）にする。
   - おすすめの節は「分かってる → 問題だけ」を選べる。その節のドリルの問いだけを出す。無ければ、表を使わない途中の問いだけ。
   - おすすめの節に出てくる用語は「〜って？」で聞ける（最大2つ）。
   - 「ここまででまとめへ」でも終われる。残りが1節なら聞かずに「最後は○○。」で進む。
4. **最後の確かめ**：どの節にも問いが結びつかない単元（`keiyoshi-katsuyo`。問いの見出し「活用表」が節に無い）だけ、最後に3問。
5. **まとめ**：ポイント（`keyPoints`）を1つずつ。「途中の問い n / m 問 正解」。
   - 「ドリルで仕上げる（記録に反映）」で、単元ページのいまのレベルのドリルへ。
   - 「単元のページへ」で単元ページに戻る。

## 単元ページ
- まだドリルの記録がなく、レッスンも終えていない単元では、「👩‍🏫 先生と学ぶ（説明と問題）」をいちばん上の主のボタンにする。ドリルの開始ボタンは従。
- 手をつけた単元では、ドリルの開始ボタンの下に「先生と学ぶ」を従のボタンで置く。
- レッスンを終えた印は端末の `kobun.dojo.lessonDone`（単元 ID の一覧。`readLessonDone`・`markLessonDone`）。
- 先生の一言（`dojoTopicGuide`）は、まだ手をつけていない単元なら「まずは説明を少しずつ読みながら、問題を解いていこう。」。

## ドリルの「説明を見る」
答えたあと、問題の `refHeading` と同じ見出しの節があれば「📖 「○○」の説明を見る」でその節を開く。正解でも不正解でも出す。

節が無い問題で不正解のときは、今までどおり「この単元の基礎を確認する」（ポイント）。単元の解説は答えたときに1回だけ読む。復習の画面でも同じ部品なので出る。

## 記録
- 開始・終了：`grammar / view / lesson : 単元ID`。ctx は `{ step: "start", sections }` または `{ step: "done", correct, answered }`。
- ドリルの問い：`grammar / answer / drill : drill.id`。ctx は `{ mode: "lesson", topic, section, choices }`。
  - 説明の直後に解く問いなので、復習（SRS）・word_stats・到達度には入れない。
  - 教員画面の「何でつまずいているか」には、学び始めの判定（ctx.mode `manabinaoshi`）と同じく数えられる（`016_usage_stumbles.sql` は ctx.mode で分けていない）。
- 今見せた中身からの問い：`grammar / answer / lesson-q : 単元ID:節:位置`。format は `lesson-quick`。ctx は `{ mode: "lesson", topic, section, prompt, choices }`。
- 節を選んだ：`grammar / open / lesson-section : 単元ID:見出し`。ctx は `{ mode: "explain" | "skip", recommended }`。
- 用語を聞いた：`grammar / open / gloss : 用語`。ctx は `{ mode: "lesson", topic }`。

## ファイル
- 材料（純関数）: `src/lib/kobun/dojoLesson.ts`
  - `splitSectionPieces`・`tableQuiz`・`setsuzokuQuiz`・`termsIn`・`buildLessonPlan`・`skipSteps`、先生の一言
  - テスト `src/tests/dojoLesson.test.ts`：全53単元の解説と seed のドリルで、文字の取りこぼし・問いの数と正しさを確かめる
- 画面: `src/components/grammar/LessonSession.tsx`
- 単元ページ: `src/pages/GrammarDojoTopic.tsx`（phase `lesson`）
- ドリル: `src/components/grammar/DrillSession.tsx`（説明を見る）
- 共通にした部品
  - `src/components/grammar/MarkdownContent.tsx`（リファレンスから切り出し。見た目はそのまま）
  - `src/components/grammar/drillContext.tsx`（例文の【】《》）
  - `src/lib/splitSentences.ts`（readingTest から切り出し。readingTest からも今までどおり import できる）

## 先生の台本で組む（2026-11-16）
- 全単元の分析と分解（`docs/grammar-lessons/decomposition*.md`）から、単元ごとの台本（```lesson）を書いた。1部分＝1つの要素で、説明には必ず例を入れる。
- 台本 → `scripts/build-grammar-lessons.mjs --write` → `public/grammar-lessons/<id>.json`。単元ページが読み込み、あれば `buildScriptPlan` で組む（無い・壊れているときは解説の節から組む今までの形）。
- 1部分の流れ：先生の説明（say を1文ずつ）→ table の節の表・段の図（表の無い節は「解説を見る」カード）→ 確かめ（checks。誤答には miss の「なぜそれを選びやすいか」）→ その節のドリル（1部分1問・全体5問まで）。
- 次の部分の選択肢は台本の ask（「〜を教えて」）・known（「〜は分かってる → 問題だけ」）。
- 説明の前後の一言は、選んだ先生の文法の台詞（`src/lib/teacherLessonLines.ts`。単語クイズの台詞とは別。ドリル・復習の判定の一言も同じ台詞）。説明そのものは全員共通。

## まだのこと
- 用語集に無い言葉（「ラ変型」「本活用」など）は「〜って？」に出ない。
- `vocab-*` の単元（本番に未投入）はレッスンの対象だが、確かめていない。
