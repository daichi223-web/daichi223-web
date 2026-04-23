# kobun-tan 開発ログ — 2026-04-23（認証ハードニング・学校ネットワーク対応）

**本番URL**: https://kobun-tan-delta.vercel.app
**Vercel プロジェクト**: `kobun-tan`
**Supabase プロジェクト**: `qebmrgfkogciwurvnccr`
**セッション対応者**: Claude Opus 4.7 (1M context)

---

## 0. セッション概要

2026-04-23 に実施した本番稼働中アプリ `kobun-tan` への大規模改修セッションの記録。

大きな流れ:
1. UX 改修（章区分タブ廃止、Pull-to-Refresh）
2. 優先 A（すぐ系 fix: 空 sense, group 43 欠番, Vercel Cron）
3. 優先 B（便利系: srsEngine 配線, npm scripts 化, 教材公開 絞込一括操作）
4. 教員ログインをトークン貼付から ID/パスワード に変更
5. 優先 C（セキュリティ: C-8 cookie 化, C-7 生徒 RLS auth.uid 化）
6. 本番デプロイと動作確認
7. 学校ネットワーク（Cisco Umbrella SWG）環境対応

コミット総数: **6 本**（376a9b0 → 44e211b）、すべて origin/main へ push 済。

---

## 1. 完了した変更（テーマ別）

### 1.1 UX 改修

| 項目 | 実装 |
|------|------|
| 章区分タブ（読解必修 / 入試必修 / 最重要敬語 / 入試重要 / 入試攻略）の全廃止 | `App.tsx` 索引モーダル・単語モードの章クイック選択、`SearchPage.tsx` の章フィルタを削除。`indexChapterFilter` / `chapterFilter` 状態も削除。`CHAPTERS` の直接 import も除去（`chapterFor` / `chapterColor` はバッジ用途で継続利用） |
| 単語横の小バッジのみ残存 | 索引モーダル内のバッジ（`App.tsx:1143-1150`）と検索結果のバッジ（`SearchPage.tsx:401-408 / 449-456`）は保持 |
| 下ドラッグでハードリロード | `src/components/PullToRefresh.tsx` 新設。scrollY === 0 時のみ発動、80px で判定、離すと `caches` 全消去 + SW unregister + cache-bust クエリ付き `location.replace`。touch / pointer（マウス）両対応 |

### 1.2 優先 A — devlog 既知問題の潰しこみ

| 項目 | 判断 | 実装 |
|------|------|------|
| A-1: 空 sense 3件（530/538/540） | kokugo-vault MD 参照で出典有無を個別判定 | ・**くもゐ 265-4**: vault MD に 4つ目の意味が無い → **削除**（創作禁止ルール）<br>・**かぎり 268-4**: vault MD ❹ に「限度・この上ない」あり → **「この上ない」で充足**<br>・**かたみ 270-1 (名詞)**: qid 270-1 が「かたみに」と衝突する 1群2lemma 既知問題 → **削除**（衝突回避） |
| A-2: group 43 欠番 | 周辺データ調査で `げに` が word_idx=43 のまま group=42 / qid=42-1 に押し込まれている事を発見。これが **group 43 欠番 AND 1群2lemma** の同一原因と判明 | `げに` を group=43 / qid=43-1 に移設 → 両問題を 1 件の修正で解消 |
| A-3: Vercel Cron | 認証方式を追加実装 | `vercel.json` に `crons` エントリ追加（`0 18 * * *` = 03:00 JST 日次）。`api/_requireStaff.ts` に `Authorization: Bearer <CRON_SECRET>` パスを追加。env `CRON_SECRET` が必要（ユーザー設定） |

### 1.3 優先 B — 便利機能の追加

| 項目 | 実装 |
|------|------|
| B-4: srsEngine を App.tsx 配線 | `App.tsx` の 3 箇所（handleAnswer / handleTrueFalseAnswer / handleWritingSubmit）の `recordAnswer` に並んで `updateSrsState` を発火。`handleWritingUserJudgment` では partial 以外で手動判定オーバーライド |
| B-5: ビルドスクリプト npm 化 | `package.json` に `build:match` / `build:vocab` / `build:examples` / `build:texts-extract` / `build:texts-enrich` / `build:texts` / `build:data` を追加（python ラッパー） |
| B-6: 教材公開の絞込一括操作 | `Teacher.tsx` TextsManageView に ジャンル・時代 フィルタ select を追加、「絞込分を公開/非公開」ボタンで filtered 集合を一括更新。「絞込をクリア」ボタンで全条件リセット |

### 1.4 教員ログイン刷新（トークン → ID/パスワード）

- **旧**: LoginForm に 64 文字トークンをペーストする方式（UX 悪・パスワード管理困難）
- **新**: ID + Password 2 フィールドのログインフォーム
- 新規 env: `TEACHER_USERNAME` / `TEACHER_PASSWORD`（Vercel 側でユーザーが設定）
- 最初 `api/teacherLogin.ts` を新設したが **Vercel Hobby 12 関数上限に到達**（aggregateCandidates デプロイが 13 functions で失敗）→ **textPublications.ts に `action: "login"` ブランチ同居** に refactor
- 認証は `timingSafeEqual` で constant-time 比較

### 1.5 C-8 Step 1 — 管理者認証の cookie 化（段階移行）

**現状**: ADMIN_VIEW_TOKEN を localStorage に保存（XSS 脆弱）。
**目標**: HttpOnly cookie 化で XSS 耐性を持たせる。

実装:
- `api/_requireStaff.ts`: 認証パスを 3 段に拡張
  1. `Authorization: Bearer <CRON_SECRET>`（Cron）
  2. **Cookie `admin_session`**（HttpOnly、新）+ 状態変更リクエストは `admin_csrf` cookie + `x-csrf-token` header の double-submit 検証
  3. レガシー `x-admin-token` header / `?token=` query（段階移行期のみ残存）
- `api/textPublications.ts` `handleLogin`: ログイン成功時に `Set-Cookie: admin_session=<TOKEN>; HttpOnly; Secure; SameSite=Strict; Max-Age=30d` + `admin_csrf` を発行。JSON body にも `token` を返してレガシー互換維持（Step 2 で削除予定）
- 新 `handleLogout`: `action: "logout"` で両 cookie を失効
- `Teacher.tsx` `callAPI`: `credentials: 'include'` + CSRF header 付与。既存 localStorage token も互換で送信
- `logoutAdmin()` ヘルパーを追加（cookie 失効 API + localStorage 消去）

### 1.6 C-7 — 生徒 RLS を auth.uid() 化

**現状**: `word_stats` / `srs_state` の RLS が `using (true)` で実質無効。
**目標**: Supabase Anonymous Sign-in + 厳格 RLS で生徒間の相互アクセスを遮断。

実装:
- `src/lib/anonAuth.ts` 新設: 起動時 `supabase.auth.signInAnonymously()` で匿名 JWT セッション確立。promise キャッシュで重複呼び出し抑止
- `src/lib/wordStats.ts` `getUserId` を **async 化**。第一選択 `auth.uid`、失敗時 localStorage anonId フォールバック
- `src/lib/srsEngine.ts`: 4 箇所の `getUserId()` を `await getUserId()` に更新
- `src/main.tsx`: 起動時に `ensureAnonSession()` を fire-and-forget
- `supabase/migrations/004_rls_tighten.sql` 新設:
  - 既存 `using (true)` policy を全 `drop`
  - `auth.uid()::text = user_id` ベースの 6 policy（word_stats × 3 op、srs_state × 3 op）に置換
- `anonAuth.ts` の失敗時メッセージを `console.error` で強調表示（Dashboard 操作の案内文を埋め込み）
- **データ移行戦略**: 4-a/4-b/4-c のうち **「厳格 RLS 後も既存 anon_* 行を DB に残置」** を採用。anon_* は auth.uid と一致しないため anon key からは UNREACHABLE（事実上オーファン化）。service_role では到達可能。ユーザー体感は履歴リセットだがデータは保全。

### 1.7 Polish

- `App.tsx:1041` dead link `/teacher` → `/quiz/teacher` 修正
- `App.tsx` 教員ナビ表示判定を `localStorage.getItem('ADMIN_VIEW_TOKEN')` から `hasAdminSession()` ヘルパーへ（`admin_csrf` cookie の有無を主判定、localStorage は互換フォールバック）
- `Teacher.tsx` 管理画面に常設ログアウトボタンを追加

### 1.8 学校ネットワーク（Umbrella SWG）対応

**現象**: 学校 PC から https://kobun-tan-delta.vercel.app にアクセスすると、Cisco Umbrella SIG（`federation-sig.federationsigprod.qq.p1.nrt2.opendns.com`）が一部 HTTPS 通信を SAML 認証壁（Microsoft Azure AD tenant `e14eceaf-9b45-4c8b-b475-01ee5d6e3a7d`）に横取り。

観測されたシンボル:
- `<title>Redirecting to Identity Provider</title>` が fetch レスポンスに返る
- `X-SIG-Umbrella-SAML=<base64>` query が付く
- `[AssetView Web-Extension3]` ブラウザ拡張も同時に動作

**フェーズ A 対応**: `/kobun_q.jsonl.txt` を JS bundle に取込
- `node -e` で JSONL 741 行 → JSON 配列に変換して `src/data/kobunQ.json` に出力
- `dataParser.ts` の `fetch('/kobun_q.jsonl.txt')` を廃止、`import bundledKobunQ from '../data/kobunQ.json'` に置換
- 初回 bundle が +250KB（gzip +50KB）だが追加ネットワーク往復ゼロ
- 結果: 生徒の単語クイズは学校ネットワークでも動く見込み

**フェーズ B 対応**: Service Worker を selfDestroying に
- Umbrella が SW の `importScripts('/workbox-xxx.js')` をリダイレクト → `a redirected response was used for a request whose redirect mode is not "follow"` で SW 初期化失敗 → アプリ起動不可
- `vite.config.ts` の `VitePWA` に `selfDestroying: true` を設定
- 既存端末の壊れた SW を強制 unregister + caches 全消去する特殊 SW を発行
- `globPatterns` / `runtimeCaching` は不要になったため削除
- オフライン機能は喪失するが、代わりに学校ネットワークで起動可能になる

---

## 2. 技術的な判断ログ（代替案と選択理由）

### 2.1 Vercel 12 Functions 上限ヒット

**症状**: 新規 `api/teacherLogin.ts` 追加時に `No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.` で deploy 失敗。

**調べた結果**: 累積で 13 endpoint（+ teacherLogin）になっていた。`_*.ts`（helpers）はカウント外。

**検討した選択肢**:
- (a) Pro プランに upgrade（$20/月）
- (b) 別の低頻度 endpoint を削除（deleteAllData など）
- (c) teacherLogin を既存 endpoint に同居

**採用**: (c) — 破壊ゼロで追加コスト無し。`textPublications.ts` に `action: "login"` ブランチで同居。login / logout は認証不要なので requireStaff の前で早期リターン。フロントの fetch 先を `/api/textPublications` に変更。

### 2.2 C-7 データ移行戦略

**選択肢**:
- (4-a) truncate して clean start — 最速、全履歴消失
- (4-b) 既存 anon_* → auth.uid の紐付けを実装 — 安全だが実装複雑、migration script + Vercel Hobby 関数上限との戦い
- (4-c) RLS で両方許容する移行期間 — 穴が残る

**採用**: **(4-b の亜種)** — 厳格 RLS を適用しつつ、既存 anon_* 行は物理削除せず論理的に UNREACHABLE 化。
- ユーザー体感は 4-a と同じ（履歴リセット）だが DB には残る
- 将来「全履歴を merge したい」と言われたら service_role で復旧可能
- migration 1 本で済むシンプルさ

### 2.3 C-8 Step 1 段階移行

**選択肢**:
- 一気に cookie-only に切替 → 既存 localStorage ユーザーが即時ログアウト
- 両方受付（Step 1）→ 1-2週間運用 → レガシー削除（Step 2）

**採用**: 段階移行。現在の全教員（実質 1 名〜少数）が新ログインで cookie 化するまで両経路維持。

### 2.4 Anonymous Sign-in が失敗した場合のフォールバック

**現状**: Supabase Dashboard で Anonymous Sign-in が OFF のとき `signInAnonymously()` は 422。

**選択肢**:
- 失敗時に大きな UI 警告を出す
- console.error だけ出してサイレント継続

**採用**: 後者 + フォールバック。`getUserId` は auth.uid が取れなければ localStorage anonId を返す。RLS は厳格化後なので書き込みは silent fail するが、読み取りや UI 動作は壊れない。console.error に Dashboard 操作案内を埋め込んで管理者が気付けるようにした。

### 2.5 Umbrella 対応のアプローチ選択

**選択肢**:
- (α) Umbrella 管理者に許可リスト追加を依頼 — 正道だが時間がかかる
- (β) カスタムドメインを取得 — 有料、Umbrella の分類次第
- (γ) 全 runtime fetch を JS bundle に取込 — 初回 bundle が膨らむが確実
- (δ) Service Worker を無効化 — PWA 機能喪失、起動は確実化
- (ε) 別プロバイダに移行（Cloudflare Pages 等） — 移行コスト大

**採用**: **(γ) + (δ) の併用**。
- kobun_q（必須データ）を bundle 化でコアクイズは動く
- SW selfDestroying で既存の壊れた SW を清掃
- examples.json / texts/*.json / vocab/*.html は拡張子が .json / .html なので Umbrella を通る可能性を期待（未検証）
- 通らなかったら同様に bundle 化で対応

---

## 3. コミット一覧

| SHA | メッセージ | 概要 |
|-----|------|------|
| `376a9b0` | feat: UX改修・教員認証リニューアル・優先A/B対応・Firebase→Supabase移行 | 累積分 + 本セッション前半。UX / A-1..3 / B-4..6 / 教員ログイン UI / Firebase→Supabase マイグレ等を一括 |
| `bc0226a` | fix: 教員ログインを textPublications に統合（Vercel Hobby 12 関数上限対策） | teacherLogin.ts を削除、textPublications.ts に action=login ブランチ追加 |
| `edb3f9b` | feat: 認証ハードニング — 管理 cookie 化 (C-8 Step 1) + 生徒匿名 Auth + RLS (C-7) | cookie + CSRF、Anonymous Sign-in、RLS migration 004 |
| `bd4718e` | polish: 教員ナビの判定をcookie化、ログアウトボタン、anon-auth 失敗時の警告 | hasAdminSession helper、dead link fix、ログアウト UI、anonAuth warning |
| `bf07c80` | fix: 学校ネットワーク対応 — kobun_q データを JS bundle へ取込 | kobunQ.json を src/data/ に新設、dataParser を import 化 |
| `44e211b` | fix: Service Worker を selfDestroying に切替（Umbrella importScripts 問題回避） | VitePWA に selfDestroying:true、workbox 設定削減 |

すべて `origin/main` に push 済、Vercel 本番にデプロイ済。

---

## 4. Vercel 環境変数（必須）

| 変数 | 用途 | 状態 |
|------|------|------|
| `ADMIN_VIEW_TOKEN` | API 認証の基盤トークン（ログイン成功時に cookie と共に発行） | 既存 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-side | 既存 |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase client-side | 既存 |
| `TEACHER_USERNAME` | 教員ログイン ID | **ユーザーが要設定** |
| `TEACHER_PASSWORD` | 教員ログイン PW | **ユーザーが要設定** |
| `CRON_SECRET` | Vercel Cron 認証 | **ユーザーが要設定** |

設定後に Redeploy 必須（環境変数は即時反映されない）。

---

## 5. ユーザーが行う必要がある手動操作

### 5.1 Vercel（Environment Variables）
1. `TEACHER_USERNAME` / `TEACHER_PASSWORD` / `CRON_SECRET` を Production に追加
2. Redeploy（キャッシュ無効化推奨）

Hobby プランでは "Development" チェックに鍵マーク付く場合あり — Production のみ有効で OK。

### 5.2 Supabase（Authentication）
**Step A**: Dashboard で Anonymous Sign-in 有効化
- Authentication > Sign In / Providers 画面（UI バージョンにより Authentication > Providers > Email 展開内、または Authentication > Settings 内の場合あり）
- "Allow anonymous sign-ins" トグルを ON → Save
- URL 直打ち: `https://supabase.com/dashboard/project/qebmrgfkogciwurvnccr/auth/providers`

**Step B**: Migration 004 を SQL Editor で実行
- Step A 完了から 1-2 日後推奨（ユーザー端末への新クライアント浸透を待つ）
- SQL Editor で `supabase/migrations/004_rls_tighten.sql` を実行
- 実行後の確認: Authentication > Policies で word_stats / srs_state の 3 ポリシー × 2 テーブル = 6 ポリシーが揃っている

### 5.3 PowerShell での CRON_SECRET 生成
openssl が無い環境用代替:
```powershell
[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

---

## 6. 確認事項・動作確認チェックリスト

| 項目 | 期待挙動 | 確認方法 |
|------|----------|----------|
| 主要バンドルがロードされる | 学校ネットワーク含めて HomeV3 が表示 | `/` にアクセス |
| Service Worker が自壊 | DevTools > Application > Service Workers が空 | 初回アクセス後に確認 |
| 単語クイズが動く | データ fetch 失敗せず、問題が出題される | `/quiz` にアクセス |
| Anonymous Sign-in 成功 | Console に `[anonAuth]` エラー無し | F12 確認 |
| word_stats に UUID 形式で記録 | Supabase Table Editor で `auth.uid` 型 | 解答後にテーブル確認 |
| 教員ログイン成功 | ログイン後ダッシュボードが開く | `/quiz/teacher` で ID/PW 入力 |
| `admin_session` cookie 発行 | HttpOnly ✓、Secure ✓、SameSite=Strict | DevTools > Application > Cookies |
| 教員ログアウト | 両 cookie 削除 + ログイン画面へ | 教員画面のログアウトボタン |
| Vercel Cron が認証通過 | aggregateCandidates 手動実行で 200 OK | Vercel Dashboard > Crons |
| Pull-to-Refresh | 下ドラッグでハードリロード | モバイル実機 |

---

## 7. 未解決・残課題

### 7.1 学校ネットワーク環境の残リスク
- `examples.json` / `texts/*.json` / `vocab/*.html` は runtime fetch のまま。Umbrella が .json / .html を通すなら問題ないが、通さない場合は同様の bundle 化が必要
- 上記の確認はユーザー動作確認待ち

### 7.2 C-8 Step 2（レガシー削除）
- 1-2 週間運用後、`x-admin-token` header / `?token=` query / localStorage 経路を完全削除
- `api/_requireStaff.ts` のレガシーパス削除、`Teacher.tsx` の getToken / clearAdminToken / localStorage.setItem 廃止
- `App.tsx` `hasAdminSession()` の localStorage フォールバック除去

### 7.3 C-7 Phase 4-b（データ移行）
- 既存 `anon_*` 行を新 `auth.uid` に紐付ける移行ロジック（オプション）
- service_role で UPDATE する API endpoint（`textPublications.ts` に action="migrate" として同居可能）

### 7.4 コード整理（保守性向上）
- `App.tsx` 1700+ 行の肥大 → モード別ファイル分割
- `IdentificationDrill.tsx`（隣接 kobun-katsuyo の 56KB）は別タスク
- `tests` が空 — vitest セットアップ済みだがテストなし

---

## 8. 教訓・申し送り（次回セッション向け）

### 8.1 デプロイ前に Vercel Functions 数を数える
- `_*.ts` は除外、それ以外の `api/*.ts` を `ls` で数える
- 12 以上になる予定なら同居パターン（action ベース routing）を最初から設計
- この問題で 1 回デプロイ失敗 → refactor → 再デプロイ の往復が発生した

### 8.2 学校ネットワーク環境は最初から想定
- Umbrella / Zscaler などの SWG は珍しくない
- PWA の Service Worker は特に影響を受けやすい（`importScripts` 経由のリダイレクト検査）
- 初期設計から「追加 fetch を減らす」「SW に依存しない」を意識
- 教材アプリで PWA offline が必須でない限り、SW は selfDestroying / disable 推奨

### 8.3 Supabase UI は頻繁に変わる
- Anonymous Sign-in の設定場所は UI バージョンで 3 パターン存在
- 案内は URL 直打ち（`/auth/providers`）と複数パターンを併記すべき

### 8.4 段階移行 / 両方受付パターンの価値
- C-8 の cookie 化を両方受付で実装したおかげで、既存セッションを壊さず段階移行できた
- 本番稼働中アプリの認証変更は必ずこのパターンを採用

### 8.5 既存のコミットされていない作業が積もっている
- セッション開始時の git status は `?? docs/`、`?? public/vocab/`、`?? src/lib/kobun/` など大量の未トラックファイル
- 実質 Firebase→Supabase マイグレーション + 新 UI 構造（HomeV3 等）が未コミットで存在
- 一回の大きなコミットで清算した（`376a9b0`）
- 次セッション以降は小さく頻繁にコミットが望ましい

### 8.6 .env.local / .env.production の tracking 問題
- 発見: .gitignore に書かれていても過去に commit されていたため tracking 継続
- `git rm --cached` で unstage、secrets は生きたまま維持
- 過去の commit には secrets が残存している可能性（履歴 purge は未実施）
- 定期的に `git ls-files | grep env` で確認を

### 8.7 PullToRefresh が役立った
- 本セッション中、ユーザー端末のキャッシュクリアを何度も依頼したが、実装済みの Pull-to-Refresh で簡単に突破できた
- 次世代 PWA での必須機能

---

## 9. ファイル変更サマリ

### 新規作成
- `src/components/PullToRefresh.tsx`
- `src/lib/anonAuth.ts`
- `src/data/kobunQ.json`
- `supabase/migrations/004_rls_tighten.sql`
- `docs/DEVLOG_2026-04.md`（既存、本ファイルは別名で追加）

### 修正
- `.gitignore`（vite timestamp / tsbuildinfo 追加、env 除外維持）
- `api/_requireStaff.ts`（cookie + CSRF + CRON_SECRET 対応）
- `api/textPublications.ts`（login / logout action 同居）
- `data/kobun_q.jsonl.txt`（空 sense 削除、group 43 移設）
- `public/kobun_q.jsonl.txt`（同上、ミラー）
- `package.json`（build:* npm scripts 追加）
- `src/App.tsx`（updateSrsState 配線、hasAdminSession、章UI削除）
- `src/lib/srsEngine.ts`（async getUserId 対応）
- `src/lib/wordStats.ts`（async getUserId）
- `src/main.tsx`（PullToRefresh / ensureAnonSession 起動）
- `src/pages/SearchPage.tsx`（章フィルタUI削除）
- `src/pages/Teacher.tsx`（ID/PW ログイン、cookie化、ログアウト、絞込一括）
- `src/utils/dataParser.ts`（bundle import 化）
- `vercel.json`（crons エントリ）
- `vite.config.ts`（selfDestroying SW）

### 削除
- `.env.local` / `.env.production`（tracking 解除、ローカルファイル自体は残存）
- `api/_firebaseAdmin.ts`
- `api/overrideAnswer.test.ts`
- `api/upsertOverride.test.ts`
- `firestore.indexes.json`
- `vite.config.d.ts`
- `vite.config.js`

---

## 10. 本番デプロイ履歴

| 時刻（UTC） | Deploy URL | 概要 |
|------|-----|------|
| 1回目 | (失敗) | 12 関数上限超過 |
| 2回目 | `kobun-nb67vc6jd-...` | fix: teacherLogin 統合 |
| 3回目 | `kobun-e24xsiobr-...` | C-7 + C-8 Step 1 |
| 4回目 | `kobun-m4tggeofl-...` | polish |
| 5回目 | `kobun-7trqq41dp-...` | kobun_q bundle 化 |
| 6回目 | `kobun-8e4hp62h3-...` | SW selfDestroying |

alias: `kobun-tan-delta.vercel.app` は最新（6回目）にフォワード。

---

**ログ作成日**: 2026-04-23
**セッション終了時点の git HEAD**: `44e211b fix: Service Worker を selfDestroying に切替`
