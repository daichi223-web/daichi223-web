# 学習データ基本設計 — 単語・文法・教材をクロスで見る

作成 2026-10-04。段階 B・C はローカル実装済み（本番 DB への適用・コミット・デプロイは未実施）

## 1. ねらい

教員画面で次の3つを見られるようにする。

1. 全体の状況（誰がどれだけ使い、どこまで身についているか）
2. 苦手単語と間違いの傾向（何を、どう間違えるか）
3. 領域をまたぐ使われ方（教材・文法を使う人が単語まで行くか、行った語は定着するか）

そのために、単語・文法・教材の利用を **同じ形の記録** にそろえ、今後の分析に使い回せるデータにする。

## 2. 現状（2026-10-04 にコードで確認）

| 領域 | サーバーに残るもの | 残らないもの |
|---|---|---|
| 単語クイズ | 人×語の正誤回数の累計と最終日時（`word_stats`）、復習箱（`srs_state`） | 選んだ選択肢、出題形式、回答ごとの日時 |
| 記述式 | 回答本文を1件ずつ（`answers`） | — |
| 文法道場 | ドリルの正誤累計（`word_stats` に同居）、単元の視聴・到達度（`grammar_topic_progress`） | 選んだ選択肢、本問／補助問／再挑戦の別 |
| 教材（読解） | なし | 開いた教材、タップした語、開いた解説 |

- 選んだ選択肢は記録の直前まで手元にある（`src/App.tsx:1189` の `selectedOption.qid`、`src/components/grammar/DrillSession.tsx:99` の `choice`）が、保存するのは正誤だけ。
- 教材の利用は端末内（localStorage）にだけ残る。`src/lib/kobun/progress.ts` が、開いた教材・見たトークン・語彙解説とヒントを開いた回数を持っている。端末の外に出ないので教員画面からは見えない。
- 期間集計は「期間内に最後に触れた語の累計」での近似になっている（`scripts/usage-aggregate.js` 冒頭の注記）。

## 3. 設計の原則

- **1つの表に、1つの出来事を1行**で追記する。領域ごとに表を分けない。
- **共通の4軸**（誰が・何を・どうした・どこから）を全領域で同じ列に入れる。
- **追記のみ**。生徒側からは書き込みだけでき、読み出し・変更・削除はできない。
- **学習を止めない**。記録は裏で送り、失敗しても学習画面には影響させない。
- **既存の記録はそのまま**。`word_stats`・`srs_state`・`grammar_topic_progress` は学習機能が使っているので変えない。新しい表は分析専用。
- **氏名・メールは入れない**。識別は既存と同じ匿名 ID だけ。

## 4. 表の定義（案）

`supabase/migrations/014_learning_events.sql` として追加する想定。

```sql
create table if not exists learning_events (
  id          bigint generated always as identity primary key,
  user_id     text not null,                 -- auth.uid()::text（既存表と同じ持ち方）
  at          timestamptz not null default now(),
  session_id  text not null,                 -- 端末で起動ごとに作る乱数。流れの復元に使う
  area        text not null check (area in ('vocab','grammar','text')),
  action      text not null check (action in ('answer','view','open')),
  target_type text not null,                 -- §5 の一覧
  target_id   text not null,
  correct     boolean,                       -- answer のみ
  chosen      text,                          -- answer のみ。選んだ選択肢（単語は qid、文法は選択肢の文字列）
  format      text,                          -- 出題形式
  route       text,                          -- どこから来たか
  ctx         jsonb                          -- 補足（提示した選択肢、教材 slug、応答時間 など）
);

create index if not exists idx_le_user_at on learning_events (user_id, at);
create index if not exists idx_le_target  on learning_events (target_type, target_id);
create index if not exists idx_le_at      on learning_events (at);

alter table learning_events enable row level security;
create policy "own_le_insert" on learning_events for insert
  with check (auth.uid()::text = user_id);
-- select / update / delete のポリシーは作らない（教員画面は service_role で読む）
```

あわせて `merge_user_progress`（011）に1行足す。端末統合のとき、匿名側の出来事を登録済みアカウントへ付け替える。

```sql
update learning_events set user_id = to_uid where user_id = from_uid;
```

## 5. 記録する出来事

`action` は3種類だけにする。

| action | 意味 | 例 |
|---|---|---|
| `answer` | 問いに答えた | 単語クイズ、文法ドリル、例文集クイズ |
| `view` | ページや動画を開いた | 教材、読解ガイド、単語カード、文法トピック、講義動画 |
| `open` | 教材の本文中で解説を開いた | 語彙解説、助動詞などのヒント |

### 5.1 出来事の一覧と記録箇所

担当欄は `CLAUDE.md` の並行作業表による。「—」は表に記載がないファイル。

| area | action | target_type : target_id | 追加で残すもの | 記録箇所 | 担当 |
|---|---|---|---|---|---|
| vocab | answer | `word` : qid | chosen=選んだ qid、format=`word`/`polysemy`、ctx.choices | `src/App.tsx:1189` handleAnswer | CODEX |
| vocab | answer | `word` : qid | format=`truefalse`、chosen=`true`/`false` | `src/App.tsx:1215` | CODEX |
| vocab | answer | `word` : qid | format=`writing`、ctx.score | `src/App.tsx:1252` | CODEX |
| vocab | answer | `word` : qid | format=`polysemy` | `src/App.tsx:1401` | CODEX |
| grammar | answer | `drill` : drill.id | chosen=選択肢、format=ドリルの kind、ctx.role=本問/補助/再挑戦 | `src/components/grammar/DrillSession.tsx:99` | CODEX |
| grammar | answer | `reibun` : reibun.id | chosen | `src/pages/ReibunQuiz.tsx:131` | — |
| grammar | view | `video` : topic_id | — | `src/pages/GrammarDojoTopic.tsx:208` | CODEX |
| grammar | view | `topic` : topic_id | — | `src/pages/GrammarDojoTopic.tsx:52` | CODEX |
| text | view | `text` : slug | ctx.layer | `src/lib/kobun/progress.ts` initProgress / setCurrentLayer | — |
| text | view | `guide` : slug | — | `src/pages/TextGuide.tsx:48` | — |
| text | open | `lemma` : 見出し語 | ctx.text=slug | `src/lib/kobun/progress.ts` recordVocabOpen | — |
| text | open | `token` : tokenId | ctx.text=slug、t=表層、base=基本形、pos=品詞、ref=文法リファレンス | `src/lib/kobun/progress.ts` recordHintOpen（`GrammarPopover.tsx` から） | — |
| vocab | view | `lemma` : 見出し語 | ctx.from=直前の閲覧 | `src/pages/VocabCard.tsx:63` | — |

- **教材の出来事は `progress.ts` の中だけで足せる**。既存の関数が教材 slug・見出し語・トークン ID を引数で受けているので、呼び出し側のファイルを変えずに済む。
- **回答の出来事は CODEX 担当ファイルの変更が要る**。選んだ選択肢は呼び出し側にしかないため。

### 5.2 route（どこから）

単語クイズの回答には、アプリの出題モードをそのまま入れる: `today`（今日の分）／`normal`（範囲指定）／`weak`（苦手）／`srs`（復習）／`focus`（語を絞った出題）。文法の回答は空。

閲覧（`view`）には `route` を使わず、`ctx.from` に「直前に開いていたもの」（例 `text:azuma-kudari`）を自動で入れる。教材→単語カード、単語カード→本文 といった領域をまたぐ流れは、これと `session_id`・時刻の並びでたどる。リンク元の各画面は変更しない。

### 5.3 送り方

新規ファイル `src/lib/learningEvents.ts` に `logEvent()` を1つ置く。

- 端末内にためて、数件ごと・一定秒ごと・画面が隠れたときにまとめて送る。
- 既存の正誤記録と同じく、ブラウザから Supabase へ直接書く。API 関数は増やさない（Vercel Hobby の関数数上限のため）。
- 失敗した分は捨てる。学習画面にエラーを出さない。

## 6. 3領域をつなぐ鍵

クロス集計は、出来事の `target_id` を次の対応で結んで行う。対応表は DB に置かず、今の利用状況画面と同じく、アプリが持っている教材データから引く。

| つなぐもの | 鍵 | 元データ | 確認状況 |
|---|---|---|---|
| 単語の意味 → 見出し語 | qid（`語番号-意味番号`） | 単語データ | 確認済 |
| ドリル → 文法トピック | drill.id → topic_id | `grammar_drills` | 確認済 |
| 教材の語 → 単語クイズ | トークンの baseForm → qid 群 | `src/lib/vocabLookup.ts:40` getQuizQidsForLemma | 関数の存在は確認済。**どの意味（qid）で使われているか**までは結べるか未確認 |
| 教材の助動詞 → 文法トピック | トークンの `grammarRefId` | `public/texts-v3` | `grammarRefId` が道場の topic_id と同じ体系かは未確認 |

教材ごとの「含まれる見出し語・文法項目」の一覧は、スクリプトで生成物として作る（`public/texts-v3` から再生成でき、手で編集しない）。

## 7. 教員画面の構成

| 画面 | 見るもの | 必要なデータ |
|---|---|---|
| **全体** | 利用人数・回答数・正答率、生徒の層（触れた語数×正答率）、番号帯ごとの人数と正答率 | 既存の表で出せる |
| **苦手単語** | 見出し語ごとの意味別誤答率（人数基準）、箱1に留まる人数、文法トピック別 | 既存の表で出せる |
| **間違いの傾向** | 混同ペア（正解と選ばれた誤答）、出題形式別の正答率、初回と再挑戦の差、間隔と正答率 | 新しい記録が要る |
| **クロス** | 使い方の型、流れ、教材と単語の重なり、出会いと定着（下記） | 単語×文法は既存で可。教材が絡むものは新しい記録が要る |
| **個別の生徒** | 現行の詳細＋クラス絞り込み、領域別の利用 | 既存＋登録情報 |
| **運営** | 月別推移・離脱・復習箱・教材公開（現行の内容を末尾へ） | 既存 |

クロス画面の中身:

1. **使い方の型** — 単語だけ／単語＋文法／3領域の人数と、型ごとの正答率・継続。
2. **流れ** — 教材を開く → 語をタップ → 単語カード → クイズ、の各段に何人残るか。
3. **教材と単語の重なり** — 教材でよく開かれる語と、クイズで誤答率が高い語を並べる。
4. **出会いと定着** — 同じ生徒の中で、教材で出会った語とそうでない語の正答率を比べる。
5. **文法と教材** — 文法トピックを済ませた後、教材でその助動詞のヒントを開く回数が変わるか。
6. **クラス×領域** — クラスごとの領域別利用（登録者のみ）。

4 と 5 は、熱心な生徒ほど全領域を使うので、生徒どうしの比較では効果が言えない。同じ生徒の中での比較・前後比較で示し、画面にもその旨を書く。

### 集計の置き場所

現行の利用状況は、生の行をブラウザへ送って集計している（直近1年で約 2.45MB・7.8 秒、2026-09-12 実測）。出来事の表は行数が増えるので同じ方式にしない。**DB 側の関数で集計し、画面には集計結果だけ返す**。既存の `api/teacher` に action を足し、関数は増やさない。

## 8. 個人情報と保存

- 出来事の表に氏名・メール・学年組番号は入れない。学年組番号は現行どおり `profiles` を教員画面の API 内で復号して突き合わせる。
- 個人の表示は現行ルール（学校コード＋年-組-番号のみ）を守る。
- 行数は、回答が 2026-04〜09 の約5か月で 51,903 件だった実績から、閲覧と解説を含めて年に数十万行と見込む（推定。開始後に実測する）。

## 9. 進め方

| 段階 | 内容 | CODEX 担当ファイル | 本番 DB |
|---|---|---|---|
| A | 「全体」「苦手単語」と単語×文法のクロスを、既存データでローカルのモックにする | 触れない | 読み取りのみ |
| B | 表の追加、送信の仕組み、教材の出来事（`progress.ts` 内） | 触れない | 表の追加（要承認） |
| C | 回答の出来事（選んだ選択肢・出題形式） | 変更が要る（要調整） | — |
| D | 「間違いの傾向」「クロス」画面。記録が数週間たまってから | 触れない | 集計関数の追加（要承認） |

A と B は並行でき、どちらも CODEX の範囲に触れない。記録は始めた日からしか残らないので、B を早く入れるほど使えるデータが増える。

## 10. 決定事項（2026-10-04 daichi）

1. **生徒への知らせ方** — 授業で口頭で伝える。
2. **保存期間** — 卒業まで残す。
3. **未登録（匿名）利用者** — 記録する。
4. **応答時間** — 記録する（`ctx.ms`。問いを出してから回答までのミリ秒。10分超は付けない）。
5. **CODEX 担当ファイル** — 段階 C の差し込みも Claude Code が入れる（記録の呼び出しを足すだけで、既存の動きは変えない）。

## 10.1 実装の状態（2026-10-04）

- 追加: `supabase/migrations/014_learning_events.sql`、`src/lib/learningEvents.ts`、`src/tests/learningEvents.test.ts`
- 差し込み: `src/lib/kobun/progress.ts`、`src/components/kobun/GrammarPopover.tsx`、`src/pages/{TextGuide,VocabCard,ReibunQuiz,GrammarDojoTopic}.tsx`、`src/components/grammar/DrillSession.tsx`、`src/App.tsx`
- 検証済み: 型検査、全テスト、ビルド。014 はローカルの Postgres 互換環境（PGlite）で、冪等性・生徒の権限（本人の書き込みのみ可）・端末統合の付け替えを確認。
- 未実施: 本番 DB への適用、適用後の実ブラウザでの記録確認、コミット、デプロイ。
- 適用の順序: **先に DB、後からアプリ**。逆でも学習は止まらない（表が無い間は記録が捨てられるだけ）。

## 11. 検証

- 表と権限: 生徒の権限で、他人の ID での書き込み・読み出し・変更・削除がすべて拒否されることを確かめる。
- 記録: 単語・文法・教材をそれぞれ1回操作し、期待した行が入ることを確かめる。通信を切った状態で学習画面が止まらないことも見る。
- 集計: 既存の `word_stats` の正誤数と、同じ期間の出来事の件数が合うかを突き合わせる。
- 端末統合: 匿名側の出来事が登録済みアカウントへ移ることを確かめる。
