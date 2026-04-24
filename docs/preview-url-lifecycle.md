# プレビュー URL のライフサイクル

kobun-tan の期間限定テスト公開用 URL の作成・管理・失効手順。

## 現在稼働中

| 項目 | 値 |
|---|---|
| ブランチ名 | `preview-test` |
| 作成日 | 2026-04-25 |
| 生成元 | `git push origin preview-test` |
| 予想される URL 形式 | `https://kobun-tan-git-preview-test-daichimorikawas-projects.vercel.app` |
| 実際の URL | Vercel Dashboard → Deployments で確認 |

## 作成手順（記録）

```bash
cd F:/A2A/apps-released/kobun-tan
git branch preview-test              # 現在 main から分岐
git push origin preview-test          # Vercel が自動プレビュー生成
```

### Vercel Deployment Protection の扱い

Project Settings → Deployment Protection が `All Deployments` 保護だと、
プレビュー URL で 401 認証壁が出る。**"Only Production"** に設定して
おくことでプレビューは誰でもアクセス可能になる。

## 非公開 (失効) 手順

**以下の A または B どちらかで即時無効化。**

### A. ブランチ削除（推奨・最短）

```bash
cd F:/A2A/apps-released/kobun-tan
git push origin --delete preview-test
```

- Vercel 側で自動的に該当プレビュー deployment が `Orphaned` 扱いになり
  数分以内にプレビュー URL が 410/404 で無効化
- ローカルブランチも削除する場合:

  ```bash
  git branch -D preview-test
  ```

### B. Vercel Dashboard から手動削除

1. Vercel Dashboard → Project `kobun-tan`
2. Deployments タブ
3. branch `preview-test` の deployment を選択
4. 右上「...」→ **Delete**
5. 必要に応じて GitHub 側でもブランチ削除

## 再公開したいとき

一度失効させた URL を再度公開する場合、ブランチを再作成すれば
**異なる URL**（hash が変わる）が発行される。前の URL は復旧できない。

```bash
git branch preview-test main
git push origin preview-test
```

## 別案（環境分離したいとき）

Supabase を本番と分けたい場合、Vercel の環境変数を branch 単位で
上書きできる。
- Production: 本番 Supabase
- Preview (`preview-test` branch のみ): テスト用 Supabase

Vercel Dashboard → Settings → Environment Variables で
"Preview → Git Branch → preview-test" を選択して個別設定。

## 運用メモ

- プレビュー URL は **誰でもアクセス可能** にできるが、データは
  **本番 Supabase に書き込まれる**点に注意（別環境にしない限り）
- `text_publications` テーブルで公開管理している教材は、プレビューでも
  同じ公開設定が適用される
- プレビュー URL を SNS 等に拡散させない。共有は信頼できる相手にのみ
- テスト終了したら忘れず `git push origin --delete preview-test`

---

**ログ作成日**: 2026-04-25
**次回参照**: 非公開にしたいと依頼されたら **A. ブランチ削除** を案内
