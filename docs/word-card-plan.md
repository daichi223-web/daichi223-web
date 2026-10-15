# 浮かぶ解説カード（WordCard）の計画

作成 2026-10-16。元になった試作は `F:\A2A\_work\kobun-story\①月の琴.html`（縦書きの物語。語に触れると意味・理由・品詞・訳が出る）。
2026-10-16 ユーザー指示で、CODEX の担当範囲（ホーム・単語クイズ・SRS・文法道場・位階）も Claude Code が引き取り、この計画に含める。

## 目的

語の解説を「語の近くに浮かぶ短いカード」にし、単語には「この文脈でその意味になる理由」を付ける。読解ページから始め、単語クイズ・検索・単語帳にも同じカードを使う。

## 段階1　読解ページ（済・未コミット）

- `WordCard.tsx`：語・基本330の番号・意味・決め手（analysis の decider。無ければ hint）・助詞助動詞は品詞/接続/用法/活用型・単語帳の意味の一覧・「→ 単語カード」`/word/:lemma`・「もっと」で従来の GrammarPopover。
- `useWordCard.tsx`：PC は重ねるだけで出てクリックで固定（Esc・外クリック・スクロールで閉じる）。スマホは指を当てている間に出て、横になぞると指の下の語に切り替わり、離すと消える。タップで出したまま、同じ語の再タップで閉じる。縦はページのスクロール（`touch-action: pan-y`）。状態は教材画面に持ち、文をまたいでなぞれる。
- `TextReader.tsx`：全教材で既定オン。下部の「解説：カード／従来」で端末ごとに戻せる（`localStorage kobun-word-card=off`）。読解(5)・識別(6)は従来どおり。画面下の帯に、触れた語のある文の現代語訳（高さ固定）。
- `vocabLookup.ts`：本文の下線の判定を別名表（`resolveVocabKey`）にそろえた。
- 検査：`src/tests/wordCardLayout.test.ts`（判定と置き場所）、Playwright で PC（重ねる・固定・Esc・もっと・切替）とスマホ（なぞり・タップ固定・縦スクロール）。実機は未確認。

残り：実機（iPhone・Android）の確認 → 「仏の御石の鉢」で先生方に見てもらう → コミット・本番。

## 段階2　「理由」のデータ

- 置き場所：`public/analysis/<id>.json` の `tokenAnalyses[].decider`（meaning / type / summary / cues）。今は主に助動詞。単語にも同じ形で付ける。UI の変更は不要。
- 対象：単語帳（330）に紐づく語の全出現（助詞・助動詞は既存の決め手のまま）。2026-10-16 時点で 119 教材・5,371 語。公開中の 17 教材（default/nishi の両 cohort とも同じ 17 本。`node --env-file=.env.local scripts/_stats-readonly.mjs` で確認）は 617 語。順番は公開中 → 残り。
- 数える：`npx tsx scripts/vocab-deciders-count.ts`。材料の書き出し：`npx tsx scripts/vocab-deciders-extract.ts <id> <outDir>`（文・訳・語・候補の意味・核・総則・教材のポイント）。検証と合流：`node scripts/vocab-deciders-apply.mjs <id> <out.json> [--write]`（type・summary の長さ・cue.text が本文に1回だけ、を検査してから既存を保持して合流）。
- 作り方（月の琴と同じ手順をスクリプト化）：教材から「文＋語＋意味ラベル」を書き出す → 分担して理由を書く（40〜90字。文脈の手がかりを具体的に。辞書で照合、出典を記録）→ 機械検査（全語にある・字数・ラベルと矛盾しない）→ 別の担当が通しで点検 → 反映。
- 型（後接・呼応・形・主語・文脈）を付け、既存の「決め手」と同じ色で出す。
- `scripts/check-texts.mjs` に「紐づく語に decider がある」検査を足す。
- 公開教材の分は反映前に教員が確認する。

### 実績（2026-10-16）
- 公開中17教材・617語に意味と理由を付けて本番に出した（commit 369431a・db3f5e6）。
- 候補の意味が文脈に合わない語が116あった。多くは「見出し語と本文の語が別語」で、紐づけ表（vocabAlias）の誤り（書く→斯く、寝→往ぬ、詠む→眺む、早く→とく、居り→ゐる、故→ゆゑ、あはれ→あはれなり）を外し、品詞が食い違う紐づけを通さないようにした（紐づく語 5,371 → 4,857）。
- 残る「別の意味」の語（知る≠領る、心≠情趣を解する心、世≠男女の仲、会ふ≠結婚する、うち≠宮中）は、330の見出しに普通の意味が無いもの。カードでは正しい意味を出し「単語帳の○○を見る（この箇所とは別の意味）」と案内する。330側に意味を足すかは教員の判断（正本 Excel の変更＝`kobun-vocab-data-fix`）。
- クイズ側（段階3）は当面変更しない（2026-10-16 判断）。

## 段階3　読解ページ以外へ（旧 CODEX 範囲を含む）

流用しやすい順。
1. 検索結果の例文（`SearchPage.tsx` の見出し語ボタン）と単語帳（`VocabPage.tsx`）：今の VocabModal の代わりにカード。「もっと」で VocabModal。
2. 単語クイズの答えたあとの例文（`WordQuizContent.tsx`・`TrueFalseQuizContent.tsx`・`ExampleComprehensionContent.tsx` の `MarkedSentence`）：対象語をタップ可能にし、`Word.decider` を decider として渡す。`App.tsx` の「📖 解説」ボタンの代わりにもなる。
3. 例文クイズ（`ReibunQuiz.tsx`）と文法道場（`DrillSession.tsx`）：【】の判定対象にカード。文に Token が無いので `auxiliaryInfo.ts` から合成する。

## 段階4　月の琴を教材に（任意）

- 7,557語に品詞・意味・理由・文の訳が付いているので、texts-v3 と analysis の形式に変換すれば教材になる。
- 課題：16,000字は長いので章ごと（15）に分ける。vault の意味ラベルと古文単の意味ラベル（senseNorm）の対応表が要る。

## 決めごと

- 従来の GrammarPopover は「もっと」で開く形で残す。単語帳に追加・クイズへの導線はそちら。
- コミット・本番反映はその都度ユーザーの指示で。
