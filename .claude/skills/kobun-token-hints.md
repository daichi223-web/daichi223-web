---
name: kobun-token-hints
description: kobun-tan 教材の texts-v3/{id}.json のトークンに学習ポイント (token.hint) を付与し、対応する NotebookLM MD にも差分を逆反映する。GrammarPopover の「重要ポイント」黄色枠を充実させるためのパイプライン。
triggers:
  - "トークンの重要ポイント"
  - "token.hint 拡充"
  - "語の重要ポイント"
  - "各レイヤーの重要ポイント"
  - "読解の解説を充実"
  - "kobun-tan hint enrichment"
---

# kobun-tan トークン重要ポイント拡充

kobun-tan の読解画面で token をタップすると `GrammarPopover` が開く。`token.hint` に値があるときだけ「重要ポイント」黄色枠が表示される。既存教材のほとんどは hint が空で、v3 からポートした 2 教材（ちごのそらね・絵仏師良秀）にのみ hint がある。このスキルで残り教材にも展開する。

## 対象

- テキスト JSON: `F:\A2A\apps-released\kobun-tan\public\texts-v3\{id}.json`
- 参照 MD: `F:\A2A\NotebookLM\kokugo-vault\30-教材\古文\**\*.md` (title で match)
- 追加先: 各 token の `hint` フィールド (string)

## 前提

- **既に完了した教材は再処理しない**。まずは下記コマンドで未処理教材を抽出:
  ```bash
  node -e "const d=require('./src/data/textsV3Index.json');const fs=require('fs');for(const t of d){const j=require(`./public/texts-v3/${t.id}.json`);let wh=0,tot=0;for(const s of j.sentences)for(const tok of s.tokens){tot++;if(tok.hint)wh++;}const pct=Math.round(wh/tot*100);if(pct<50)console.log(t.id,'|',t.title,'|',wh+'/'+tot,pct+'%');}" 2>&1 | head -20
  ```
- カバレッジ 50% 未満の教材が対象。50% 以上は既に充実していると判定。

## 追加対象の判定基準

各 token の `grammarTag` の内容により、**以下 5 カテゴリ**を優先的に hint 追加:

| カテゴリ | 判定条件 | hint 内容の方向性 |
|---|---|---|
| **1. 助動詞** | `grammarTag.pos === '助動詞'` もしくは pos に「助動」を含む | 意味・接続・活用型・識別ポイント |
| **2. 係助詞・副助詞** | `grammarTag.pos === '助詞'` かつ text が「ぞ/なむ/や/か/こそ/だに/さへ/のみ」等 | 係り結びの結び形、強調/疑問/反語など用法 |
| **3. 敬語動詞** | `grammarTag.pos === '動詞'` かつ baseForm が「たまふ/まゐる/まうす/おはす/さぶらふ」等 | 尊敬/謙譲/丁寧 + 敬意の方向 |
| **4. 変格動詞・重要動詞** | conjugationType に「サ変/カ変/ラ変/ナ変/下二段/上二段」 | 活用表の要点、代表形 |
| **5. 重要古今異義語** | 形容詞・名詞で、現代語と意味がずれるもの (すさまじ/あはれ/をかし/いみじ/わびし/おどろく/わろし/ずちなし 等) | 古文での意味と現代語との違い |

**スキップ対象**:
- 記号・固有名詞・数詞
- 一般名詞・代名詞（特殊意味が無い限り）
- 格助詞の一般用法（のみ/は/を/に/と 等で汎用）は本当に重要な場面のみ
- 既に hint がある token

## hint のスタイル

- **50〜120 字の 1 文**。冗長禁止
- 「辞書的定義」ではなく「学習者が覚えておくべきポイント」
- 文脈依存ではなく一般論として役立つ内容
- 同じ baseForm は同じ hint で統一
- 先頭に「助動詞「けり」:」「重要語「わびし」:」のようなラベルを付けると一覧性が上がる

### 良い例

```json
"hint": "助動詞「けり」: 伝聞過去 (〜た・〜たという) + 詠嘆 (〜だなあ)。連用形接続。物語の地の文で多用"
"hint": "重要語「わびし」: 現代語「侘しい」とは違う。「つらい・困った・やりきれない」が古語の基本義"
"hint": "係助詞「ぞ」: 強意。係り結びの結びは連体形。訳出不要が多い"
```

### 悪い例（避ける）

- 「これは助詞です」（自明、情報量ゼロ）
- 「春の訪れを喜ぶ気持ち」（文脈依存、一般化されていない）
- 「参照: [[語彙DB/けり]]」（リンクだけで解説がない）

## 実装手順

### 1. 対象教材の確認
未処理一覧から 1 本選ぶ。hint カバレッジが 0% に近いものを優先。

### 2. テキスト JSON を読む
tokens を全列挙し、各 hint 欠落トークンについて:
- `grammarTag.pos` を見る
- `text` / `grammarTag.baseForm` を確認
- 上記 5 カテゴリに該当するか判定

### 3. MD で背景確認（オプション）
`F:\A2A\NotebookLM\kokugo-vault\30-教材\古文\**` 以下で該当タイトルの MD を読み、その教材固有の重要語・文法テーマを把握。MD 独自の論点があれば hint に反映。

### 4. Edit ツールで追加
既存 `grammarTag` や `grammarRefId` の後ろに `"hint": "..."` を追加。JSON valid を保つ。

### 5. 検証
```bash
node -e "const t=require('./public/texts-v3/{id}.json');let t_=0,h_=0;for(const s of t.sentences)for(const tok of s.tokens){t_++;if(tok.hint)h_++;}console.log(t_,'tokens,',h_,'hints (',Math.round(h_/t_*100),'%)');"
```
カバレッジ 60-80% を目安とする。100% は情報過多で逆効果。

### 6. MD 側の逆反映

JSON hint に書いた内容が MD 側の記述より詳しい/新しい場合、MD にも加筆する:

- 新重要古語 → MD の「用語解説」テーブルに行を追加
- 新文法識別ポイント → 「学習ポイント > 文法の要点」の続き番号で追加
- 新敬語解説 → 「登場人物と敬語分析 > 敬語分析」に追記

**既存 MD の構造・番号体系を絶対に破壊しない**。追記のみ。

### 7. コミット

```bash
git add public/texts-v3/{id}.json "F:\A2A\NotebookLM\kokugo-vault\30-教材\古文\**\{title}.md"
git commit -m "feat: {教材名} トークン重要ポイント拡充 + MD 逆反映 (N hints added)"
git push origin main
```

## 参考実装

- `public/texts-v3/chigo-no-sorane.json` — 136/192 hints (71% カバー) の実例
- `public/texts-v3/31d11bf2f8.json` (絵仏師良秀) — v3 からポート済み、類似パターン

## 並列化のコツ

- 1 教材に付き **agent 1 体**、Write ツールで一括書き換え
- 一度に並列 5-8 本が経験上安定（rate limit 到達しない）
- バッチごとに `git commit` + `git push`、次バッチ起動の繰り返し

## 注意事項

- **v3 からポートした教材（chigo, ebutsu）は既に充実しているので再処理しない**
- tokens の分節は教材ごとに違うことがある（v3 13 文 vs tan 21 文 等）
- hint 追加後、GrammarPopover の黄色枠が increased token tap で表示されることを実機確認
- カバレッジ計測が drop する場合は validation failed を疑う（JSON パース失敗）
