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
| CODEX | 位階システム = `src/lib/nobleData.ts` / `src/lib/portraitTone.ts` / `src/components/noble/` / `public/portraits/` / `assets-src/portraits/` / `docs/noble-rank-system.md` |
| Claude Code | 読解教材データ = `public/texts-v3/` / `public/analysis/` / `public/reading/` / `scripts/check-texts.mjs` ほか検査・修正スクリプト |

- **担当外のファイルは add もコミットもしない**。`git add -A` / `git add .` は使わず名指しで add する
- 肖像の原本（`assets-src/portraits/`）は **git で持つ**（`.gitignore` に入れない）。
  PNG は1世代 約139MB で履歴は縮まないので、試作は入れず採用版だけ commit する
- 作業が終わったらこの表と `AGENTS.md` の同じ表を更新する

## 注意

- ルート直下の `test-*.html`・`kobun-app-*.html`・`範囲選択*.txt` は過去の試行の残骸。参照も編集もしない
- Supabase egress に注意：大きなバイナリ（動画等）は Supabase Storage に置かない（R2 へ）
