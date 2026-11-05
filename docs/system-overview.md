# 古文単（kobun-tan）── 図で見る仕組み

作成 2026-11-06（同日、状態遷移の見直し B・C・D・E と文法道場の見直しを入れたあとの作りに直した）。対象は `F:\A2A\apps-released\kobun-tan`。
文章の正本は `CLAUDE.md`（担当範囲の表）と `docs/` の各設計書（`quiz-chat-feedback.md`・`learning-events-design.md`・`reading-test.md`・`word-card-plan.md` ほか）。本書は地図で、正本ではない。
図の名前は実際の関数名・表の名前・アドレスを使っている。文法道場の中の状態は、入口だけを書いた（中身は `CLAUDE.md` の「文法道場の見直し」の行）。

目次：1 全体像／2 画面のつながり／3 単語クイズの画面の状態／4 1問の状態／5 単語の箱（SRS）／6 出す語の決め方／7〜10 シーケンス図（出題の準備・回答から結果まで・今日の分・教材を読む）／11 起動と利用者

---

## 1. 全体像

```mermaid
flowchart LR
  subgraph FRONT["ブラウザ（Vite + React）"]
    HOME["ホーム<br/>HomeReiwa"]
    QUIZ["単語クイズ<br/>App.tsx"]
    TEXT["教材<br/>HomeV3・TextReader"]
    DOJO["文法道場<br/>GrammarDojoHome・Topic"]
    CARD["単語カード<br/>VocabCard"]
  end
  subgraph STATIC["同梱・配信するデータ（読むだけ）"]
    SLIM["src/data/kobunQ.v2.slim.json<br/>単語・意味・例文（qid 不変）"]
    TJSON["public/texts-v3・analysis<br/>reading・chikugo"]
    EXTRA["public/corpus-examples.json<br/>example-context.json・example-bank"]
  end
  subgraph API["Vercel の関数（api/）"]
    CHOICES["getChoices<br/>buildChoices"]
    SUBMIT["submitAnswer<br/>userCorrectAnswer"]
  end
  subgraph DB["Supabase"]
    WS["word_stats<br/>語ごとの正誤"]
    SRS["srs_state<br/>箱と次の復習日"]
    LE["learning_events<br/>学習の出来事（追記のみ）"]
    CAND["candidates<br/>誤答の候補"]
    PUB["text_publications<br/>公開する教材"]
  end
  HOME --> QUIZ
  HOME --> TEXT
  HOME --> DOJO
  TEXT --> CARD
  QUIZ --> SLIM
  QUIZ --> EXTRA
  TEXT --> TJSON
  CARD --> SLIM
  QUIZ --> CHOICES
  QUIZ --> SUBMIT
  CHOICES --> CAND
  QUIZ --> WS
  QUIZ --> SRS
  QUIZ --> LE
  TEXT --> LE
  TEXT --> PUB
  DOJO --> LE
```

- 単語の正本は Excel（`F:\古文単語テストリスト (回復済み).xlsx`）で、`kobunQ.v2.slim.json` はそこから作る。qid は変えない。
- `learning_events` は分析用の追記だけ。学習の進み方を決めるのは `word_stats` と `srs_state`。
- 文法道場の表（ドリル・単元の進み具合）はこの図に入れていない（見直し中）。

## 2. 画面のつながり

```mermaid
stateDiagram-v2
  state "ホーム（/）" as Home
  state "単語クイズ（/ の中で切り替え）" as Quiz
  state "教材一覧（/read）" as Texts
  state "教材を読む（/read/texts/:textId）" as Reader
  state "文法道場（/read/grammar）" as Dojo
  state "単元とドリル（/read/grammar/:topicId）" as Topic
  state "単語ホーム（/vocab）" as VocabHome
  state "単語カード（/word/:lemma）" as Card
  state "学び始め（/manabinaoshi）" as Start
  state "学習履歴（/stats）" as Stats

  [*] --> Home
  Home --> Quiz : 今日の分・単語・多義語・苦手復習
  Home --> Texts : 読解
  Home --> Dojo : 文法道場
  Home --> VocabHome : 単語ホーム
  Home --> Start : 学び始め
  Home --> Stats : 学習履歴
  Quiz --> Home : ホームに戻る
  Texts --> Reader : 教材を選ぶ
  Reader --> Card : 語のカードから
  Reader --> Quiz : 語のカードから（qid つき）
  Quiz --> Reader : 教材に戻る
  Reader --> Topic : 文法のクイズ
  Topic --> Reader : 教材に戻る
  VocabHome --> Card : 語を選ぶ
  VocabHome --> Quiz : 練習する
  Card --> Quiz : この語をクイズで確かめる
  Quiz --> Card : 単語カードへ
  Card --> Reader : 教材に戻る
  Dojo --> Topic : 単元を選ぶ
  Start --> Topic : 判定のあと
```

- ホームと単語クイズは同じアドレス `/` で、`App.tsx` の `showHome` で切り替える。ほかは `src/main.tsx` の経路。
- 教材を読む画面の下段から、解説（`/guide`）・問題（`/test`）・品詞分解PDF（`/print`）へ行ける。図では省いた。
- `/?mode=word`・`/?mode=polysemy` で開くと、ホームを挟まずクイズが始まる。単語ホームの「練習する」はこれを使う。
- 戻り先は来た所へ：単語カードと単元ページは `?back=` を受け取る（`src/lib/returnTo.ts` の `safeReturnPath`・`safeDojoBackPath`・`returnLabels`）。
- ほかの経路：`/search`（検索）・`/texts`（旧教材一覧）・`/tango-dojo`（見分ける）・`/read/vocab`（単語帳）・`/read/reference`（文法の解説）・`/read/grammar/reibun`（例文事典）・`/account`・`/teacher`。

## 3. 単語クイズの画面の状態

```mermaid
stateDiagram-v2
  state "ホーム" as Home
  state "出題を作る" as Setup
  state "出題中" as Asking
  state "答え合わせ（会話）" as Feedback
  state "もう一度（間違えた語）" as Retry
  state "結果" as Result

  [*] --> Home
  Home --> Setup : 今日の分・単語・多義語・苦手復習
  Setup --> Asking : 出題がそろう
  Setup --> Setup : 範囲や形式を変える
  Asking --> Feedback : 答える
  Feedback --> Asking : つぎへ（残りあり）
  Feedback --> Retry : 最後の問いで、間違いあり
  Retry --> Feedback : 答える
  Feedback --> Result : 最後まで終わる
  Result --> Setup : 同じ範囲を繰り返す
  Result --> Home : ホームに戻る
  Asking --> Home : ホームに戻る
```

- 状態を持つ変数：`showHome`・`isQuizActive`・`showResults`・`currentQuestionIndex`・`currentQuizData`。モードは `currentMode`（`word`／`polysemy`）、入口の種類は `quizMode`（`normal`・`weak`・`focus`・`today`）。
- 「出題を作る」は範囲・形式・問題数・モードを変えるたびに走る。あとから始めた作り直しだけを反映する（`setupSeqRef`）。
- 「もう一度」は、最後の問いのあと、間違えた語を1回だけ後ろに足す（`buildRetryRound`）。練習扱いで、記録と点数には入れない。
- 多義語モードの ○×・例文理解・文脈記述は、答え合わせが会話ではなく従来の表示。

## 4. 1問の状態（形式と判定）

```mermaid
stateDiagram-v2
  state "問いを出す" as Shown
  state "選択肢を選ぶ" as Choice
  state "意味を書く" as Writing
  state "正解" as Ok
  state "不正解" as Ng
  state "保留（自分で判定）" as Pending
  state "記録する" as Record

  [*] --> Shown
  Shown --> Choice : 4択の形式
  Shown --> Writing : 記述の形式
  Choice --> Ok : 正解の qid を選ぶ
  Choice --> Ng : それ以外
  Writing --> Ok : verdict が correct
  Writing --> Ng : 別義・現代語の罠・誤り・無回答
  Writing --> Pending : 機械で決まらない
  Pending --> Ok : 合っていた
  Pending --> Ng : ちがった
  Ok --> Record
  Ng --> Record
  Record --> [*]
```

- 4択の形式：`word-meaning`（語から意味）・`word-reverse`（意味から語）・`sentence-meaning`（例文から意味）・`blank-fill`（空欄）。記述は `meaning-writing`。
- 記述の判定は `judgeWritingAnswer`（`src/lib/writingJudge.ts`）。記録は最終判定の1回だけ（`finalizeWriting`）。
- 保留のあいだは「つぎへ」を出さない。出口は「合っていた」「ちがった」の2つだけ（2026-11-06。前は判定せずに進めて、記録が残らなかった）。
- 形式「おまかせ」は箱で問い方を上げる：箱1 `word-meaning` → 箱2〜3 `sentence-meaning` → 箱4 `blank-fill`（空欄が無い語は `sentence-meaning`）→ 箱5 `meaning-writing`。
- 箱3以上の語は、例文を教材の実戦例文（`public/corpus-examples.json`）に差し替える。

## 5. 単語の箱（SRS）

```mermaid
stateDiagram-v2
  state "未着手（記録なし）" as New
  state "箱1：毎回" as B1
  state "箱2：1日後" as B2
  state "箱3：3日後" as B3
  state "箱4：7日後" as B4
  state "箱5：14日後" as B5
  state "覚えた（箱5のまま、間隔がのびる）" as Done

  [*] --> New
  New --> B2 : 初回に正解
  New --> B1 : 初回に不正解
  B1 --> B2 : 正解
  B2 --> B3 : 期限後に正解
  B3 --> B4 : 期限後に正解
  B4 --> B5 : 期限後に正解
  B5 --> Done : 期限後に正解
  Done --> Done : 期限後に正解（あいた日数の2倍）
  B2 --> B1 : 不正解
  B3 --> B1 : 不正解
  B4 --> B2 : 不正解（2つ下げる）
  B5 --> B3 : 不正解（2つ下げる）
  Done --> B3 : 不正解
```

- 計算は `nextBox`・`reviewTransition`・`graduatedIntervalDays`（`src/lib/srsEngine.ts`）。日数は `BOX_INTERVALS_DAYS`。
- 期限より前に正解しても、箱も次の復習日も動かない（練習扱い）。
- 卒業（2026-11-06）：箱5で期限後に正解したら、箱は5のまま、次の復習を「前回の復習からあいた日数の2倍」にする。下限28日・上限120日（`GRADUATED_MIN_DAYS`・`GRADUATED_MAX_DAYS`）。DB の箱は1〜5の決まりなので、箱6は作らない。
- 落ち方（同日）：不正解は、箱4・5なら2つ下げる。箱1〜3は箱1へ。
- 文法ドリルの記録も同じ計算を使う。

## 6. 出す語の決め方（おまかせ選択）

```mermaid
flowchart TD
  A["範囲の中の語"] --> B{"記録があるか"}
  B -- "ない" --> NEW["未着手 new"]
  B -- "ある" --> C{"期限が来ているか"}
  C -- "来ている" --> DUE["復習 due"]
  C -- "まだ" --> D{"箱はいくつか"}
  D -- "箱1" --> WEAK["苦手 weak"]
  D -- "箱2〜3" --> MID["途中 mid"]
  D -- "箱4〜5" --> STRONG["得意 strong"]
  DUE --> P["1回の出題に入れる"]
  WEAK --> P
  NEW --> P
  MID --> P
  STRONG --> Q["ほかが尽きたときだけ入れる"]
```

- 分類は `classify`、配分は `pickQuestions`（`src/lib/quizSelector.ts`）。期限が来た語は `getDueAmong`（`src/lib/srsEngine.ts`）で取り、単語クイズのおまかせ選択が渡す（2026-11-06）。
- 期限が来た語があるとき：復習 40%（古い順）・苦手 30%・未着手 30%（番号順）・残りを途中から。足りなければ 復習の残り → 苦手の残り → 未着手の残り → 途中 → 得意 の順で補う。1問目は 復習・苦手・未着手 のどれか。
- 期限が来た語を渡さないとき（文法ドリル・今日の分の補充）：苦手 40%・未着手 30%・残りを途中から。
- 箱の記録があれば箱だけで決める（同日。前は誤答率を先に見ていたので、箱が高くても苦手に入り続けた）。箱の記録が無い語だけ、正誤の累計で決める（誤答率 40% 以上＝苦手、3回以上答えて 20% 以下＝得意）。

## 7. シーケンス：単語クイズの出題を作る

```mermaid
sequenceDiagram
  participant U as 生徒
  participant A as App.tsx
  participant S as Supabase
  participant F as 配信データ
  participant V as api/getChoices

  U->>A: 単語を押す・範囲を変える
  A->>A: setupQuiz → setupWordQuiz
  A->>S: getWordStats・getSrsBoxes・getDueAmong
  S-->>A: 語ごとの正誤・箱・期限が来た語
  A->>A: pickQuestions（出す語を決める）
  A->>F: loadCorpusExamples・loadBlanks
  F-->>A: 実戦例文・空欄つき例文
  A->>A: 箱で形式を決める・箱3以上は実戦例文へ
  loop 1問ずつ（並列）
    A->>V: qid・形式・除く qid
    V->>S: candidates（誤答の候補）
    V-->>A: 選択肢4つ（buildChoices）
  end
  alt 選択肢が4つ届かない
    A->>A: buildFallbackOptions（手元で作る）
  end
  A->>F: loadExampleContext
  A->>A: repairTranslationClashes・repairDistractors・exampleFittedLabels
  A-->>U: 1問目を出す
```

- 選択肢の決まり（正解と同じ意味・表記ちがい・意味が重なる組を誤答に入れない）は `src/lib/senseEquivalence.ts` にあり、関数と手元の両方が使う。
- 誤答の候補は、関数も手元も「番号が前後10以内の語 → 残り」の順に選ぶ（`nearbyFirst`）。
- 学習記録が取れないときは、出す語をランダムに選んで続ける。

## 8. シーケンス：回答から結果まで

```mermaid
sequenceDiagram
  participant U as 生徒
  participant A as App.tsx
  participant C as WordQuizContent・ChatFeedback
  participant S as Supabase

  U->>C: 選択肢を選ぶ
  C->>A: handleAnswer
  alt ふつうの問い
    A->>S: recordAnswer（word_stats）
    A->>S: updateSrsState（srs_state）
  else もう一度の問い
    A->>A: 記録も点数も進めない
  end
  A->>S: logEvent（learning_events）
  A-->>C: 正誤
  C->>C: buildThread（吹き出しを組む）
  C-->>U: 答え合わせ（自分の答え・判定・核イメージ・罠・例文）
  U->>C: つぎへ
  C->>A: handleNextQuestion
  alt 最後の問いで、間違えた語がある
    A->>A: buildRetryRound（後ろに足す）
  end
  alt 残りの問いがある
    A-->>U: 次の問い
  else 終わり
    A-->>U: 結果（点数は もう一度 を除いて数える）
  end
```

- 記録の2つ（`recordAnswer`・`updateSrsState`）は待たずに送る。失敗しても出題は続く。
- 記述のときは `handleWritingSubmit` → `judgeWritingAnswer` → `finalizeWriting`。回答の本文は `api/submitAnswer` へ送る（もう一度の問いでは送らない）。

## 9. シーケンス：今日の分

```mermaid
sequenceDiagram
  participant U as 生徒
  participant H as ホーム
  participant A as App.tsx
  participant S as Supabase

  H->>S: getTodayReviewSet・getLastActivity・getActiveQuizRange
  S-->>H: 今日の復習・最後に使った日・小テスト範囲
  opt 14日以上あいた
    H->>S: getWarmupWords（箱4〜5から5語）
  end
  U->>H: 今日の分を押す
  H->>A: startTodaySession
  A->>S: getTodayReviewSet・getWordStats・getSrsBoxes
  A->>A: composeTodaySet
  Note over A: おかえりの語 → 復習（古い順）→ 新しい語3 → 補充、で10問
  A->>A: setupQuiz（並び順どおり）
  A-->>U: 出題（8 と同じ流れ）
  U->>A: 終わる
  A->>S: getSrsBoxes（終了時の箱）
  A-->>U: 結果と成長の1行（countGrowth・growthLine）
```

- 組み立ては `composeTodaySet`（`src/lib/todaySession.ts`）。新しい語の枠は `MIN_NEW_PER_DAY` = 3（2026-11-05。前は復習だけで10語に届くと新しい語が入らなかった）。
- 今日すでに解いた語は、今日の復習に入れない（箱1の語が何度も戻るのを防ぐため）。
- 小テスト範囲から始めたときは、範囲の外の復習語を混ぜない。

## 10. シーケンス：教材を読む

```mermaid
sequenceDiagram
  participant U as 生徒
  participant R as TextReader
  participant F as 配信データ
  participant W as 語のカード（useWordCard）
  participant Q as 単語クイズ
  participant S as Supabase

  U->>R: 教材を開く
  R->>F: texts-v3・analysis・reading・chikugo
  F-->>R: 本文とトークン・決め手・読解・逐語訳
  R->>S: logEvent（text・view）
  R-->>U: 本文（層を選ぶ：用言・助動詞・助詞・敬語・識別・読解）
  U->>W: 語に触れる・タップで固定
  W-->>U: 語・意味・決め手・行き先
  W->>S: logEvent（text・open・token）
  alt 単語クイズへ
    U->>Q: quizUrlWithReturn（qid と戻り先つき）
    Q-->>U: その語だけ出題
    U->>R: 教材に戻る（押していた語まで動く）
  else 単語カードへ
    U->>W: /word/:lemma
  else 文法へ
    U->>W: 解説・文法のクイズ
  end
```

- 層の並びは `LAYER_ORDER`（用言・助動詞・助詞・敬語・識別・読解）。識別の層では語のカードを出さず、識別の出題を使う。
- 教材は公開の表（`text_publications`）にあるものだけ一覧に出る。
- 戻り先は `src/lib/returnTo.ts`（`makeReturnTo`・`quizUrlWithReturn`・`tokenIdFromHash`）。

## 11. 起動と利用者

```mermaid
stateDiagram-v2
  state "はじめて開く" as First
  state "匿名の利用者（ブラウザごと）" as Anon
  state "メールを登録した利用者" as Email
  state "プロフィール（学校・組・番号）あり" as Profile

  [*] --> First
  First --> Anon : ensureAnonSession
  Anon --> Email : /account で学校のメールを登録
  Email --> Profile : 組と番号を登録
  Anon --> Anon : 記録は同じ利用者に付く
  Email --> Email : 別の端末でも続きから
```

- 匿名の記録は、登録しても同じ利用者に残る。別の端末の匿名の記録は、端末の統合（`merge_user_progress`）で付け替える。
- 登録を必須にする切り替えは環境変数 `VITE_AUTH_REQUIRED`（既定はオフ。`src/components/RequireAccount.tsx`）。

---

## 図に入れていないこと

- 文法道場の中（ドリルの出し方・復習・レベル）と学び始め。2026-11-06 に見直しを入れた。今の作りは `CLAUDE.md` の「文法道場の見直し」の行、見直しの前の作りと問題点は `F:\A2A\_work\kobun-ia\grammar-dojo-review.md`。
- 多義語モードの3形式の細部、読解テスト、教員の画面、動画の配信（R2）。
- 数字（利用者数など）。利用の集計は `F:\A2A\_work\kobun-ia\` にある。
