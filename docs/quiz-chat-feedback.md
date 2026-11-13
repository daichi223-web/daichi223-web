# 単語クイズの答え合わせ（LINE 風）— 先生・背景・自分の顔

2026-11-02。対象 = 単語クイズ（`WordQuizContent` が描く 4択・逆引き・例文から意味・空欄・記述）。多義語モードの ○×（TrueFalse）・例文理解（ExampleComprehension）・文脈記述（ContextWriting）は従来どおり。

作業の原本 = `F:\A2A\_work\kobun-chat-feedback\`（`SPEC-impl.md` 実装仕様／`BRIEF-lines.md` 台詞の決まりと人物像／`wf1-report.md` 調査／`wf2-interim.md` 中間報告／`mock-chat.png` 見本／`face-sheet.py` 顔の切り出し一覧／`teachers/` 先生の絵の下見）。

## 1. 決めたこと（ユーザー決定、2026-11-02）

| 項目 | 決定 | 実装 |
|---|---|---|
| 進み方 | 正解でも自動では進まない。**タップで次へ** | `ChatFeedback` 全体が `role="button"`（click／Enter／Space）。「つぎへ →」ボタンも正解で出す。記述の保留は ○× の自己判定が済むまで進めない（`canAdvance=false`） |
| 背景 | **青海波と七宝**の2種から選ぶ（クイズ画面だけ） | `QuizBackground`（インライン SVG の pattern。色は `--rw-*` のテーマ変数）。既定 青海波。端末ごと `localStorage kobun.chat.background` |
| 先生 | **5人**から1人。史実の人物像に寄せた口調 | `TEACHERS`／`TEACHER_LINES`。既定 清少納言。端末ごと `localStorage kobun.chat.teacher`。絵は Canva 生成 `public/teachers/<id>-<tone>.webp`（画風は位階の肖像と同じ sharp／yuru／pop に追従） |
| 自分 | **今の位階の肖像から顔を丸く切る** | `FaceAvatar stageN tone` が `portraitForStage(n, tone).src`（w1200）を `PORTRAIT_FACES` の (cx, cy, d) で切る。名前は「{位階} ・ あなた」 |
| 対象 | 単語クイズだけ | 多義語モードは触らない（正解の巨大○ `showCorrectCircle` は多義語の ○×・例文理解が使うので残してある） |

### 先生5人と口調

| id | 先生 | 肩書 | 口調 | 決まり文句 | 言わないこと |
|---|---|---|---|---|---|
| `sei` | 清少納言 | 『枕草子』の作者 | 常体。きびきび断定、短く切る（次。／それだけ。）。ものごとを並べて評する「〜もの。」 | それ、いとをかし。／口惜し。 | くどい説明・しんみりした慰め・丁寧語・評語（可・難あり） |
| `murasaki` | 紫式部 | 『源氏物語』の作者 | 丁寧語（〜でございます・〜ましたね）。控えめで、答え方をよく見る | よくお気づきになりましたね。／惜しゅうございます。／お答え、拝見しました。 | 大声でほめる・断定して切り捨てる・からかう |
| `michizane` | 菅原道真 | 『菅家文草』の漢詩人、のちの学問の神 | 常体。字義・道理・学問。命令形（覚えよ・立ち返れ）。努力は認める | 道理にかなった答えだ。／字義に立ち返れ。／誤りも学問のうちだ。 | 軽口・からかい・理由を言わずにほめる／けなす |
| `tsurayuki` | 紀貫之 | 『古今和歌集』の撰者 | やわらかい常体（〜だね・〜だよ・〜てごらん）。「言葉の心」と「種・根・葉・芽」の比喩（仮名序の延長） | 言の葉の心をよく捉えた。／言葉は心を種として生まれる。 | 威圧・急かす・厳しい評語・責める |
| `teika` | 藤原定家 | 『新古今和歌集』の撰者・百人一首の選者 | 短く辛口の常体。歌合の判者の評語（可。／宜し。／難あり。）と判者の語（本筋・取る・評） | 可。／難あり。／本筋は〜。 | 長い説明・甘いほめ言葉・くだけた語尾・丁寧語 |
| `komachi` | 小野小町 | 六歌仙の一人・『古今和歌集』の歌人 | 静かな です・ます と「〜てみて」。言葉の響きと余韻、夢・花の色の比喩 | ええ、その言葉です。／もう一度、言葉を見つめてみて。 | 大声・早口・厳しい評語・後世の伝説（美女・百夜通い）を自分の事として語る |

**小野小町の追加（2026-11-12、ユーザー指示「小町だけ足す」）**：6人目。性格の軸（言葉の響きや余韻を大切にする・涼しい顔の奥に情熱）と正解・不正解の決まり文句はユーザー提示の案。根拠は `BRIEF-lines.md` の人物像（仮名序の小町評・「思ひつつ寝ればや」・「花の色は」。vault の `30-教材/古文/六歌仙.md` と語彙DBで照合）。絵は Canva 生成の 200px 下見3枚。台詞は他の5人と同じく `TEACHER_VOICE_ENABLED = false` の間は出ない。

**4人の追加（2026-11-12、ユーザー指示「今いるキャラはそのまま」「在原業平も入れる」）**：計10人。並びは `TEACHER_IDS` の順（既存6人のあとに追加順）。

| id | 先生 | 肩書 | 口調 | 決まり文句 | 言わないこと |
|---|---|---|---|---|---|
| `izumi` | 和泉式部 | 『和泉式部日記』で知られる恋の歌人 | くだけた常体と感嘆。成功を自分のことのように喜ぶ | 当たった！ 私までうれしい。／ああ、残念！ 次は一緒に決めよう。 | 冷たい評語・突き放す言い方・長い理屈 |
| `koshikibu` | 小式部内侍 | 和泉式部の娘・「大江山」の歌の作者 | 元気な常体。一緒に挑む先輩 | 決まった！ 次もいこう。／むむ。もう一問、挑戦しよう！ | 上からの説教・しんみりした慰め・丁寧語 |
| `ukyo` | 建礼門院右京大夫 | 『建礼門院右京大夫集』の作者 | 静かな丁寧語（〜ましょう・〜のです・〜てゆく） | ひとつずつ、重ねてゆきましょう。／ここから、覚えてゆけばよいのです。 | 急かす・大声でほめる・重い話を持ち込む |
| `narihira` | 在原業平 | 六歌仙の一人・『伊勢物語』の主人公のモデル | 軽やかな常体（〜さ・〜だな）。旅・花・都鳥の比喩 | さらりと当てたな。粋だ。／旅は回り道も景色のうちさ。 | 細かい理屈・厳しい評語・丁寧語・恋の武勇伝 |

和泉式部・小式部内侍・右京大夫の性格の軸と正解・不正解の決まり文句はユーザー提示の案（作品や逸話をもとにした創作設定）。業平の性格は仮名序の評「その心余りて詞たらず」から起こした創作設定（Claude 作成・教員未確認）。根拠は `BRIEF-lines.md` の人物像。照合 = vault（紫式部日記の和泉式部評・沢の蛍の歌・仮名序の業平評・東下りの都鳥・右京大夫集「なべて世の」の解題）と Web（小式部内侍の大江山の説話・右京大夫の星の歌。2026-11-12）。「ふみ」の掛詞（文・踏み）は未照合なので台詞に使っていない。絵は Canva 生成の 200px 下見 12枚。

**人物像の深掘り（2026-11-02 午後、ユーザー指示）**：各先生の像を厚くし、台詞を全部書き直した（correct・wrong 各6通り、ほかは2〜3通り）。清少納言＝『枕草子』の「〜もの」段の型（心ときめきするもの／ありがたきもの）・香炉峰の雪・「めでたし」「すさまじ（興ざめ）」／紫式部＝心の動きを読む「読み手」・学才を隠した慎み・「あはれ」／道真＝文章博士・天神（神頼みより復習）・梅の比喩／貫之＝仮名序の種と芽・「力をも入れずして」・水の流れ／定家＝判者の評語（可・よろし・難あり・秀逸・優）・推敲・本歌取り（例文＝本歌）・「紅旗征戎」の言い換え。`{正解}{現代語}{書いた意味}` は全員「 」で囲む。設定欄には選んでいる先生の人物像（`TeacherMeta.profile`）を1行出す。根拠は `BRIEF-lines.md` の「人物像」に限り、そこに無い史実・引用は書かない。

台詞の決まり（`BRIEF-lines.md`）：読者は高1、現代語が基本／古語は1吹き出しに1語まで／生徒を責めない／史実の引用は人物像に挙げた有名句以外は使わない（捏造禁止）／絵文字・記号はアプリ側が付ける／字数は全角で `{変数}`=15字（correct 18・wrong 40・trap 45・nearMiss 45・blank 35・pending 35・selfRight 25・selfWrong 25・coreLead 8・exampleLead 10・trapLead 10）／variant は意味を変えず言い回しだけ。
執筆 → 校閲（9件を差し替え：道真の「{正解}だ。」が「立派だだ。」になる二重語尾、道真と定家で一字違わなかった pending、3人共通だった「空欄か。」の書き出し、貫之と清少納言でほぼ同文だった nearMiss、定家の評語2つ重ね、人物化されていなかった清少納言の coreLead）→ 統合。`src/tests/teachers.test.ts` が字数・変数・本数・15枚の絵の実在を検査する。

## 1.5 史実調査と人物解説（2026-11-13、ユーザー指示「史実にできるだけ基づいて」「人物解説のページ」「論文含め調べて」）

- **調査**：10人を論文（CiNii・J-STAGE・機関リポジトリ）と一次資料（勅撰集の詞書・『紫式部日記』・『日本三代実録』の卒伝・「書斎記」ほか）で調べた。人物ごとの本体 = `F:\A2A\_work\kobun-chat-feedback\persona-research\<id>.md`（各項目に〔確〕〔調〕〔要照合〕）、食い違いと性格の軸の一覧 = 同 `SUMMARY.md`、指示書 = 同 `BRIEF.md`。
- **台詞の訂正**：道真「春な忘れそ」→「春を忘るな」（『拾遺集』『大鏡』の形）、抜き書き（書斎記）を足す／貫之「力をも入れずして、当てたね」を削る（主語は歌）、評は正確に／定家の「可」「よろし」「難あり」→ 歌合の「勝」「負」（言い切りの評語は定家の実例なし）／業平の旅の体験談（東下りは『伊勢物語』の話）を卒伝「放縦不拘、略無才学、善作倭歌」に寄せた言い方へ／清少納言に「私も最初は震えた」（「宮にはじめてまゐりたるころ」）。紹介文（`title`・`oneLiner`・`profile`）も史実に合わせた（定家は「百人一首の選者」を外した）。
- **人物解説**：設定の先生欄で先生をタップすると `src/components/quiz/TeacherDetailSheet.tsx` が開く（body へ portal・Esc で解説だけ閉じる）。上から 絵（176px。200px の下見をそのまま）→ 名前・時代 → **史実**（原文と出典を添える）→ **伝わる話**（説話・伝説。史実と区別）→ **先生キャラ**（このアプリの創作。性格の軸 ← どの史実から起こしたか、創作の部分）→ 出典（一次資料のみ。研究文献は調査メモ）→「この先生にする」。選ぶのは解説の中のボタン（タップで即選択はやめた）。中身 = `src/lib/teacherProfiles.ts`（史実の欄には調査で〔確〕〔調〕のものだけ。〔要照合〕は書かない）。テスト = `teachers.test.ts` の TEACHER_PROFILES（10人そろう・性格の軸に根拠がある・史実の欄に「春な忘れそ」「百人一首の選者」「絶世の美女」を書かない）。
- **まだ**：台詞は `TEACHER_VOICE_ENABLED = false` のまま（画面には出ない）。解説の文は AI 作成・教員未確認。絵は 200px の下見。

## 1.6 台詞を増やす・季節と行事のあいさつ（2026-11-13、ユーザー指示「コメントを大量に」「時期や年間の行事とも関連させたコメントも」「キャラは史実と異なっても良い」「コメントに注はつけない」）

- 決まりを変えた：台詞のキャラは史実と違ってよい（史実は人物解説の側）／古語に（ ）の注を付けない／短く。
- まず清少納言・菅原道真・紀貫之の3人：答え合わせは各状況6〜14文（`teacherLines.ts`）。
- あいさつ `src/lib/teacherGreetings.ts`：月ごと5文（旧暦の月名・年中行事・各人の季節の話）＋行事（正月・冬休み明け・共通テストの頃・節分・学年末・春休み・新学年・連休・考査の頃・七夕・夏休みの前・中・明け・冬休みの前・中）3文ずつ＋小テストの当日／あと N 日（`quiz_ranges.due_date`、7日前から）。行事の日は学校で違うので幅を取り、言い方をぼかす。選び方 `pickGreeting`＝小テストの当日・直前はそれだけ、ほかはその日の行事＋月の文から日付を種に1つ（その日は同じ一言）。
- まだ：画面に出す場所（開始画面・今日の分の終了画面の予定）、残り7人、流れ（連続正解など）・時間帯・何日ぶりのあいさつ。確認用の一覧 = `F:\A2A\_work\kobun-chat-feedback\review-lines-3.md`（`make-review.py` でデータから書き出す）。

## 2. 吹き出しの並び（`buildThread`）

上から順に。
1. **自分**：4択＝選んだ選択肢の表示名（`optionLabel`。逆引き・空欄は見出し語、それ以外は 〔 〕 を外した意味）、記述＝書いた文（空なら「（無回答）」）。
2. **判定**：4択は 正解→`correct`(○)／不正解→`wrong`(×)。記述は `writingResult.verdict` で correct→`correct`(○)／other_sense→`nearMiss`(△)／modern_trap→`trap`(△)／wrong→`wrong`(×)／blank→`blank`(×)／pending→`pending`(？)。保留で ○× が決まったら、その後ろに `selfRight`／`selfWrong`。
3. **正解の示し方**（記述・正解以外）：`SenseAnswerGuide`（どこまで書けば○か）。
4. **自己判定**（記述・保留・未判定）：「○ 合っていた」「× ちがった」。
5. **核イメージ**（`senseCore` があるとき）：`coreLead` → 🧭 語＝核。正解以外は 🔑 決め手を足し、正解のときは ⚠ 現代語の罠を同じ吹き出しに畳む。
6. **罠**（正解以外・`trap` があるとき）：`trapLead` → ⚠ 現代語「…」の罠。
7. **例文**（4択系の正解以外）：`exampleLead` → 古文（`MarkedSentence`、空欄は埋まった全文）→ 訳。例文から意味は訳だけ（本文は上のカード）。記述は出さない（上の例文カードが訳を出す）。
8. **ほかの意味**（正解以外・同じ見出し語の意味が2つ以上）。

台詞の variant は `pickVariant(lines.X, qid + ':' + X)` で決まるので、同じ問・同じ先生なら同じ言い回し（散らしたいときは seed を変える）。吹き出しは 80ms ずつずらして出す（`animate-slide-up`。`prefers-reduced-motion: reduce` ではアニメ無し）。

## 3. ファイルの地図

| ファイル | 役割 |
|---|---|
| `src/lib/teachers.ts` | 型（`TeacherId`・`TeacherMeta`・`TeacherLines`・`TeacherVars`）、`TEACHERS`（名前・かな・肩書・一言）、`teacherImage(id, tone)`、`fillTemplate`（`{語}{正解}{現代語}{書いた意味}` を置換。未定義は空文字で `{ }` を残さない）、`pickVariant`（FNV-1a で決定的に選ぶ） |
| `src/lib/teacherLines.ts` | 台詞の本データ 5人×11種（§1 の決まり。各先生の口調はコメントに） |
| `src/lib/chatTeacher.ts` | 先生の設定 `kobun.chat.teacher`（既定 `sei`、許可リスト外は既定に丸める）。`readChatTeacher`／`writeChatTeacher`／`useChatTeacher`（storage と CustomEvent `kobun:chat-teacher-change` を購読） |
| `src/lib/quizBackground.ts` | 背景の設定 `kobun.chat.background`（既定 `seigaiha`、名前 `QUIZ_BACKGROUND_LABEL`）。同じ型 |
| `src/lib/portraitFaces.ts` | 顔の表 `PORTRAIT_FACES`（3画風×21階）、`faceFor`、`faceImgStyle`（§5） |
| `src/lib/myStage.ts` | 今の位階を通信なしで読む `readMyStage()`（§6） |
| `src/lib/quiz/chatThread.ts` | やりとりを組む純関数 `buildThread`・`optionLabel`（DOM に触れない。§2） |
| `src/components/noble/FaceAvatar.tsx` | 丸い顔アイコン。`stageN/tone`＝肖像から切る、`src`＝先生の絵を `object-fit: cover` で等倍 |
| `src/components/quiz/ChatFeedback.tsx` | 吹き出しの描画・タップで次へ・○×・`aria-live` |
| `src/components/quiz/QuizLookSettings.tsx` | 設定パネル下の「先生」「背景」の2行（選択中は `aria-pressed`） |
| `src/components/quiz/QuizBackground.tsx` | 和柄の SVG（`QuizBackground`、設定の見本 `PatternSwatch`）。青海波 R=18、七宝 R=22 |
| `src/components/quiz/WordQuizContent.tsx` | 4択系・記述の結果ブロックを `ChatFeedback` に置き換え。正解時の自動 `onNext` を削除。内部 state のリセットは `question` の同一性でも走る |
| `src/App.tsx` | 正解の自動進行をやめる（`handleAnswer`・記述の正解・自己判定後は `setNextButtonVisible(true)`）／クイズ画面の最外 div を `--rw-bg`＋`QuizBackground`、中身は `relative z-[1]`／設定パネルの grid の下に `QuizLookSettings`／`logEvent` の `ctx.teacher` |
| `src/lib/storageKeys.ts` | `chatTeacher`・`chatBackground`（表示設定の区画。Export/Import の対象） |
| `src/index.css` | `.animate-slide-up` の reduced-motion |
| `public/teachers/<id>-<tone>.webp` | 先生の絵 15枚（200×200）。`teachers.test.ts` が実在を検査 |
| `assets-src/teachers/` | 原本（Canva の下見 PNG 15枚・200px）と `canva-links.md`（1264px 版へのリンク）。肖像の原本 `assets-src/portraits/` と同じ扱い＝git で持ち、採用版だけ commit |
| `src/tests/chatThread.test.ts`／`teachers.test.ts`／`portraitFaces.test.ts` | 組み立て（実データ数十語×5人×全形式）・台詞（字数・変数・本数・絵の実在）・顔の表（3×21・範囲・`faceImgStyle` の計算） |
| `docs/learning-events-design.md` §10.3 | 記録（`ctx.teacher`） |

守ったこと：`logEvent`／`markQuestionShown`／`recordAnswer`／`updateSrsState`／`recordQuizTypeCorrect`／`submitAnswer`／`userCorrectAnswer` の呼び出しと順序は変えていない。共有部品（`WordInsightPanel`・`ExampleDisplay`・`MarkedSentence`・`SenseAnswerGuide`・`writingVerdict.ts` の既存関数）は変えていない。先生・背景の状態は setupQuiz を再実行する useEffect の依存に入れていない。

## 4. 先生の絵を Canva の 1264px 版に差し替える手順

今の `public/teachers/*.webp` は Canva 生成の **200px の下見**を WebP にしたもの。本体は Canva 側に 1264×1264 で残っている。

1. `assets-src/teachers/canva-links.md` の表（5人×3画風、15リンク）を開き、各デザインを PNG で「ダウンロード」する。不採用の「博士」は使わない。
2. 1264px の PNG を `assets-src/teachers/<id>-<tone>.png` に**同名で置き換える**（今ある 200px の下見と入れ替わる。id = sei／murasaki／michizane／tsurayuki／teika、tone = sharp／yuru／pop）。原本は git で持つ方針なので、採用が決まった版だけ commit する（1枚 1〜2MB 見込み、15枚で 20〜30MB。試作は入れない）。
3. `public/teachers/<id>-<tone>.webp` を作り直す。アプリは 36〜40px で出すので 200px 正方形で足りる。`scripts/build-portraits.py` と同じ Pillow（quality 82・method 6）。cwebp／sharp はこの機に無い：
   ```python
   # リポ直下で python -I scripts/build-teachers.py（無ければこの中身で作る）
   import glob, os
   from PIL import Image
   for src in sorted(glob.glob('assets-src/teachers/*.png')):
       stem = os.path.basename(src)[:-4]
       with Image.open(src) as im:
           im = im.convert('RGB')
           if im.size != (200, 200):
               im = im.resize((200, 200), Image.LANCZOS)
           im.save(f'public/teachers/{stem}.webp', 'WEBP', quality=82, method=6)
   ```
4. 確認：`npx vitest run src/tests/teachers.test.ts`（15枚の実在）→ 画面で設定行（40px）とチャット（36px）のアイコンを見る。`FaceAvatar src` は正方形を `object-fit: cover` で等倍に入れるだけなので、**顔が中央にある正方形**が前提。顔が端に寄った絵なら Canva 側で切り直す。
5. 画風を足す・id を変えるときは `teacherImage()` の規則（`/teachers/<id>-<tone>.webp`）と `PortraitTone`（`src/lib/portraitTone.ts`）に合わせ、`teachers.test.ts` の `TONES`・名前の配列も直す。

## 5. 顔の表（`PORTRAIT_FACES`）の測り方と直し方

**何を入れるか**：画風 × 第 n 階（index = n−1）に `{ cx, cy, d }`（小数1桁）。cx, cy = 鼻の位置（画像の幅・高さに対する %）、d = 頭頂（冠・烏帽子・髪・纓の上端）〜あご の長さ（幅に対する %）。

**測った元**（2026-11-02）：`public/portraits/{stage,yuru-stage,pop-stage}-NN-w480.webp`（480×360）。`cx = 鼻x px / 480`、`cy = 鼻y px / 360`、`d = (あご − 頭頂) px / 480`。精度 ±3px（0.6〜0.8 ポイント）。画風ごとに1本のエージェントが、Read で目視 → Pillow で画素を分類した文字地図（暗部＝冠・髪／肌色／襟）→ 頭頂・あご・顔の左右端を px で読んだ。鼻 y の決め方は画風で少し違う（sharp：生え際＋(あご−生え際)×0.6、yuru：目の高さ＋(あご−目)÷4、pop：前髪の下端〜あごの約 55%）。

**検査の結果**：63件そろい、欠けなし。外れ値（隣の階と 15 ポイント以上、または画風の中央値と 15 ポイント以上）なし。隣との差の最大は sharp cy 第1→2階 8.4（第1階だけ座像で顔が低い）、yuru cy 第1→2階 9.7、yuru d 第8→9階 8.4（第9階は長い纓を含めた）。
画風の中央値（欠け・外れ値を補うときの既定）：**sharp (49.2, 18.9, 14.8)／yuru (48.2, 37.4, 28.3)／pop (50.4, 19.2, 15.6)**。

**描き方**（`faceImgStyle(face, boxPx, { aspect = 4/3, fill = 0.8 })`）：枠の中心に (cx, cy) を置き、頭の直径 d が枠の 8 割になるよう拡大する。W = boxPx×0.8×100/d、H = W×3/4、left = boxPx/2 − W×cx/100、top = boxPx/2 − H×cy/100（transform は使わない。WebKit で丸い枠の角が切れない対策）。元は w1200（顔を 6〜7 倍に拡大するので w480 では粗い）。

**注意（冠の上が欠ける）**：中心が鼻で d が頭頂〜あごなので、見える円の半径は 0.625d。鼻は頭の中心より 15〜20px（w480）下にあるため、背の高い烏帽子・纓の上端は欠ける。LINE のアイコンと同じで顔を大きく見せる割り切り。冠まで入れたいなら、①cy を頭の中心（(頭頂＋あご)/2/360。測定メモでは sharp 第2階 13.6%・第6階 11.5%）に寄せる、②d を 2×(鼻y−頭頂y)/480 に広げる（sharp 第2階 19.6・第6階 27.9）、③`FaceAvatar` の `fill` を下げる、のどれかを**画風ごとにそろえて**行う。

**直し方**：
1. 対象の w480 を測り直す（Pillow で該当範囲の画素を見る。目視だけなら `face-sheet.py` の一覧で寄せる）。
2. `src/lib/portraitFaces.ts` の値を書き換える（小数1桁。コメントの階名はそのまま）。
3. `npx vitest run src/tests/portraitFaces.test.ts`。
4. `python F:\A2A\_work\kobun-chat-feedback\face-sheet.py` で 63枚の切り出し一覧（`face-sheet-{sharp,yuru,pop}.png`、112px）を作って目で確かめる（Read する画像はこの3枚だけで済む）。
5. 肖像（`public/portraits/*-wNNN.webp`）を差し替えたら、その階の3値を測り直す（`nobleData.ts` の `PORTRAITS` と並びは別の表なので、片方だけ変えると顔がずれる）。

## 6. 位階はセッション中固定という割り切り

- `readMyStage()` = `effectiveStage(rankScoreOf(Object.values(readPeakTiers())))`。`localStorage kobun.noble.peakTiers`（単語ごとの最高到達★）から通信なしで計算する。
- `WordQuizContent` は問ごと（qid）に読み直すが、peakTiers を更新するのはホーム／学習履歴（`fieldMastery.ts` の `updatePeakTiers`）なので、クイズ中に★が増えても右のアイコンと位階名は変わらない。次にホームか学習履歴を開いたときに追いつく。
- 別端末・初回・localStorage 消去直後は 0 点＝第1階（無位・雑任）。`window` が無い環境（テスト）でも第1階。
- 理由：クイズのテンポと通信量。昇進の演出はホームに任せる（クイズ中に位階が変わって肖像が切り替わると、答え合わせの画面が落ち着かない）。

## 7. 記録

回答の出来事（`logEvent`、`action: 'answer'`）の `ctx.teacher` に、そのとき選ばれていた先生の id を入れる。足したのは呼び出し側（`src/App.tsx` の `handleAnswer` と `finalizeWriting`）だけで、`src/lib/learningEvents.ts` と表は変えていない。詳細は `docs/learning-events-design.md` §10.3。

## 8. 残課題

- **実機確認**（Playwright、sandbox 外）がまだ：吹き出しの見た目（見本 `mock-chat.png` と比べる）、タップで次へ（中の ○× ボタンが伝播を止めるか）、背景2種のテーマ追従、設定行の横スクロール、記述の保留→○×→タップの流れ、`aria-live` の読み上げ、貫之の `coreLead`（「この言葉の心は」「言の葉の種は」は句点なしで、次の行の「🧭 語＝核」につながって読めるか）。
- **台詞**（校閲の notes より。差し替え必須ではない）：道真・定家は `{書いた意味}` を「」で囲まないので、生徒の自由記述がそのまま文に入る（例「気がひけるも字義のうちだ」）。囲むと道真 nearMiss[2] が 47字になるので短縮が要る／`trapLead` が紫式部・道真・貫之とも「一つ、」で始まり型が揃いすぎ（道真を「戒めを一つ。」にすると散る）／「惜しい」系が5人中4人に出る（清少納言は「口惜し」が持ち味なので減らしてよい）／定家の「宜し」は高1が「よろし」と読めるか、ふりがな無しでは怪しい／`{正解}` が15字を超える語（例「（こちらが気後れするほど）立派だ」18字）は上限ぎりぎりの行で展開後に長くなる（折り返すので壊れないが、見た目は実機で）。
- **顔の表**：冠・烏帽子の上端が欠ける（§5）。実機で気になれば画風ごとに cy か d をそろえて直す。
- **先生の絵**：200px の下見のまま。1264px 版への差し替えは §4。
- **仕様から変えた点**：`showCorrectCircle`（正解の巨大○）は仕様では削除だったが、多義語の ○×・例文理解が使うので残した（単語クイズでは使わない）。
- **集計**：先生別の正答率・継続の集計は教員画面にまだ無い（`ctx.teacher` は入っている）。
- 先生を増やすときは、id を `TeacherId`・`TEACHER_IDS`・`TEACHERS`・`TEACHER_LINES` に足し、絵を3画風ぶん置き、`teachers.test.ts` の名前の配列を直す。台詞は BRIEF の検査5項目（史実の範囲・古語1語・変数の綴り・字数・5人を並べて入れ替え不能か）を通す。

## 9. 台詞なし版で公開（2026-11-02）
ユーザー指示「まずコメントなし版をデプロイ」。`src/lib/teachers.ts` の `TEACHER_VOICE_ENABLED = false` の間は、先生の口調を使わず中立の文（`teacherLines.ts` の `NEUTRAL_LINES`）で答え合わせし、設定欄の人物紹介も出さない。先生の絵と選択・背景・タップで次へは公開。台詞は原典で照合してから `true` にする（人物・言い回しの調査 `F:\A2A\_work\kobun-chat-feedback\teacher-persona-lines.md`）。
