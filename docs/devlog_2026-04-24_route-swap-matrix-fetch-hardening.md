# kobun-tan 開発ログ — 2026-04-24（ルート swap・マトリクス UI・fetch 堅牢化・テスト整備）

**本番 URL**: https://kobun-tan-delta.vercel.app
**Vercel プロジェクト**: `kobun-tan`
**Supabase プロジェクト**: `qebmrgfkogciwurvnccr`
**セッション対応者**: Claude Opus 4.7 (1M context)

---

## 0. セッション概要

2026-04-23 の大改修に続いて、翌日は「構造と UX の整理」「学校ネット耐性の強化」「コードの保守性向上」を中心に実施。
コミット総数: **9 本**（`707a531` → `efeaa6b`）、すべて `origin/main` に push 済。

テーマ:
1. Phase 2 bundle 化（index 系 JSON も同梱）
2. ルート swap（/ を単語クイズに戻し、/read 配下へ読解）
3. 単語 ⇔ 読解 の相互ナビ
4. 時代×ジャンルマトリクス UI / 基本データ縦並び
5. vercel.json SPA fallback 修正
6. C-7 Phase 4-b 匿名データ移行 + fetch fail UX + adminSession 抽出 + smoke テスト
7. コード分割（/read 遅延ロード）
8. matchSense / srsEngine / grammar triage + 継続 App.tsx 分割
9. rate limit / devlog

---

## 1. 完了した変更（コミット別）

| SHA | 概要 |
|-----|------|
| `707a531` | 学校ネット対応 Phase 2 — vocab / texts / texts-v3 の index.json も bundle 同梱（`.gitignore` も `src/data/*.json` exempt 追加） |
| `a0308e6` | ルート swap: `/` → 単語、`/read` → 読解 v3。全内部リンク更新 |
| `ef94f69` | 単語 ⇔ 読解 相互ナビ（ボタン・ショートカットグリッド） |
| `d1865d5` | HomeV3 を **時代×ジャンル マトリクス**に刷新 / VocabModal 基本データ項目の縦並び表示 / 教材ボタンを読解に集約 |
| `b07aa3c` | vercel.json の SPA fallback rewrite で `/texts-v3/*.json` 等が `/` に誤書換されていたバグ修正（`/((?!api/)[^.]*)` パターンへ） |
| `f8b9044` | C-7 Phase 4-b 移行 + fetch fail UX + adminSession 抽出 + smoke テスト |
| `(code split)` | /read 配下を React.lazy で遅延ロード（初回 bundle 788→678 KB / gzip 260→233 KB） |
| `(more tests)` | normalizeSense / srsEngine のピュア関数に smoke テスト（計 32 件 pass） |
| `(this devlog)` | 継続 App.tsx 分割 + grammar.test トリアージ + rate limit + devlog |

---

## 2. Phase 2 bundle 化（`707a531`）

### 背景
2026-04-23 に `kobun_q.jsonl.txt` のみ bundle 化したが、残る以下が runtime fetch のまま:
- `/vocab/index.json`（4 箇所参照）
- `/texts/index.json`（4 箇所参照）
- `/texts-v3/index.json`（2 箇所参照、HomeV3 の必須データ）
- SearchPage が `dataParser` を介さず直接 `/kobun_q.jsonl.txt` を再 fetch する既存バグ

### 実装
- `src/data/vocabIndex.json` (57 KB) / `textsIndex.json` (44 KB) / `textsV3Index.json` (64 KB) を新設（public/ からコピー）
- 以下の fetch を import に置換:
  - App.tsx / VocabModal / TextDetail / SearchPage → `vocabIndex.json`
  - VocabModal / TextsIndex / SearchPage / Teacher → `textsIndex.json`
  - HomeV3 / TextExampleCard → `textsV3Index.json`
  - SearchPage → `kobunQ.json`（既存 bug 併せて解消）
- `.gitignore` の `*.json` 全一致を `!src/data/*.json` で exempt。Phase 1 で追加されていた `kobunQ.json` が untracked だったバグも併せて修正

### 副次効果
- 初回 bundle +166 KB raw / 約 +27 KB gzip
- 学校ネットでも HomeV3 / 検索 / 解説モーダル / 教材一覧の index 取得が確実に動作

---

## 3. ルート swap（`a0308e6`）

### 動機
2026-04-23 のセッションで `/` が HomeV3（読解）にマップされており、単語クイズ本体は `/quiz` 以下。単語暗記がメイン動線なのに入口が読解画面というのが UX 的にねじれていた。

### 変更
```
/                     → App (単語クイズ)
/teacher / /search / /texts / /texts/:id / /test-grading
/read                 → HomeV3
/read/texts/:textId   → TextReader
/read/texts/:textId/guide
/read/reference[/:topicId]
/read/vocab
```

内部リンク 20 箇所以上を更新。App.tsx の `href="/quiz/teacher"` dead link も `/teacher` に修正。

---

## 4. 時代×ジャンルマトリクス（`d1865d5`）

### 動機
HomeV3 の作品一覧が「単なるカード縦並び」で、読みたい時代・ジャンルの作品を探しにくかった。ユーザー要望:「作品の並べ方の順番を時代とジャンルのマトリクスにして。縦軸を時代。」

### 実装
- **縦軸**: 奈良 / 平安 / 鎌倉 / 室町 / 江戸 / 近代 / その他
- **横軸**: 物語 / 日記 / 随筆 / 説話 / 評論 / 和歌 / 俳論 / 芸能 / 小説 / 伝承 / その他
- 「物語（一）／（二）／（三）」等は末尾連番を落として基底ジャンルに正規化（列数抑制）
- 検索入力のみ残し、時代・ジャンル・作者のドロップダウンフィルタは撤去（マトリクス自体が視覚フィルタを兼ねる）
- 公開制御: `getPublishedSlugs()` を呼んで filter。**教員画面の既存「教材公開管理」がそのまま読解の表示制御にもなる**（両者は同一 slug 集合）
- CSS: `HomeV3.css` 新設、横スクロール可の CSS Grid

### 関連修正
- VocabModal「基本データ」内の `<p><strong>品詞</strong>: ...\n<strong>漢字</strong>: ...</p>` が 1 段落に詰まっていたため、改行 + `<strong>` 境界で `</p><p>` に分割する `formatBasicData` を追加。活用・接続・語源など 92 種のラベルすべてに効く
- ナビから 教材（📚）ボタンを削除し、読解（📚 emerald）に集約（両者の役割重複を解消）

---

## 5. vercel.json SPA fallback 修正（`b07aa3c`）

### 現象
本番の `/read/texts/{id}` で「テキストが見つかりません」。`curl -I /texts-v3/xxx.json` すると **HTTP 200 だが Content-Type が text/html**（= index.html が返っていた）。

### 原因
vercel.json の rewrite:
```json
"source": "/((?!api|assets|pwa-|manifest.webmanifest|registerSW.js).*)"
```
ネガティブ先読みが不足しており、`/texts-v3/xxx.json` / `/vocab/xxx.html` / `/analysis/` / `/reading/` / `/guides/` / `/grammar/` 等の静的ファイルが全部 `/` に書き換えられていた。既存コミット `376a9b0` から潜在していたバグが、HomeV3 ルート swap で顕在化。

### 修正
```json
"source": "/((?!api/)[^.]*)"
```
- api 配下は Vercel Functions が捌くので除外
- パスに `.` を含まない（= 拡張子なし）場合のみ SPA 書き換え
- 将来 `public/` に新しい静的ディレクトリを足しても追加調整不要

---

## 6. 認証・データハードニング（`f8b9044`）

### 6.1 C-7 Phase 4-b — legacy `anon_*` を `auth.uid` に rekey

#### 設計
- `api/submitAnswer.ts` に `action: "migrate"` 分岐を同居（Vercel Hobby 12 関数上限を維持）
- Client (`anonAuth.ts`): `ensureAnonSession()` 成功時に `localStorage.anonId` を検出したら一度だけ migrate を叩く。`anonId_migrated` フラグで再呼び出し抑止
- Server: `toUserId` が既に word_stats を持っていたら skip（**idempotent**）。空なら rekey
- `supabase/migrations/005_anon_migration_notes.sql`: 運用ノート（DDL 変更なし）

#### セキュリティ考慮
- `toUserId` はクライアント申告だが、orphan 行を吸収するだけなので他ユーザーの有効データには影響せず
- 本セッション追加で warm-instance 単位の in-memory rate limit（同一 IP / 60 秒 / 5 回）を付与

### 6.2 runtime fetch の fail モード改善

新設 `src/lib/fetchJson.ts`:
- `FetchJsonResult = ok | {kind: 'not-found' | 'intercepted' | 'network'}`
- HTTP 200 OK でも `content-type: text/html` なら `intercepted` 扱い（Umbrella 認証壁 or SPA fallback 誤動作）
- JSON parse 失敗も `intercepted` として扱う

適用: TextReader / TextDetail / TextGuide。`intercepted` の場合は「学校ネットワーク環境可能性」メッセージ + リロードボタンを表示、`not-found` は従来どおり「見つかりません」で出し分け。

### 6.3 adminSession 抽出

`App.tsx` の `hasAdminSession` と `Teacher.tsx` の `logoutAdmin` / `clearAdminToken` を `src/lib/adminSession.ts` に集約。Teacher.tsx は re-export で後方互換維持。

---

## 7. コード分割

### Before
単一 bundle: **788 KB raw / 259 KB gzip**

### After（React.lazy + Suspense）
- 初回 bundle: **678 KB raw / 233 KB gzip** (約 -10%)
- 遅延 chunks:
  - ReferenceTopic: 38 KB / 7.9 KB gzip
  - Teacher: 27 KB / 7.9 KB gzip
  - TextReader: 16 KB / 5.2 KB gzip
  - TextDetail / SearchPage / TextGuide / HomeV3 / TextsIndex / ReferenceHome / VocabPage: 各 2〜7 KB / 1〜3 KB gzip

単語ユーザーが /read を触らない限りこれらは ロードされない。

---

## 8. テスト整備

### 新規 smoke テスト（計 32 件 pass）
- `src/tests/fetchJson.test.ts` — 6 件（200 HTML / 404 / 5xx / throw / 壊れた JSON の判定）
- `src/tests/adminSession.test.ts` — 4 件（cookie / localStorage 経路判定）
- `src/tests/normalizeSense.test.ts` — 10 件（歴史的仮名、プレースホルダ除去、漢字かなゆれ吸収）
- `src/tests/srsEngine.test.ts` — 12 件（Leitner box 進行、次回 review 日付計算）

### srsEngine の整理
- `nextBox(currentBox, isCorrect)` と `getNextReviewDate(box, now)` をピュア関数として export
- `updateSrsState` 内部で利用。副作用部分（DB 書き込み）とロジックを分離

### 既存 grammar.test.ts の 9 件 fail（トリアージ済・未修正）
詳細は `src/tests/grammar.test.ts` 冒頭コメントに分類記録:
- formGuesser / morphTokenizer のデータ駆動同定漏れ（辞書不足 or tokenizer 優先度）
- validateConnections の係り結び判定差分
- gradeWithMorph のスコア閾値／重みドリフト

修正は `public/grammar/*.json` の辞書完全性確認 → 実装論理修正 → テスト値更新の順で後日。

---

## 9. App.tsx 継続分割（1701 → 1631 行）

### 抽出
- `src/components/IndexModal.tsx`（90 行弱の索引モーダル JSX）をプレゼンテーション component として切り出し
- 親 App が state を保持、子は props のみで動く

残り 1631 行はまだ分割余地あり（クイズロジック本体、範囲選択、レスルト画面など）。次セッションの対象。

---

## 10. 重要な判断・トレードオフ

### 10.1 マトリクス UI での時代×ジャンル結合
物語（一）〜（三）、随筆（一）〜（二）、評論（一）〜（二）等の分冊表記を **正規化して基底ジャンルに寄せる**判断:
- Pros: 列数が 16 → 11 で大幅に見やすく
- Cons: 分冊単位で見たいニーズがあれば粒度が落ちる
- 今回は UX 優先で結合。分冊区別が欲しくなったら badge 表示等で補完可能

### 10.2 migrate 認証のゆるさ
`toUserId` はクライアント申告。なりすましで他者の orphan データを自アカウントに統合できるが、
- orphan データは RLS で anon 側からは UNREACHABLE（= 実質「捨てられた」データ）
- 攻撃者にとってのメリットが低い（認証済みアカウントの既存データには影響しない）
- idempotent skip（target に既存データがあれば何もしない）で、アクティブアカウントへの悪影響は閉塞

より厳密にやるには Supabase JWT を API に送って server で検証する必要があるが、Phase 4-b の範囲外。C-8 Step 2 と合わせて将来検討。

### 10.3 vercel.json の rewrite パターン
「ドット有無」による判別は将来拡張に強いが、拡張子なしの静的ファイル（例: `/CNAME`、`/robots.txt` 相当）を置いた場合に壊れる。現状はそういうファイルが無いので採用。将来追加するなら negative lookahead に逐次追加。

### 10.4 コード分割
React.lazy は遅延ロード中の flash of fallback が発生しうる。`Suspense fallback={<Fallback />}` で「読み込み中…」を出すようにしたが、/read に初回直接アクセスするとワンテンポ待たされる。
- 代替案: /read 遷移トリガで prefetch（`<link rel="prefetch">` 生成）
- 本セッションでは実装せず。ユーザー動線を見て必要なら対応

---

## 11. 次回セッションに向けた未完了

### 短期（次回セッション候補）
- **migrate の server-side 認証強化**（Supabase JWT 検証）
- **examples.json / texts/*.json / vocab/*.html の bundle 化判断**（学校ネット実機テスト結果次第）
- **App.tsx 更なる分割**（クイズロジック本体 → 別ファイルへ）
- **grammar.test 9 件の根因対処**（辞書整備→実装）

### 中期
- **C-8 Step 2**: レガシー token 経路（`x-admin-token` header / `?token=` query / `localStorage`）削除。1-2 週間運用で端末が新 cookie に移行したのを見てから
- **Vercel Cron `/api/aggregateCandidates` の定期実行ログ確認**（`CRON_SECRET` 設定 + 実行履歴）
- **Supabase Dashboard で Anonymous Sign-in ON**（まだなら）
- **migration 004 / 005 の SQL 適用**（まだなら）

### 長期
- **PWA selfDestroying 解除**（学校ネットで SW 実装に耐えるパターンが確認できれば offline 機能復帰）
- **テスト CI 化**（GitHub Actions で vitest 実行、grammar.test の既知失敗は除外設定）

---

## 12. ユーザー手動操作（申し送り）

1. **Vercel env**:
   - `TEACHER_USERNAME` / `TEACHER_PASSWORD` / `CRON_SECRET`（未設定なら）
   - 設定後 Redeploy
2. **Supabase Dashboard**:
   - Anonymous Sign-in を ON（未なら）
   - SQL Editor で `004_rls_tighten.sql` 実行（未なら）。これが済んでいないと C-7 Phase 4-b の migrate 効果が出ない
3. **本番動作確認**: `https://kobun-tan-delta.vercel.app/` / `/read` / `/read/texts/{slug}` / `/teacher`

---

## 13. ファイル変更サマリ

### 新規作成
- `src/data/vocabIndex.json` / `textsIndex.json` / `textsV3Index.json`
- `src/pages/HomeV3.css`
- `src/lib/adminSession.ts`
- `src/lib/fetchJson.ts`
- `src/components/IndexModal.tsx`
- `src/tests/fetchJson.test.ts` / `adminSession.test.ts` / `normalizeSense.test.ts` / `srsEngine.test.ts`
- `supabase/migrations/005_anon_migration_notes.sql`

### 修正（主要）
- `src/main.tsx`（ルート swap + 遅延ロード）
- `src/App.tsx`（ナビ整理、adminSession import、IndexModal 抽出、テキスト一覧 2 → 2 列）
- `src/pages/HomeV3.tsx`（マトリクス UI + 公開制御）
- `src/pages/TextReader.tsx` / `TextGuide.tsx` / `TextDetail.tsx`（fetchJsonAsset 化 + fail UX）
- `src/pages/Teacher.tsx`（adminSession 集約、テキスト index bundle 化）
- `src/pages/TextsIndex.tsx` / `SearchPage.tsx`（index bundle 化）
- `src/components/VocabModal.tsx`（基本データ縦並び）
- `src/components/kobun/TextExampleCard.tsx` / `GrammarPopover.tsx`（/read 系リンク）
- `src/lib/anonAuth.ts`（migrate 起動）
- `src/lib/srsEngine.ts`（ピュア関数切り出し）
- `src/lib/wordStats.ts`（無変更、srsEngine 経由で利用）
- `src/tests/grammar.test.ts`（冒頭にトリアージコメント）
- `api/submitAnswer.ts`（action=migrate 分岐 + rate limit）
- `vercel.json`（SPA fallback 修正）
- `.gitignore`（src/data/*.json exempt）

---

**ログ作成日**: 2026-04-24
**セッション終了時点の git HEAD**: 本コミット
