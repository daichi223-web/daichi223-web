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
  - `assets-src/portraits/` は `.gitignore` に無く、肖像の原本が 250MB ある。
    一括 add すると履歴に入って戻せない
  - 同じ作業ツリーを別のエージェントと共有している（下記）。担当外の変更を巻き込まない
- push は人の承認を得てから。Vercel Hobby は commit の author email が verified と
  一致しないと deploy が ERROR になるので、push 前に `git config user.email` を確かめる
- コミット前に `git status` を見て、意図しないファイルが混ざっていないか確かめる

## いま並行で動いている作業（2026-09-07）

| 担当 | 触っている範囲 |
|---|---|
| CODEX | 位階システム = `src/lib/nobleData.ts` / `src/lib/portraitTone.ts` / `src/components/noble/` / `public/portraits/` / `assets-src/portraits/` / `docs/noble-rank-system.md` |
| Claude Code | 読解教材データ = `public/texts-v3/` / `public/analysis/` / `public/reading/` / `scripts/check-texts.mjs` ほか検査・修正スクリプト |

**自分の担当外のファイルは add もコミットもしない。** 作業が終わったらこの表を更新する。

## 環境

- 作業機は RAM 8GB。並列エージェントは最大3本、重い処理は逐次。画像・PDF は開かない
- F: は FAT32（単一ファイル 4GB 上限・シンボリックリンク不可）
- `.env*`・鍵ファイルは読まない・出力しない・コミットしない

## 注意

- ルート直下の `test-*.html`・`kobun-app-*.html`・`範囲選択*.txt` は過去の試行の残骸。参照も編集もしない
- 大きなバイナリ（動画等）は Supabase Storage に置かない（egress 超過の実績あり。R2 へ）
